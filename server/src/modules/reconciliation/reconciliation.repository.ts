import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { daysToExpiry, expiryStatus } from "../../utils/expiry.js";
import { calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import type { ReconciliationQuery, ReconciliationCondition } from "./reconciliation.validation.js";
import type {
  ReconciliationBatchRow,
  ReconciliationMovement,
  ReconciliationOpenVariance,
  ReconciliationWarehouseStock,
} from "./reconciliation.types.js";

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Batch rows are paginated at DB level for plain browsing, but condition
 * filters, expiryStatus filters and totalQuantity sorting depend on
 * ledger-derived values, so those requests scan all candidate batches and
 * paginate in memory. Batches are a small table in this system; this keeps
 * counts exact without denormalizing derived state.
 */
function needsScan(query: ReconciliationQuery): boolean {
  return query.condition !== undefined || query.expiryStatus !== undefined || query.sortBy === "totalQuantity";
}

const OPEN_COUNT_STATUSES = ["SUBMITTED", "APPROVED"] as const;

type BatchWithRelations = Prisma.BatchGetPayload<{
  include: { product: true; aliases: { include: { warehouse: true } } };
}>;

/**
 * Builds the batch rows for the given batches from their immutable movement
 * ledger, warehouse aliases and open (submitted/approved, not yet posted)
 * stock-count variances. All quantities come from calculateBalanceFromMovements
 * — nothing here ever reads or writes a stored balance.
 */
async function buildRows(
  batches: BatchWithRelations[],
  query: ReconciliationQuery,
): Promise<ReconciliationBatchRow[]> {
  if (batches.length === 0) return [];
  const batchIds = batches.map((b) => b.id);

  const [movements, varianceItems] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        batchId: { in: batchIds },
        // When scoped to a warehouse, both the balances and the movement
        // history shown must be that warehouse's — same convention as the
        // inventory list module.
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      include: { warehouse: true },
      orderBy: { occurredAt: "asc" },
    }),
    // "Open" variance: a submitted or approved count that has not been
    // posted yet (posting writes ADJUSTMENT movements and closes the gap).
    // REJECTED/PENDING/POSTED counts are not open discrepancies.
    prisma.stockCountItem.findMany({
      where: {
        batchId: { in: batchIds },
        variance: { not: 0 },
        stockCount: {
          status: { in: [...OPEN_COUNT_STATUSES] },
          postedAt: null,
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
      },
      include: { stockCount: { include: { warehouse: true } } },
    }),
  ]);

  // Group movements per batch and warehouse.
  const movementsByBatch = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = movementsByBatch.get(m.batchId) ?? [];
    list.push(m);
    movementsByBatch.set(m.batchId, list);
  }

  const varianceByBatch = new Map<string, ReconciliationOpenVariance[]>();
  for (const item of varianceItems) {
    const list = varianceByBatch.get(item.batchId) ?? [];
    list.push({
      stockCountId: item.stockCountId,
      warehouseId: item.stockCount.warehouseId,
      warehouseName: item.stockCount.warehouse.name,
      warehouseCode: item.stockCount.warehouse.code,
      status: item.stockCount.status,
      referenceNo: item.stockCount.referenceNo,
      expectedQuantity: Number(item.expectedQuantity),
      countedQuantity: Number(item.countedQuantity),
      variance: Number(item.variance),
      countedAt: item.stockCount.countedAt,
      approvedAt: item.stockCount.approvedAt,
    });
    varianceByBatch.set(item.batchId, list);
  }

  const rows: ReconciliationBatchRow[] = [];

  for (const batch of batches) {
    const batchMovements = movementsByBatch.get(batch.id) ?? [];

    // Per-warehouse ledger balances. A warehouse with movement history but a
    // zero balance is still listed (zero stock is real; absence is not).
    const byWarehouse = new Map<string, { name: string; code: string; movements: typeof batchMovements }>();
    for (const m of batchMovements) {
      const entry = byWarehouse.get(m.warehouseId) ?? {
        name: m.warehouse.name,
        code: m.warehouse.code,
        movements: [],
      };
      entry.movements.push(m);
      byWarehouse.set(m.warehouseId, entry);
    }

    const warehouses: ReconciliationWarehouseStock[] = [];
    let totalQuantity = 0;
    let negativeBalance = false;
    let positiveStock = false;

    for (const [warehouseId, info] of byWarehouse) {
      const availableQuantity = calculateBalanceFromMovements(info.movements);
      if (availableQuantity < 0) negativeBalance = true;
      if (availableQuantity > 0) positiveStock = true;
      const aliasCodes = batch.aliases
        .filter((a) => a.warehouseId === warehouseId)
        .map((a) => a.externalCode);
      const aliasSources = batch.aliases
        .filter((a) => a.warehouseId === warehouseId)
        .map((a) => a.source);
      warehouses.push({
        warehouseId,
        warehouseName: info.name,
        warehouseCode: info.code,
        availableQuantity,
        aliasCodes,
        aliasSources,
      });
    }

    // Stable ordering: warehouse code, then by balance desc.
    warehouses.sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
    totalQuantity = round4(warehouses.reduce((acc, w) => acc + w.availableQuantity, 0));

    const recentMovements: ReconciliationMovement[] = [...batchMovements]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        warehouseId: m.warehouseId,
        warehouseName: m.warehouse.name,
        warehouseCode: m.warehouse.code,
        movementType: m.movementType,
        quantity: Number(m.quantity),
        referenceId: m.referenceId,
        occurredAt: m.occurredAt,
      }));

    const openVariances = varianceByBatch.get(batch.id) ?? [];
    const aliasCount = new Set(batch.aliases.map((a) => a.externalCode)).size;
    const warehouseCount = warehouses.filter((w) => w.availableQuantity > 0).length;
    const dte = daysToExpiry(batch.expiryDate);
    const expStatus = expiryStatus(dte);

    const conditions: ReconciliationCondition[] = [];
    if (warehouseCount > 1) conditions.push("MULTI_WAREHOUSE");
    if (aliasCount > 1) conditions.push("MULTI_ALIAS");
    if (dte <= 0 && positiveStock) conditions.push("EXPIRED_STOCK");
    if (openVariances.length > 0) conditions.push("OPEN_VARIANCE");
    if ((batch.status !== "ACTIVE" && positiveStock) || negativeBalance) {
      conditions.push("INCONSISTENT");
    }

    rows.push({
      batchId: batch.id,
      canonicalCode: batch.canonicalCode,
      batchStatus: batch.status,
      productId: batch.productId,
      productName: batch.product.name,
      productSku: batch.product.sku,
      productCategory: batch.product.category,
      productUnit: batch.product.unit,
      expiryDate: batch.expiryDate,
      daysToExpiry: dte,
      expiryStatus: expStatus,
      warehouses,
      totalQuantity,
      warehouseCount,
      aliasCount,
      openVariances,
      recentMovements,
      conditions,
    });
  }

  return rows;
}

