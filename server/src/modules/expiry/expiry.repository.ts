import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import { classifyExpiry, type ExpiryStatus } from "../../utils/expiry.js";
import type { ExpiryMonitorQuery, ExpiryTrendsQuery } from "./expiry.validation.js";
import type {
  ExpiryBucket,
  ExpiryListRow,
  ExpiryMonitor,
  ExpiryMonitorTotals,
  ExpiryTrends,
  ExpiryWarehouseBreakdown,
} from "./expiry.types.js";

const ALL_BUCKETS: ExpiryStatus[] = ["EXPIRED", "CRITICAL", "WARNING", "MONITOR", "SAFE"];
const LIST_LIMIT = 100;

function emptyBuckets(): Record<ExpiryStatus, ExpiryBucket> {
  return Object.fromEntries(
    ALL_BUCKETS.map((b) => [b, { batches: 0, totalQuantity: 0 }]),
  ) as Record<ExpiryStatus, ExpiryBucket>;
}

function emptyWarehouseBuckets(): Record<ExpiryStatus, number> {
  return Object.fromEntries(ALL_BUCKETS.map((b) => [b, 0])) as Record<ExpiryStatus, number>;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Latest non-null receipt unit cost for each batch — the actual recorded
 * cost basis, never an estimate of a missing number. Batches without any
 * costed receipt stay cost-less (quantity-only in the UI). Shared with the
 * analytics module so waste value uses the same cost basis as value-at-risk.
 */
export async function getUnitCosts(batchIds: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (batchIds.length === 0) return new Map();
  const items = await prisma.receiptItem.findMany({
    where: { batchId: { in: batchIds }, unitCost: { not: null } },
    select: {
      batchId: true,
      unitCost: true,
      receipt: { select: { receivedAt: true } },
    },
    orderBy: [{ receipt: { receivedAt: "desc" } }, { createdAt: "desc" }],
  });
  const costs = new Map<string, Prisma.Decimal>();
  for (const item of items) {
    if (!costs.has(item.batchId)) costs.set(item.batchId, item.unitCost as Prisma.Decimal);
  }
  return costs;
}

export const expiryRepository = {
  /**
   * Expiry monitor. All quantities are ledger-derived (positive balances
   * only — a negative ledger balance is a reconciliation concern, not
   * stock at risk). Monetary figures multiply actual receipt unit costs
   * with Prisma.Decimal and are estimates by construction; batches
   * without cost data contribute quantity but never a fabricated value.
   */
  async getMonitor(query: ExpiryMonitorQuery): Promise<ExpiryMonitor> {
    const batches = await prisma.batch.findMany({
      where: {
        stockMovements: {
          some: {
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
          },
        },
        ...(query.productId ? { productId: query.productId } : {}),
      },
      include: { product: true },
      orderBy: { expiryDate: "asc" },
    });
    const batchIds = batches.map((b) => b.id);
    if (batchIds.length === 0) {
      return {
        buckets: emptyBuckets(),
        totals: {
          batchesWithStock: 0,
          totalQuantity: 0,
          estimatedValueAtRisk: 0,
          quantityWithCost: 0,
          quantityWithoutCost: 0,
        },
        warehouses: [],
        atRisk: [],
        expired: [],
      };
    }

    const [movements, costs] = await Promise.all([
      prisma.stockMovement.findMany({
        where: {
          batchId: { in: batchIds },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
        include: { warehouse: true },
        orderBy: { occurredAt: "asc" },
      }),
      getUnitCosts(batchIds),
    ]);

    // Group movements per (batch, warehouse), then derive each balance in
    // one pass with the shared ledger helper.
    const warehouseInfo = new Map<string, { name: string; code: string }>();
    const grouped = new Map<string, Array<{ movementType: Parameters<typeof calculateBalanceFromMovements>[0][number]["movementType"]; quantity: Prisma.Decimal | number }>>();
    for (const m of movements) {
      warehouseInfo.set(m.warehouseId, { name: m.warehouse.name, code: m.warehouse.code });
      const key = `${m.batchId}|${m.warehouseId}`;
      const list = grouped.get(key);
      if (list) list.push({ movementType: m.movementType, quantity: m.quantity });
      else grouped.set(key, [{ movementType: m.movementType, quantity: m.quantity }]);
    }
    const balances = new Map<string, Map<string, number>>(); // batchId -> warehouseId -> balance
    for (const [key, list] of grouped) {
      const [batchId, warehouseId] = key.split("|");
      let perWarehouse = balances.get(batchId!);
      if (!perWarehouse) {
        perWarehouse = new Map();
        balances.set(batchId!, perWarehouse);
      }
      perWarehouse.set(warehouseId!, calculateBalanceFromMovements(list));
    }

    const buckets = emptyBuckets();
    const totals: ExpiryMonitorTotals = {
      batchesWithStock: 0,
      totalQuantity: 0,
      estimatedValueAtRisk: 0,
      quantityWithCost: 0,
      quantityWithoutCost: 0,
    };
    const warehouseAgg = new Map<string, ExpiryWarehouseBreakdown>();
    const atRisk: ExpiryListRow[] = [];
    const expired: ExpiryListRow[] = [];
    let totalValue = new Prisma.Decimal(0);

    for (const batch of batches) {
      const perWarehouse = balances.get(batch.id) ?? new Map<string, number>();
      const { daysToExpiry: dte, expiryStatus: bucket } = classifyExpiry(batch.expiryDate);
      const cost = costs.get(batch.id) ?? null;

      let batchPositiveTotal = 0;
      let batchValue = new Prisma.Decimal(0);
      let batchHasCost = false;

      for (const [warehouseId, balance] of perWarehouse) {
        if (balance <= 0) continue; // zero stock is real but not at risk; negatives are inconsistencies
        batchPositiveTotal = round4(batchPositiveTotal + balance);
        const wh = warehouseInfo.get(warehouseId)!;

        const whAgg = warehouseAgg.get(warehouseId) ?? {
          warehouseId,
          warehouseName: wh.name,
          warehouseCode: wh.code,
          buckets: emptyWarehouseBuckets(),
          totalQuantity: 0,
          estimatedValueAtRisk: 0,
        };
        whAgg.buckets[bucket] = round4(whAgg.buckets[bucket] + balance);
        whAgg.totalQuantity = round4(whAgg.totalQuantity + balance);

        const row: ExpiryListRow = {
          batchId: batch.id,
          canonicalCode: batch.canonicalCode,
          batchStatus: batch.status,
          productId: batch.productId,
          productName: batch.product.name,
          productSku: batch.product.sku,
          productUnit: batch.product.unit,
          warehouseId,
          warehouseName: wh.name,
          warehouseCode: wh.code,
          expiryDate: batch.expiryDate,
          daysToExpiry: dte,
          expiryStatus: bucket,
          availableQuantity: balance,
          estimatedValue: null,
          unitCost: cost === null ? null : Number(cost),
        };

        if (cost !== null) {
          batchHasCost = true;
          const value = new Prisma.Decimal(balance.toFixed(4)).times(cost);
          batchValue = batchValue.plus(value);
          row.estimatedValue = Number(value.toFixed(4));
        }

        whAgg.estimatedValueAtRisk = round4(
          whAgg.estimatedValueAtRisk + (row.estimatedValue ?? 0),
        );
        warehouseAgg.set(warehouseId, whAgg);

        // Lists hold (batch, warehouse) rows with positive stock.
        if (dte <= 0) {
          if (!query.expiryStatus || query.expiryStatus === bucket) expired.push(row);
        } else if (dte <= 30) {
          if (!query.expiryStatus || query.expiryStatus === bucket) atRisk.push(row);
        }
      }

      if (batchPositiveTotal > 0) {
        totals.batchesWithStock += 1;
        const bucketAgg = buckets[bucket];
        bucketAgg.batches += 1;
        bucketAgg.totalQuantity = round4(bucketAgg.totalQuantity + batchPositiveTotal);
        totals.totalQuantity = round4(totals.totalQuantity + batchPositiveTotal);
        if (batchHasCost) {
          totals.quantityWithCost = round4(totals.quantityWithCost + batchPositiveTotal);
          totalValue = totalValue.plus(batchValue);
        } else {
          totals.quantityWithoutCost = round4(totals.quantityWithoutCost + batchPositiveTotal);
        }
      }
    }

    totals.estimatedValueAtRisk = Number(totalValue.toFixed(4));

    const byDte = (a: ExpiryListRow, b: ExpiryListRow) => a.daysToExpiry - b.daysToExpiry;

    return {
      buckets,
      totals,
      warehouses: [...warehouseAgg.values()].sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode)),
      atRisk: atRisk.sort(byDte).slice(0, LIST_LIMIT),
      expired: expired.sort(byDte).slice(0, LIST_LIMIT),
    };
  },

  /**
   * Historical expiry-related waste trends from actual waste records —
   * no synthetic or extrapolated events. "Expired" waste means records
   * with reason EXPIRED; the response always carries the full reason
   * breakdown for context.
   */
  async getTrends(query: ExpiryTrendsQuery): Promise<ExpiryTrends> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (query.months - 1), 1);

    const records = await prisma.wasteRecord.findMany({
      where: {
        recordedAt: { gte: start, lte: now },
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.productId ? { batch: { productId: query.productId } } : {}),
      },
      include: {
        batch: { include: { product: true } },
        warehouse: true,
      },
      orderBy: { recordedAt: "asc" },
    });

    // Month keys for the local calendar across the window, oldest first.
    const monthKeys: string[] = [];
    for (let i = 0; i < query.months; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - (query.months - 1 - i), 1);
      monthKeys.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    const keyOf = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const seriesMap = new Map(monthKeys.map((m) => [m, { expiredQuantity: 0, expiredRecords: 0, totalWasteQuantity: 0 }]));
    const byReason = new Map<string, { records: number; quantity: number }>();
    const byWarehouse = new Map<string, { name: string; code: string; expiredQuantity: number; totalWasteQuantity: number }>();
    const byProduct = new Map<string, { name: string; code: string; expiredQuantity: number; totalWasteQuantity: number }>();

    for (const record of records) {
      const qty = Number(record.quantity);
      const month = keyOf(record.recordedAt);
      const seriesEntry = seriesMap.get(month);
      if (seriesEntry) {
        seriesEntry.totalWasteQuantity = round4(seriesEntry.totalWasteQuantity + qty);
        if (record.reason === "EXPIRED") {
          seriesEntry.expiredQuantity = round4(seriesEntry.expiredQuantity + qty);
          seriesEntry.expiredRecords += 1;
        }
      }

      const reasonAgg = byReason.get(record.reason) ?? { records: 0, quantity: 0 };
      reasonAgg.records += 1;
      reasonAgg.quantity = round4(reasonAgg.quantity + qty);
      byReason.set(record.reason, reasonAgg);

      const whAgg = byWarehouse.get(record.warehouseId) ?? {
        name: record.warehouse.name,
        code: record.warehouse.code,
        expiredQuantity: 0,
        totalWasteQuantity: 0,
      };
      whAgg.totalWasteQuantity = round4(whAgg.totalWasteQuantity + qty);
      if (record.reason === "EXPIRED") whAgg.expiredQuantity = round4(whAgg.expiredQuantity + qty);
      byWarehouse.set(record.warehouseId, whAgg);

      const prodAgg = byProduct.get(record.batch.productId) ?? {
        name: record.batch.product.name,
        code: record.batch.product.sku,
        expiredQuantity: 0,
        totalWasteQuantity: 0,
      };
      prodAgg.totalWasteQuantity = round4(prodAgg.totalWasteQuantity + qty);
      if (record.reason === "EXPIRED") prodAgg.expiredQuantity = round4(prodAgg.expiredQuantity + qty);
      byProduct.set(record.batch.productId, prodAgg);
    }

    let expiredQuantity = 0;
    let expiredRecords = 0;
    let totalWasteQuantity = 0;
    for (const entry of seriesMap.values()) {
      expiredQuantity = round4(expiredQuantity + entry.expiredQuantity);
      expiredRecords += entry.expiredRecords;
      totalWasteQuantity = round4(totalWasteQuantity + entry.totalWasteQuantity);
    }

    return {
      months: query.months,
      series: monthKeys.map((month) => ({ month, ...(seriesMap.get(month)!) })),
      totals: { expiredQuantity, expiredRecords, totalWasteQuantity },
      byReason: [...byReason.entries()].map(([reason, agg]) => ({ reason, ...agg })),
      byWarehouse: [...byWarehouse.entries()].map(([id, agg]) => ({
        id,
        name: agg.name,
        code: agg.code,
        expiredQuantity: agg.expiredQuantity,
        totalWasteQuantity: agg.totalWasteQuantity,
      })),
      byProduct: [...byProduct.entries()].map(([id, agg]) => ({
        id,
        name: agg.name,
        code: agg.code,
        expiredQuantity: agg.expiredQuantity,
        totalWasteQuantity: agg.totalWasteQuantity,
      })),
    };
  },
};
