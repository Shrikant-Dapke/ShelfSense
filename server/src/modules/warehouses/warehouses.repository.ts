import { prisma } from "../../config/prisma.js";
import type { Prisma } from "@prisma/client";
import type { CreateWarehouseInput, UpdateWarehouseInput, WarehouseQuery } from "./warehouses.validation.js";

export const warehousesRepository = {
  async findMany(query: WarehouseQuery) {
    const where: Prisma.WarehouseWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } },
              { location: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.warehouse.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.warehouse.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string) {
    return prisma.warehouse.findUnique({ where: { id } });
  },

  findByCode(code: string) {
    return prisma.warehouse.findUnique({ where: { code } });
  },

  create(data: CreateWarehouseInput) {
    return prisma.warehouse.create({ data });
  },

  update(id: string, data: UpdateWarehouseInput) {
    return prisma.warehouse.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return prisma.warehouse.update({ where: { id }, data: { isActive: false } });
  },
};
