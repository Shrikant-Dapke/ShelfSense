import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { StockCountQuery, StockCountView, StockCountStatus } from "./stockcounts.types.js";

type StockCountWithRelations = Prisma.StockCountGetPayload<{
  include: {
    warehouse: true;
    items: { include: { batch: { include: { product: true } } } };
  };
}>;

function userNameMap(users: Array<{ id: string; name: string }>): Map<string, string> {
  return new Map(users.map((u) => [u.id, u.name]));
}

/**
 * Maps a StockCount row (with warehouse and items incl. batch/product) to its
 * API view. Totals use Decimal accumulation to avoid floating-point drift.
 */
export function toStockCountView(count: StockCountWithRelations, users?: Map<string, string>): StockCountView {
  const usersMap = users ?? new Map<string, string>();

  let totalExpected = new Prisma.Decimal(0);
  let totalCounted = new Prisma.Decimal(0);
  let totalVariance = new Prisma.Decimal(0);

  const items = count.items.map((item) => {
    const expected = new Prisma.Decimal(item.expectedQuantity.toString());
    const counted = new Prisma.Decimal(item.countedQuantity.toString());
    const variance = new Prisma.Decimal(item.variance.toString());

    totalExpected = totalExpected.plus(expected);
    totalCounted = totalCounted.plus(counted);
    totalVariance = totalVariance.plus(variance);

    return {
      id: item.id,
      productId: item.productId,
      productName: item.batch.product.name,
      productSku: item.batch.product.sku,
      batchId: item.batchId,
      canonicalCode: item.batch.canonicalCode,
      expiryDate: item.batch.expiryDate,
      expectedQuantity: expected.toNumber(),
      countedQuantity: counted.toNumber(),
      variance: variance.toNumber(),
    };
  });

  return {
    id: count.id,
    warehouseId: count.warehouseId,
    warehouseName: count.warehouse.name,
    warehouseCode: count.warehouse.code,
    status: count.status as StockCountStatus,
    referenceNo: count.referenceNo,
    description: count.description,
    countedAt: count.countedAt,
    countedByName: count.countedBy ? usersMap.get(count.countedBy) ?? null : null,
    approvedByName: count.approvedBy ? usersMap.get(count.approvedBy) ?? null : null,
    approvedAt: count.approvedAt,
    postedByName: count.postedBy ? usersMap.get(count.postedBy) ?? null : null,
    postedAt: count.postedAt,
    createdAt: count.createdAt,
    updatedAt: count.updatedAt,
    items,
    totalExpectedQuantity: totalExpected.toNumber(),
    totalCountedQuantity: totalCounted.toNumber(),
    totalVariance: totalVariance.toNumber(),
  };
}

const includeRelations = {
  warehouse: true,
  items: {
    orderBy: { createdAt: "asc" as const },
    include: { batch: { include: { product: true } } },
  },
} satisfies Prisma.StockCountInclude;

async function loadUserNames(counts: StockCountWithRelations[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const c of counts) {
    for (const key of ["countedBy", "approvedBy", "postedBy"] as const) {
      const id = c[key];
      if (id) ids.add(id);
    }
  }
  if (ids.size === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  return userNameMap(users);
}

export const stockCountsRepository = {
  async getStockCounts(query: StockCountQuery): Promise<{ items: StockCountView[]; total: number }> {
    const where: Prisma.StockCountWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const orderByField: keyof Prisma.StockCountOrderByWithRelationInput =
      query.sortBy === "countedAt"
        ? "countedAt"
        : query.sortBy === "status"
          ? "status"
          : query.sortBy === "referenceNo"
            ? "referenceNo"
            : "createdAt";

    const [counts, total] = await Promise.all([
      prisma.stockCount.findMany({
        where,
        include: includeRelations,
        orderBy: { [orderByField]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.stockCount.count({ where }),
    ]);

    const users = await loadUserNames(counts);

    return { items: counts.map((c) => toStockCountView(c, users)), total };
  },

  async getStockCountById(id: string): Promise<StockCountView | null> {
    const count = await prisma.stockCount.findUnique({
      where: { id },
      include: includeRelations,
    });
    if (!count) return null;

    const users = await loadUserNames([count]);
    return toStockCountView(count, users);
  },

  async getStockCountWithRelations(id: string): Promise<StockCountWithRelations | null> {
    return prisma.stockCount.findUnique({
      where: { id },
      include: includeRelations,
    });
  },
};

export default stockCountsRepository;
