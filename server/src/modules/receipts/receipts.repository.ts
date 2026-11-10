import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { ReceiptQuery, ReceiptWithItems } from "./receipts.types.js";

export const receiptsRepository = {
  async getReceipts(query: ReceiptQuery): Promise<{ items: ReceiptWithItems[]; total: number }> {
    const where: Prisma.ReceiptWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.supplierName ? { supplierName: { contains: query.supplierName, mode: "insensitive" } } : {}),
      ...(query.fromDate || query.toDate
        ? {
            receivedAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          warehouse: true,
          items: {
            include: {
              product: true,
              batch: true,
            },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.receipt.count({ where }),
    ]);

    const creatorIds = [...new Set(receipts.map((r) => r.createdBy))];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((c) => [c.id, c.name]));

    const items: ReceiptWithItems[] = receipts.map((r) => ({
      id: r.id,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      warehouseCode: r.warehouse.code,
      supplierName: r.supplierName,
      referenceNo: r.referenceNo,
      receivedAt: r.receivedAt,
      createdBy: r.createdBy,
      createdByName: creatorMap.get(r.createdBy) ?? "Unknown",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      items: r.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        batchId: item.batchId,
        canonicalCode: item.batch.canonicalCode,
        manufacturingDate: item.batch.manufacturingDate,
        receiptDate: item.batch.receiptDate,
        expiryDate: item.batch.expiryDate,
        supplierName: item.batch.supplierName,
        quantity: Number(item.quantity),
        unitCost: item.unitCost ? Number(item.unitCost) : null,
      })),
    }));

    return { items, total };
  },

  async getReceiptById(id: string): Promise<ReceiptWithItems | null> {
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });

    if (!receipt) return null;

    const creator = await prisma.user.findUnique({
      where: { id: receipt.createdBy },
      select: { id: true, name: true },
    });

    return {
      id: receipt.id,
      warehouseId: receipt.warehouseId,
      warehouseName: receipt.warehouse.name,
      warehouseCode: receipt.warehouse.code,
      supplierName: receipt.supplierName,
      referenceNo: receipt.referenceNo,
      receivedAt: receipt.receivedAt,
      createdBy: receipt.createdBy,
      createdByName: creator?.name ?? "Unknown",
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      items: receipt.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        batchId: item.batchId,
        canonicalCode: item.batch.canonicalCode,
        manufacturingDate: item.batch.manufacturingDate,
        receiptDate: item.batch.receiptDate,
        expiryDate: item.batch.expiryDate,
        supplierName: item.batch.supplierName,
        quantity: Number(item.quantity),
        unitCost: item.unitCost ? Number(item.unitCost) : null,
      })),
    };
  },
};

