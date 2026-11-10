import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { productsRepository } from "./products.repository.js";
import type { CreateProductInput, ProductQuery, UpdateProductInput } from "./products.validation.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as AuthenticatedRequest).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const productsService = {
  async list(query: ProductQuery) {
    const { items, total } = await productsRepository.findMany(query);
    return { items, total };
  },

  async getById(id: string) {
    const product = await productsRepository.findById(id);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }
    return product;
  },

  async create(input: CreateProductInput, req: Request) {
    const existing = await productsRepository.findBySku(input.sku);
    if (existing) {
      throw ApiError.conflict(`A product with SKU "${input.sku}" already exists`);
    }
    const product = await productsRepository.create(input);
    await writeAudit({
      ...auditContext(req),
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      metadata: { sku: product.sku, name: product.name },
    });
    return product;
  },

  async update(id: string, input: UpdateProductInput, req: Request) {
    const product = await productsRepository.findById(id);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }
    if (input.sku && input.sku !== product.sku) {
      const existing = await productsRepository.findBySku(input.sku);
      if (existing) {
        throw ApiError.conflict(`A product with SKU "${input.sku}" already exists`);
      }
    }
    const updated = await productsRepository.update(id, input);
    await writeAudit({
      ...auditContext(req),
      action: "product.updated",
      entityType: "product",
      entityId: id,
      metadata: { changes: Object.keys(input) },
    });
    return updated;
  },

  async deactivate(id: string, req: Request) {
    const product = await productsRepository.findById(id);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }
    const updated = await productsRepository.softDelete(id);
    await writeAudit({
      ...auditContext(req),
      action: "product.deactivated",
      entityType: "product",
      entityId: id,
    });
    return updated;
  },
};
