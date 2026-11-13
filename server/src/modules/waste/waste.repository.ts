import { Prisma, WasteReason } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { WasteQuery, WasteSummaryQuery } from "./waste.validation.js";
import type {
  WasteRecordView,
  WasteSummary,
  WasteSummaryByReason,
  WasteSummaryByWarehouse,
} from "./waste.types.js";

function buildWhere(query: WasteQuery | WasteSummaryQuery): Prisma.WasteRecordWhereInput {
  // The summary query only carries warehouse/date; the list query adds
  // reason/batch/product/search. Casting is safe: unused keys are undefined
  // for the summary shape and every clause below is applied only when set.
  // NOTE: waste_records has no product_id column — product filtering goes
  // through the batch relation.
  const q = query as WasteQuery;
  const batchFilter: Prisma.BatchWhereInput = {
    ...(q.batchId ? { id: q.batchId } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
  };
  return {
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.fromDate || query.toDate
      ? {
          recordedAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
          },
        }
      : {}),
    ...(q.reason ? { reason: q.reason } : {}),
    ...(Object.keys(batchFilter).length > 0 ? { batch: batchFilter } : {}),
    ...(q.search
      ? {
          OR: [
            { notes: { contains: q.search, mode: "insensitive" as const } },
            {
              batch: {
                OR: [
                  { canonicalCode: { contains: q.search, mode: "insensitive" as const } },
                  { product: { name: { contains: q.search, mode: "insensitive" as const } } },
                  { product: { sku: { contains: q.search, mode: "insensitive" as const } } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}

export const wasteRepository = {
  async getWasteRecords(query: WasteQuery): Promise<{ items: WasteRecordView[]; total: number }> {
    const where = buildWhere(query);

    const [records, total] = await Promise.all([
      prisma.wasteRecord.findMany({
        where,
        include: {
          warehouse: true,
          batch: { include: { product: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.wasteRecord.count({ where }),
    ]);

    const recyclerIds = [...new Set(records.map((r) => r.recordedBy))];
    const recorders = await prisma.user.findMany({
      where: { id: { in: recyclerIds } },
      select: { id: true, name: true },
    });
    const recorderMap = new Map(recorders.map((u) => [u.id, u.name]));

    const items: WasteRecordView[] = records.map((r) => ({
      id: r.id,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      warehouseCode: r.warehouse.code,
      productId: r.batch.productId,
      productName: r.batch.product.name,
      productSku: r.batch.product.sku,
      batchId: r.batchId,
      canonicalCode: r.batch.canonicalCode,
      expiryDate: r.batch.expiryDate,
      batchStatus: r.batch.status,
      quantity: Number(r.quantity),
      reason: r.reason,
      recordedAt: r.recordedAt,
      recordedBy: r.recordedBy,
      recordedByName: recorderMap.get(r.recordedBy) ?? "Unknown",
      notes: r.notes,
      relatedStockMovementId: r.relatedStockMovementId,
      createdAt: r.createdAt,
    }));

    return { items, total };
  },

  async getWasteRecordById(id: string): Promise<WasteRecordView | null> {
    const r = await prisma.wasteRecord.findUnique({
      where: { id },
      include: { warehouse: true, batch: { include: { product: true } } },
    });
    if (!r) return null;

    const recorder = await prisma.user.findUnique({
      where: { id: r.recordedBy },
      select: { name: true },
    });

    return {
      id: r.id,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      warehouseCode: r.warehouse.code,
      productId: r.batch.productId,
      productName: r.batch.product.name,
      productSku: r.batch.product.sku,
      batchId: r.batchId,
      canonicalCode: r.batch.canonicalCode,
      expiryDate: r.batch.expiryDate,
      batchStatus: r.batch.status,
      quantity: Number(r.quantity),
      reason: r.reason,
      recordedAt: r.recordedAt,
      recordedBy: r.recordedBy,
      recordedByName: recorder?.name ?? "Unknown",
      notes: r.notes,
      relatedStockMovementId: r.relatedStockMovementId,
      createdAt: r.createdAt,
    };
  },

  /**
   * Aggregates waste by reason and warehouse over the query window. Totals
   * come from a single grouped query so they always agree with the grouped
   * breakdowns (and therefore with the underlying waste movements).
   */
  async getWasteSummary(query: WasteSummaryQuery): Promise<WasteSummary> {
    const where = buildWhere(query);

    const [byReasonRows, byWarehouseRows] = await Promise.all([
      prisma.wasteRecord.groupBy({
        by: ["reason"],
        where,
        _count: { _all: true },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
      }),
      prisma.wasteRecord.groupBy({
        by: ["warehouseId"],
        where,
        _count: { _all: true },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
      }),
    ]);

    const warehouseIds = byWarehouseRows.map((r) => r.warehouseId);
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, name: true, code: true },
    });
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

    const byReason: WasteSummaryByReason[] = byReasonRows.map((r) => ({
      reason: r.reason as WasteReason,
      records: r._count._all,
      totalQuantity: Number(r._sum.quantity ?? 0),
    }));

    const byWarehouse: WasteSummaryByWarehouse[] = byWarehouseRows.map((r) => {
      const w = warehouseMap.get(r.warehouseId);
      return {
        warehouseId: r.warehouseId,
        warehouseName: w?.name ?? "Unknown",
        warehouseCode: w?.code ?? "?",
        records: r._count._all,
        totalQuantity: Number(r._sum.quantity ?? 0),
      };
    });

    return {
      totalRecords: byReason.reduce((acc, r) => acc + r.records, 0),
      totalQuantity:
        Math.round(byReason.reduce((acc, r) => acc + r.totalQuantity, 0) * 10000) / 10000,
      byReason,
      byWarehouse,
    };
  },
};