function applyRowFilters(rows: ReconciliationBatchRow[], query: ReconciliationQuery): ReconciliationBatchRow[] {
  return rows.filter((row) => {
    if (query.condition && !row.conditions.includes(query.condition)) return false;
    if (query.expiryStatus && row.expiryStatus !== query.expiryStatus) return false;
    return true;
  });
}

function sortRows(rows: ReconciliationBatchRow[], query: ReconciliationQuery): ReconciliationBatchRow[] {
  const dir = query.sortOrder === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    switch (query.sortBy) {
      case "totalQuantity":
        return (a.totalQuantity - b.totalQuantity) * dir;
      case "expiryDate":
        return (a.expiryDate.getTime() - b.expiryDate.getTime()) * dir;
      case "productName":
        return a.productName.localeCompare(b.productName) * dir;
      case "productSku":
        return a.productSku.localeCompare(b.productSku) * dir;
      default:
        return a.canonicalCode.localeCompare(b.canonicalCode) * dir;
    }
  });
}

export const reconciliationRepository = {
  async getReconciliation(query: ReconciliationQuery): Promise<{ items: ReconciliationBatchRow[]; total: number }> {
    const batchWhere: Prisma.BatchWhereInput = {
      // Only batches with ledger history are reconciliable — a batch without
      // any movement is missing data, not zero stock, and never appears.
      stockMovements: {
        some: {
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
      },
      ...(query.batchId ? { id: query.batchId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.search
        ? {
            OR: [
              { canonicalCode: { contains: query.search, mode: "insensitive" } },
              { product: { name: { contains: query.search, mode: "insensitive" } } },
              { product: { sku: { contains: query.search, mode: "insensitive" } } },
              { aliases: { some: { externalCode: { contains: query.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    if (needsScan(query)) {
      const batches = await prisma.batch.findMany({
        where: batchWhere,
        include: {
          product: true,
          aliases: { include: { warehouse: true } },
        },
        orderBy: { canonicalCode: "asc" },
      });
      const rows = applyRowFilters(await buildRows(batches, query), query);
      const sorted = sortRows(rows, query);
      return {
        items: sorted.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        total: sorted.length,
      };
    }

    // Plain browsing: DB-level pagination with a DB-level sort on the batch
    // columns (the whitelist lives in the Zod schema).
    const orderBy: Prisma.BatchOrderByWithRelationInput = (() => {
      switch (query.sortBy) {
        case "productName":
          return { product: { name: query.sortOrder } };
        case "productSku":
          return { product: { sku: query.sortOrder } };
        case "expiryDate":
          return { expiryDate: query.sortOrder };
        default:
          return { canonicalCode: query.sortOrder };
      }
    })();

    const [batches, total] = await Promise.all([
      prisma.batch.findMany({
        where: batchWhere,
        include: {
          product: true,
          aliases: { include: { warehouse: true } },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.batch.count({ where: batchWhere }),
    ]);

    const items = await buildRows(batches, query);
    return { items, total };
  },

  /**
   * Global reconciliation overview (optionally warehouse-scoped). Derived
   * from the same ledger math as the list so the two can never disagree.
   */
  async getOverview(query: { warehouseId?: string }) {
    const batches = await prisma.batch.findMany({
      where: {
        stockMovements: {
          some: {
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
          },
        },
      },
      include: {
        product: true,
        aliases: { include: { warehouse: true } },
      },
    });

    const movements = await prisma.stockMovement.findMany({
      where: {
        batchId: { in: batches.map((b) => b.id) },
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      select: { batchId: true, warehouseId: true, movementType: true, quantity: true },
    });

    type LedgerMovement = (typeof movements)[number];

    // Group once by (batch, warehouse): per-warehouse balances feed the
    // multi-warehouse count, and the same rows re-aggregate per batch for
    // the overall total — one source of truth, no second query.
    const byWarehouse = new Map<string, LedgerMovement[]>();
    const byBatch = new Map<string, LedgerMovement[]>();
    for (const m of movements) {
      const whKey = `${m.batchId}|${m.warehouseId}`;
      const whList = byWarehouse.get(whKey);
      if (whList) whList.push(m);
      else byWarehouse.set(whKey, [m]);
      const batchList = byBatch.get(m.batchId);
      if (batchList) batchList.push(m);
      else byBatch.set(m.batchId, [m]);
    }

    const now = new Date();
    let batchesWithStock = 0;
    let multiWarehouseBatches = 0;
    let expiredStockBatches = 0;
    let totalQuantity = 0;

    for (const batch of batches) {
      const batchMovements = byBatch.get(batch.id) ?? [];
      if (batchMovements.length === 0) continue;
      totalQuantity += calculateBalanceFromMovements(batchMovements);
    }

    const holdingPerBatch = new Map<string, number>();
    for (const [, list] of byWarehouse) {
      const first = list[0];
      if (!first) continue;
      if (calculateBalanceFromMovements(list) > 0) {
        holdingPerBatch.set(first.batchId, (holdingPerBatch.get(first.batchId) ?? 0) + 1);
      }
    }
    for (const batch of batches) {
      const batchMovements = byBatch.get(batch.id) ?? [];
      if (batchMovements.length === 0) continue;
      const balance = round4(calculateBalanceFromMovements(batchMovements));
      if (balance > 0) {
        batchesWithStock += 1;
        if (batch.expiryDate.getTime() <= now.getTime()) expiredStockBatches += 1;
        if ((holdingPerBatch.get(batch.id) ?? 0) > 1) multiWarehouseBatches += 1;
      }
    }

    const openVarianceItems = await prisma.stockCountItem.findMany({
      where: {
        batchId: { in: batches.map((b) => b.id) },
        variance: { not: 0 },
        stockCount: {
          status: { in: [...OPEN_COUNT_STATUSES] },
          postedAt: null,
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
      },
      select: { batchId: true },
    });
    const openVarianceBatches = new Set(openVarianceItems.map((i) => i.batchId)).size;

    return {
      totalQuantity: round4(totalQuantity),
      batchesWithStock,
      multiWarehouseBatches,
      expiredStockBatches,
      openVarianceBatches,
    };
  },
};
