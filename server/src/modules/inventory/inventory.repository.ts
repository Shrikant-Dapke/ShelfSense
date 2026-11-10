import { Prisma, MovementType, StockCountStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { InventoryQuery, InventoryItem, MovementQuery, MovementSummary, StockBalance } from "./inventory.types.js";

function expiryStatus(days: number): "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED" {
  if (days <= 0) return "EXPIRED";
  if (days <= 6) return "CRITICAL";
  if (days <= 14) return "WARNING";
  if (days <= 30) return "MONITOR";
  return "SAFE";
}

function daysToExpiry(expiryDate: Date): number {
  const now = new Date();
  const diff = expiryDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function calculateBalanceFromMovements(
  movements: Array<{ movementType: MovementType; quantity: Prisma.Decimal | number }>,
): number {
  let available = 0;
  for (const m of movements) {
    const qty = typeof m.quantity === "number" ? m.quantity : Number(m.quantity);
    switch (m.movementType) {
      case "RECEIPT":
      case "TRANSFER_IN":
        available += qty;
        break;
      case "DISPATCH":
      case "WASTE":
      case "TRANSFER_OUT":
        available -= qty;
        break;
      case "ADJUSTMENT":
        available += qty;
        break;
    }
  }
  return Math.round(available * 10000) / 10000;
}

export const inventoryRepository = {
  async getInventory(query: InventoryQuery): Promise<{ items: InventoryItem[]; total: number }> {
    const where: Prisma.BatchWhereInput = {
      status: "ACTIVE",
      ...(query.warehouseId
        ? {
            stockMovements: {
              some: {
                warehouseId: query.warehouseId,
              },
            },
          }
        : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.batchId ? { id: query.batchId } : {}),
      ...(query.category ? { product: { category: query.category } } : {}),
      ...(query.search
        ? {
            OR: [
              { canonicalCode: { contains: query.search, mode: "insensitive" } },
              { product: { name: { contains: query.search, mode: "insensitive" } } },
              { product: { sku: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.BatchOrderByWithRelationInput;
    switch (query.sortBy) {
      case "productName":
        orderBy = { product: { name: query.sortOrder } };
        break;
      case "productSku":
        orderBy = { product: { sku: query.sortOrder } };
        break;
      case "canonicalCode":
        orderBy = { canonicalCode: query.sortOrder };
        break;
      case "expiryDate":
        orderBy = { expiryDate: query.sortOrder };
        break;
      default:
        orderBy = { createdAt: query.sortOrder };
        break;
    }

    const batches = await prisma.batch.findMany({
      where,
      include: {
        product: true,
        stockMovements: {
          where: query.warehouseId ? { warehouseId: query.warehouseId } : {},
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
        aliases: query.warehouseId ? { where: { warehouseId: query.warehouseId } } : true,
      },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const total = await prisma.batch.count({ where });

    const items: InventoryItem[] = [];
    for (const batch of batches) {
      // Calculate stock balance from movements
      const movementsWhere: Prisma.StockMovementWhereInput = {
        batchId: batch.id,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      };

      const movements = await prisma.stockMovement.findMany({
        where: movementsWhere,
        orderBy: { occurredAt: "asc" },
      });

      const availableQuantity = calculateBalanceFromMovements(movements);

      // Get physical stock from latest approved stock count
      const latestCount = await prisma.stockCount.findFirst({
        where: {
          warehouseId: query.warehouseId ?? batch.stockMovements[0]?.warehouseId ?? "",
          status: "APPROVED",
        },
        orderBy: { approvedAt: "desc" },
        include: {
          items: { where: { batchId: batch.id } },
        },
      });

      const physicalItem = latestCount?.items[0];
      const physicalQuantity = physicalItem ? Number(physicalItem.countedQuantity) : null;
      const expectedQuantity = availableQuantity;
      const variance = physicalQuantity !== null ? physicalQuantity - expectedQuantity : null;

      // Get last movement
      const lastMovement = movements[movements.length - 1] ?? null;

      const dte = daysToExpiry(batch.expiryDate);
      const status = expiryStatus(dte);

      if (query.expiryStatus && status !== query.expiryStatus) continue;
      if (query.lowStock && availableQuantity > 10) continue;

      // Determine warehouse info
      const warehouseId = query.warehouseId ?? batch.stockMovements[0]?.warehouseId;
      let warehouseName = "";
      let warehouseCode = "";
      if (warehouseId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
        if (wh) {
          warehouseName = wh.name;
          warehouseCode = wh.code;
        }
      }

      items.push({
        warehouseId: warehouseId ?? "",
        warehouseName,
        warehouseCode,
        productId: batch.productId,
        productName: batch.product.name,
        productSku: batch.product.sku,
        productCategory: batch.product.category,
        productUnit: batch.product.unit,
        batchId: batch.id,
        canonicalCode: batch.canonicalCode,
        manufacturingDate: batch.manufacturingDate,
        receiptDate: batch.receiptDate,
        expiryDate: batch.expiryDate,
        daysToExpiry: dte,
        expiryStatus: status,
        availableQuantity,
        physicalQuantity,
        variance,
        lastMovementAt: lastMovement?.occurredAt ?? null,
      });
    }

    return { items, total };
  },

  async getStockBalance(warehouseId: string, batchId: string): Promise<StockBalance | null> {
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId, batchId },
      orderBy: { occurredAt: "asc" },
    });

    if (movements.length === 0) return null;

    const availableQuantity = calculateBalanceFromMovements(movements);

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true },
    });

    if (!batch) return null;

    const latestCount = await prisma.stockCount.findFirst({
      where: { warehouseId, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
      include: { items: { where: { batchId } } },
    });

    const physicalItem = latestCount?.items[0];
    const physicalQuantity = physicalItem ? Number(physicalItem.countedQuantity) : null;
    const variance = physicalQuantity !== null ? physicalQuantity - availableQuantity : null;
    const lastMovement = movements[movements.length - 1];

    return {
      warehouseId,
      batchId,
      productId: batch.productId,
      availableQuantity,
      reservedQuantity: 0, // TODO: reservations
      expectedQuantity: availableQuantity,
      physicalQuantity,
      variance,
      lastMovementAt: lastMovement?.occurredAt ?? null,
    };
  },

  async getMovements(query: MovementQuery): Promise<{ items: MovementSummary[]; total: number }> {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
      ...(query.fromDate || query.toDate
        ? {
            occurredAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        warehouse: true,
        batch: { include: { product: true } },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const total = await prisma.stockMovement.count({ where });

    // Fetch creator names separately since createdBy is not a relation
    const creatorIds = [...new Set(movements.map((m) => m.createdBy))];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((c) => [c.id, c.name]));

    const items: MovementSummary[] = movements.map((m) => ({
      id: m.id,
      warehouseId: m.warehouseId,
      warehouseName: m.warehouse.name,
      warehouseCode: m.warehouse.code,
      batchId: m.batchId,
      canonicalCode: m.batch.canonicalCode,
      productId: m.batch.productId,
      productName: m.batch.product.name,
      productSku: m.batch.product.sku,
      movementType: m.movementType,
      quantity: Number(m.quantity),
      referenceId: m.referenceId,
      occurredAt: m.occurredAt,
      createdBy: m.createdBy,
      createdByName: creatorMap.get(m.createdBy) ?? "Unknown",
      createdAt: m.createdAt,
    }));

    return { items, total };
  },

  async createStockMovement(
    tx: Prisma.TransactionClient,
    data: {
      warehouseId: string;
      batchId: string;
      movementType: MovementType;
      quantity: number;
      referenceId?: string;
      createdBy: string;
      idempotencyKey?: string;
      occurredAt?: Date;
    }
  ) {
    return tx.stockMovement.create({
      data: {
        warehouseId: data.warehouseId,
        batchId: data.batchId,
        movementType: data.movementType,
        quantity: data.quantity,
        referenceId: data.referenceId,
        createdBy: data.createdBy,
        idempotencyKey: data.idempotencyKey,
        occurredAt: data.occurredAt ?? new Date(),
      },
    });
  },

  async getAvailableQuantity(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    batchId: string,
    options?: { forUpdate?: boolean }
  ): Promise<number> {
    if (options?.forUpdate) {
      await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batchId}::uuid FOR UPDATE`;
    }
    const movements = await tx.stockMovement.findMany({
      where: { warehouseId, batchId },
      orderBy: { occurredAt: "asc" },
      select: { movementType: true, quantity: true },
    });

    return calculateBalanceFromMovements(movements);
  },

  async getStockCountWithItems(tx: Prisma.TransactionClient, id: string) {
    return tx.stockCount.findUnique({
      where: { id },
      include: { items: { include: { batch: { include: { product: true } } } } },
    });
  },

  async getStockCountItems(tx: Prisma.TransactionClient, stockCountId: string) {
    return tx.stockCountItem.findMany({
      where: { stockCountId },
      include: { batch: { include: { product: true } } },
    });
  },
};

export default inventoryRepository;