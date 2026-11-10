import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { DispatchQuery, DispatchWithItems } from "./dispatches.types.js";

export const dispatchesRepository = {
  async getDispatches(query: DispatchQuery): Promise<{ items: DispatchWithItems[]; total: number }> {
    const where: Prisma.DispatchWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.referenceNo ? { referenceNo: { contains: query.referenceNo, mode: "insensitive" } } : {}),
      ...(query.fromDate || query.toDate
        ? {
            dispatchedAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [dispatches, total] = await Promise.all([
      prisma.dispatch.findMany({
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
      prisma.dispatch.count({ where }),
    ]);

    const creatorIds = [...new Set(dispatches.map((d) => d.createdBy))];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((c) => [c.id, c.name]));

    const items: DispatchWithItems[] = dispatches.map((d) => ({
      id: d.id,
      warehouseId: d.warehouseId,
      warehouseName: d.warehouse.name,
      warehouseCode: d.warehouse.code,
      referenceNo: d.referenceNo,
      dispatchedAt: d.dispatchedAt,
      createdBy: d.createdBy,
      createdByName: creatorMap.get(d.createdBy) ?? "Unknown",
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      items: d.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        batchId: item.batchId,
        canonicalCode: item.batch.canonicalCode,
        expiryDate: item.batch.expiryDate,
        quantity: Number(item.quantity),
      })),
    }));

    return { items, total };
  },

  async getDispatchById(id: string): Promise<DispatchWithItems | null> {
    const dispatch = await prisma.dispatch.findUnique({
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

    if (!dispatch) return null;

    const creator = await prisma.user.findUnique({
      where: { id: dispatch.createdBy },
      select: { id: true, name: true },
    });

    return {
      id: dispatch.id,
      warehouseId: dispatch.warehouseId,
      warehouseName: dispatch.warehouse.name,
      warehouseCode: dispatch.warehouse.code,
      referenceNo: dispatch.referenceNo,
      dispatchedAt: dispatch.dispatchedAt,
      createdBy: dispatch.createdBy,
      createdByName: creator?.name ?? "Unknown",
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
      items: dispatch.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        batchId: item.batchId,
        canonicalCode: item.batch.canonicalCode,
        expiryDate: item.batch.expiryDate,
        quantity: Number(item.quantity),
      })),
    };
  },
};
