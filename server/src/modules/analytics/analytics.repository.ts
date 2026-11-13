import { Prisma, MovementType } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import { getUnitCosts } from "../expiry/expiry.repository.js";
import { expiryRepository } from "../expiry/expiry.repository.js";
import type { AnalyticsQuery, AnalyticsPeriod } from "./analytics.validation.js";
import type {
  AnalyticsMovementBucket,
  AnalyticsSummary,
} from "./analytics.types.js";

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function localMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Window and bucket keys against the server's local calendar (the ledger's
 * convention): day buckets for 7d/30d/90d, month buckets for 12m. The
 * current (partial) day/month is included.
 */
function windowOf(period: AnalyticsPeriod, now: Date): {
  from: Date;
  keys: string[];
  granularity: "day" | "month";
  keyOf: (d: Date) => string;
} {
  if (period === "12m") {
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const keys: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return {
      from,
      keys,
      granularity: "month",
      keyOf: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const from = localMidnight(now);
  from.setDate(from.getDate() - (days - 1));
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = localMidnight(now);
    d.setDate(d.getDate() - (days - 1 - i));
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return {
    from,
    keys,
    granularity: "day",
    keyOf: (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  };
}

function emptyBucket(date: string): AnalyticsMovementBucket {
  return {
    date,
    receipts: 0,
    dispatches: 0,
    transfersIn: 0,
    transfersOut: 0,
    adjustments: 0,
  };
}

/**
 * Analytics summary — every figure is derived from the immutable
 * StockMovement ledger, WasteRecord and DispatchItem tables. No persisted
 * analytics tables, no forecasting, no invented values.
 *
 * Methodology notes (also surfaced in the API docs):
 * - Current-stock figures include all batch statuses (quarantined/recalled
 *   stock is still physically held); only positive ledger balances count —
 *   negative balances are reconciliation concerns, not stock.
 * - TRANSFER_IN / TRANSFER_OUT are the two legs of the same transfer and
 *   are reported separately; they are never summed into a combined total,
 *   so transfers are not double-counted.
 * - Waste analytics come from WasteRecord (which carries reason and
 *   recordedAt); the WASTE leg of the ledger reconciles with it.
 * - Monetary figures multiply actual receipt unit costs (latest costed
 *   receipt per batch, shared with the expiry module) with Prisma.Decimal;
 *   batches/lines without cost data contribute quantity only — a value of
 *   `null` explicitly means "no cost data", never "zero value".
 * - Movement/waste/dispatch aggregation is computed in memory over the
 *   (bounded) query window; this is fine for MVP data volumes but is the
 *   first thing to move into SQL aggregation if windows grow.
 */
export const analyticsRepository = {
  async getSummary(query: AnalyticsQuery): Promise<AnalyticsSummary> {
    const now = new Date();
    const { from, keys, granularity, keyOf } = windowOf(query.period, now);
    const to = now;

    const batchFilter = { ...(query.productId ? { productId: query.productId } : {}) };
    const movementWindow = {
      occurredAt: { gte: from, lte: to },
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      batch: batchFilter,
    };

    // ---------- Current stock (time-independent, filter-scoped) ----------
    const currentBatches = await prisma.batch.findMany({
      where: {
        ...batchFilter,
        stockMovements: {
          some: { ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
        },
      },
      include: { product: true },
    });
    const currentMovements = currentBatches.length
      ? await prisma.stockMovement.findMany({
          where: {
            batchId: { in: currentBatches.map((b) => b.id) },
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
          },
          select: { batchId: true, warehouseId: true, movementType: true, quantity: true },
        })
      : [];

    const grouped = new Map<string, Array<{ movementType: MovementType; quantity: Prisma.Decimal | number }>>();
    for (const m of currentMovements) {
      const key = `${m.batchId}|${m.warehouseId}`;
      const list = grouped.get(key);
      if (list) list.push({ movementType: m.movementType, quantity: m.quantity });
      else grouped.set(key, [{ movementType: m.movementType, quantity: m.quantity }]);
    }

    const perProduct = new Map<string, number>();
    const perCategory = new Map<string, { products: Set<string>; quantity: number }>();
    const perWarehouse = new Map<string, number>();
    const activeProductIds = new Set<string>();
    const activeWarehouseIds = new Set<string>();
    const productIdOfBatch = new Map(currentBatches.map((b) => [b.id, b.productId]));
    const categoryOfBatch = new Map(currentBatches.map((b) => [b.id, b.product.category]));
    let totalStockQuantity = 0;

    for (const [key, list] of grouped) {
      const [batchId, warehouseId] = key.split("|");
      const balance = calculateBalanceFromMovements(list);
      if (balance <= 0) continue; // zero/negative ledger balances are not stock
      totalStockQuantity = round4(totalStockQuantity + balance);
      activeProductIds.add(productIdOfBatch.get(batchId!)!);
      activeWarehouseIds.add(warehouseId!);
      perProduct.set(productIdOfBatch.get(batchId!)!, round4((perProduct.get(productIdOfBatch.get(batchId!)!) ?? 0) + balance));
      perWarehouse.set(warehouseId!, round4((perWarehouse.get(warehouseId!) ?? 0) + balance));
      const category = categoryOfBatch.get(batchId!)!;
      const cat = perCategory.get(category) ?? { products: new Set<string>(), quantity: 0 };
      cat.products.add(productIdOfBatch.get(batchId!)!);
      cat.quantity = round4(cat.quantity + balance);
      perCategory.set(category, cat);
    }

    // Warehouse names for the breakdowns (stock + dispatch + waste).
    const warehouseIdsInScope = [...new Set([...activeWarehouseIds])];
    const warehouses = warehouseIdsInScope.length
      ? await prisma.warehouse.findMany({
          where: { id: { in: warehouseIdsInScope } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

    // ---------- Movement analytics over the window ----------
    const windowMovements = await prisma.stockMovement.findMany({
      where: movementWindow,
      select: { movementType: true, quantity: true, occurredAt: true },
    });
    const seriesMap = new Map(keys.map((k) => [k, emptyBucket(k)]));
    const movementTotals = {
      receipts: 0,
      dispatches: 0,
      transfersIn: 0,
      transfersOut: 0,
      adjustments: 0,
      records: windowMovements.length,
    };
    for (const m of windowMovements) {
      const bucket = seriesMap.get(keyOf(m.occurredAt));
      if (!bucket) continue; // outside the generated key range (defensive)
      const qty = Number(m.quantity);
      switch (m.movementType) {
        case "RECEIPT":
          bucket.receipts = round4(bucket.receipts + qty);
          movementTotals.receipts = round4(movementTotals.receipts + qty);
          break;
        case "DISPATCH":
          bucket.dispatches = round4(bucket.dispatches + qty);
          movementTotals.dispatches = round4(movementTotals.dispatches + qty);
          break;
        case "TRANSFER_IN":
          bucket.transfersIn = round4(bucket.transfersIn + qty);
          movementTotals.transfersIn = round4(movementTotals.transfersIn + qty);
          break;
        case "TRANSFER_OUT":
          bucket.transfersOut = round4(bucket.transfersOut + qty);
          movementTotals.transfersOut = round4(movementTotals.transfersOut + qty);
          break;
        case "ADJUSTMENT":
          bucket.adjustments = round4(bucket.adjustments + qty);
          movementTotals.adjustments = round4(movementTotals.adjustments + qty);
          break;
        default:
          break; // WASTE is covered by the WasteRecord section below
      }
    }

    // ---------- Waste analytics over the window ----------
    const wasteRecords = await prisma.wasteRecord.findMany({
      where: {
        recordedAt: { gte: from, lte: to },
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        batch: batchFilter,
      },
      include: { batch: { select: { productId: true } } },
      orderBy: { recordedAt: "asc" },
    });
    const costs = await getUnitCosts([...new Set(wasteRecords.map((r) => r.batchId))]);
    const byReason = new Map<string, { records: number; quantity: number }>();
    const wasteByWarehouse = new Map<string, number>();
    let wasteTotal = 0;
    let wasteWithCostQty = 0;
    let wasteValue = new Prisma.Decimal(0);
    let wasteHasCost = false;
    for (const r of wasteRecords) {
      const qty = Number(r.quantity);
      wasteTotal = round4(wasteTotal + qty);
      wasteByWarehouse.set(r.warehouseId, round4((wasteByWarehouse.get(r.warehouseId) ?? 0) + qty));
      const reason = byReason.get(r.reason) ?? { records: 0, quantity: 0 };
      reason.records += 1;
      reason.quantity = round4(reason.quantity + qty);
      byReason.set(r.reason, reason);
      const cost = costs.get(r.batchId);
      if (cost !== undefined) {
        wasteHasCost = true;
        wasteWithCostQty = round4(wasteWithCostQty + qty);
        wasteValue = wasteValue.plus(new Prisma.Decimal(r.quantity.toFixed(4)).times(cost));
      }
    }

    // ---------- Dispatch analytics over the window ----------
    const dispatchItems = await prisma.dispatchItem.findMany({
      where: {
        ...(query.productId ? { productId: query.productId } : {}),
        dispatch: {
          dispatchedAt: { gte: from, lte: to },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
      },
      select: {
        productId: true,
        dispatchId: true,
        quantity: true,
        dispatch: { select: { warehouseId: true } },
      },
    });
    const productAgg = new Map<string, { quantity: number; dispatches: Set<string> }>();
    const dispatchByWarehouse = new Map<string, number>();
    for (const item of dispatchItems) {
      const agg = productAgg.get(item.productId) ?? { quantity: 0, dispatches: new Set<string>() };
      agg.quantity = round4(agg.quantity + Number(item.quantity));
      agg.dispatches.add(item.dispatchId);
      productAgg.set(item.productId, agg);
      dispatchByWarehouse.set(
        item.dispatch.warehouseId,
        round4((dispatchByWarehouse.get(item.dispatch.warehouseId) ?? 0) + Number(item.quantity)),
      );
    }
    const topProductIds = [...productAgg.entries()]
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 5)
      .map(([id]) => id);
    const topProducts = topProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productMap = new Map(topProducts.map((p) => [p.id, p]));
    // Warehouse labels for dispatch/waste breakdowns may include warehouses
    // outside the current-stock scope; resolve them too.
    const extraWarehouseIds = [
      ...new Set([...dispatchByWarehouse.keys(), ...wasteByWarehouse.keys()]),
    ].filter((id) => !warehouseMap.has(id));
    if (extraWarehouseIds.length) {
      const extra = await prisma.warehouse.findMany({
        where: { id: { in: extraWarehouseIds } },
        select: { id: true, name: true, code: true },
      });
      for (const w of extra) warehouseMap.set(w.id, w);
    }

    // ---------- Expiry intelligence (shared module, same filters) ----------
    const monitor = await expiryRepository.getMonitor({
      warehouseId: query.warehouseId,
      productId: query.productId,
    });

    const receivedQuantity = movementTotals.receipts;
    const wasteQuantityWithCost = wasteWithCostQty;

    return {
      period: query.period,
      granularity,
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
      inventory: {
        totalStockQuantity,
        activeProducts: activeProductIds.size,
        activeWarehouses: activeWarehouseIds.size,
        byCategory: [...perCategory.entries()]
          .map(([category, agg]) => ({ category, products: agg.products.size, quantity: agg.quantity }))
          .sort((a, b) => b.quantity - a.quantity),
        byWarehouse: warehouseIdsInScope
          .map((id) => ({
            warehouseId: id,
            warehouseName: warehouseMap.get(id)?.name ?? "Unknown",
            warehouseCode: warehouseMap.get(id)?.code ?? "?",
            quantity: perWarehouse.get(id) ?? 0,
          }))
          .sort((a, b) => b.quantity - a.quantity),
      },
      movements: {
        series: keys.map((k) => seriesMap.get(k)!),
        totals: movementTotals,
      },
      waste: {
        totalQuantity: wasteTotal,
        records: wasteRecords.length,
        byReason: [...byReason.entries()]
          .map(([reason, agg]) => ({ reason, ...agg }))
          .sort((a, b) => b.quantity - a.quantity),
        byWarehouse: [...wasteByWarehouse.entries()]
          .map(([id, quantity]) => ({
            warehouseId: id,
            warehouseName: warehouseMap.get(id)?.name ?? "Unknown",
            warehouseCode: warehouseMap.get(id)?.code ?? "?",
            quantity,
          }))
          .sort((a, b) => b.quantity - a.quantity),
        receivedQuantity,
        wastePercentOfReceived:
          receivedQuantity > 0 ? round4((wasteTotal / receivedQuantity) * 100) : null,
        estimatedValue: wasteHasCost ? Number(wasteValue.toFixed(4)) : null,
        quantityWithCost: wasteQuantityWithCost,
        quantityWithoutCost: round4(wasteTotal - wasteQuantityWithCost),
      },
      expiry: {
        buckets: monitor.buckets,
        expiredQuantity: monitor.buckets.EXPIRED.totalQuantity,
        nearExpiryQuantity: round4(
          monitor.buckets.CRITICAL.totalQuantity +
            monitor.buckets.WARNING.totalQuantity +
            monitor.buckets.MONITOR.totalQuantity,
        ),
        estimatedValueAtRisk: monitor.totals.estimatedValueAtRisk,
        quantityWithCost: monitor.totals.quantityWithCost,
        quantityWithoutCost: monitor.totals.quantityWithoutCost,
      },
      dispatch: {
        topProducts: topProductIds.map((id) => ({
          productId: id,
          productName: productMap.get(id)?.name ?? "Unknown",
          productSku: productMap.get(id)?.sku ?? "?",
          dispatches: productAgg.get(id)!.dispatches.size,
          quantity: productAgg.get(id)!.quantity,
        })),
        byWarehouse: [...dispatchByWarehouse.entries()]
          .map(([id, quantity]) => ({
            warehouseId: id,
            warehouseName: warehouseMap.get(id)?.name ?? "Unknown",
            warehouseCode: warehouseMap.get(id)?.code ?? "?",
            quantity,
          }))
          .sort((a, b) => b.quantity - a.quantity),
      },
    };
  },
};
