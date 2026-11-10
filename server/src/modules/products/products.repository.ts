import { prisma } from "../../config/prisma.js";
import type { Prisma } from "@prisma/client";
import type { CreateProductInput, ProductQuery, UpdateProductInput } from "./products.validation.js";

export const productsRepository = {
  async findMany(query: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
              { brand: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  findBySku(sku: string) {
    return prisma.product.findUnique({ where: { sku } });
  },

  create(data: CreateProductInput) {
    return prisma.product.create({ data });
  },

  update(id: string, data: UpdateProductInput) {
    return prisma.product.update({ where: { id }, data });
  },

  async softDelete(id: string) {
    // Historical integrity: products are deactivated, never hard-deleted.
    return prisma.product.update({ where: { id }, data: { isActive: false } });
  },
};
