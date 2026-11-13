import { Prisma, MovementType } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { daysToExpiry, expiryStatus } from "../../utils/expiry.js";
import { calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import type {
  BatchAliasView,
  BatchQuery,
  BatchView,
  BatchWarehouseStock,
} from "./batches.types.js";

export const batchesRepository = {
  /** Maps a Batch row (with product, aliases, stockMovements) to its API view. */
  async toBatchView(b: Prisma.BatchGetPayload<{
    include: {
      product: true;
      aliases: { include: { warehouse: true } };
      stockMovements: { include: { warehouse: true } };
    };
  }>): Promise<BatchView> {
    const dte = daysToExpiry(b.expiryDate);
    const expStatus = expiryStatus(dte);

    // Group movements by warehouse to compute available stock per warehouse
    const warehouseMovements = new Map<string, { name: string; code: string; movements: Array<{ movementType: MovementType; quantity: Prisma.Decimal }> }>();

    for (const m of b.stockMovements) {
      if (!warehouseMovements.has(m.warehouseId)) {
        warehouseMovements.set(m.warehouseId, {
          name: m.warehouse.name,
          code: m.warehouse.code,
          movements: [],
        });
      }
      warehouseMovements.get(m.warehouseId)!.movements.push(m);
    }

    const warehouseStocks: BatchWarehouseStock[] = [];
    let totalStock = 0;

    for (const [whId, info] of warehouseMovements.entries()) {
      const bal = calculateBalanceFromMovements(info.movements);
      if (bal > 0) {
        warehouseStocks.push({
          warehouseId: whId,
          warehouseName: info.name,
          warehouseCode: info.code,
          availableQuantity: bal,
        });
        totalStock += bal;
      }
    }

    const aliasesView: BatchAliasView[] = b.aliases.map((a) => ({
      id: a.id,
      batchId: a.batchId,
      warehouseId: a.warehouseId,
      warehouseName: a.warehouse.name,
      warehouseCode: a.warehouse.code,
      externalCode: a.externalCode,
      normalizedCode: a.normalizedCode,
      source: a.source,
      createdAt: a.createdAt,
    }));

    return {
      id: b.id,
      productId: b.productId,
      productName: b.product.name,
      productSku: b.product.sku,
      productCategory: b.product.category,
      productUnit: b.product.unit,
      canonicalCode: b.canonicalCode,
      manufacturingDate: b.manufacturingDate,
      receiptDate: b.receiptDate,
      expiryDate: b.expiryDate,
      daysToExpiry: dte,
      expiryStatus: expStatus,
      supplierName: b.supplierName,
      status: b.status,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      totalAvailableStock: Math.round(totalStock * 10000) / 10000,
      warehouses: warehouseStocks,
      aliases: aliasesView,
    };
  },

  async getBatches(query: BatchQuery): Promise<{ items: BatchView[]; total: number }> {
    const where: Prisma.BatchWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId
        ? {
            OR: [
              { stockMovements: { some: { warehouseId: query.warehouseId } } },
              { aliases: { some: { warehouseId: query.warehouseId } } },
            ],
          }
        : {}),
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

    const include = {
      product: true,
      aliases: {
        include: { warehouse: true },
      },
      stockMovements: {
        include: { warehouse: true },
      },
    } as const;

    // expiryStatus is a derived value (not a column). When it is requested we
    // compute views for all matching batches, filter, and paginate in memory so
    // that `total` stays consistent with the returned items.
    if (query.expiryStatus) {
      const batches = await prisma.batch.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
      });

      const views: BatchView[] = [];
      for (const b of batches) {
        const view = await this.toBatchView(b);
        if (view.expiryStatus === query.expiryStatus) {
          views.push(view);
        }
      }

      const start = (query.page - 1) * query.pageSize;
      return {
        items: views.slice(start, start + query.pageSize),
        total: views.length,
      };
    }

    const [batches, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.batch.count({ where }),
    ]);

    const items: BatchView[] = [];
    for (const b of batches) {
      items.push(await this.toBatchView(b));
    }

    return { items, total };
  },

  async getBatchById(id: string): Promise<BatchView | null> {
    const b = await prisma.batch.findUnique({
      where: { id },
      include: {
        product: true,
        aliases: {
          include: { warehouse: true },
        },
        stockMovements: {
          include: { warehouse: true },
        },
      },
    });

    if (!b) return null;

    return this.toBatchView(b);
  },

  async createBatch(data: {
    productId: string;
    canonicalCode: string;
    manufacturingDate?: Date;
    receiptDate?: Date;
    expiryDate: Date;
    supplierName?: string;
    status?: string;
  }) {
    return prisma.batch.create({
      data: {
        productId: data.productId,
        canonicalCode: data.canonicalCode,
        manufacturingDate: data.manufacturingDate,
        receiptDate: data.receiptDate,
        expiryDate: data.expiryDate,
        supplierName: data.supplierName,
        status: data.status ?? "ACTIVE",
      },
    });
  },

  async updateBatch(
    id: string,
    data: {
      status?: string;
      supplierName?: string;
      expiryDate?: Date;
    },
  ) {
    return prisma.batch.update({
      where: { id },
      data,
    });
  },

  async createBatchAlias(data: {
    batchId: string;
    warehouseId: string;
    externalCode: string;
    normalizedCode: string;
    source?: string;
  }) {
    return prisma.batchAlias.create({
      data: {
        batchId: data.batchId,
        warehouseId: data.warehouseId,
        externalCode: data.externalCode,
        normalizedCode: data.normalizedCode,
        source: data.source ?? "MANUAL",
      },
      include: {
        warehouse: true,
      },
    });
  },
};

