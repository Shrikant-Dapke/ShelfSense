import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { batchesRepository } from "./batches.repository.js";
import { normalizeBatchCode } from "./batches.utils.js";
import type {
  CreateBatchAliasInput,
  CreateBatchInput,
  BatchQuery,
  UpdateBatchInput,
} from "./batches.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const batchesService = {
  async getBatches(query: BatchQuery) {
    return batchesRepository.getBatches(query);
  },

  async getBatchById(id: string) {
    const batch = await batchesRepository.getBatchById(id);
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }
    return batch;
  },

  async createBatch(input: CreateBatchInput, req: Request) {
    // 1. Verify product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
    });
    if (!product || !product.isActive) {
      throw ApiError.notFound("Product not found or inactive");
    }

    // 2. Check canonical code uniqueness per product
    const existing = await prisma.batch.findUnique({
      where: {
        productId_canonicalCode: {
          productId: input.productId,
          canonicalCode: input.canonicalCode.trim(),
        },
      },
    });
    if (existing) {
      throw ApiError.conflict(
        `Batch with canonical code "${input.canonicalCode}" already exists for product "${product.name}"`,
      );
    }

    let batch;
    try {
      batch = await batchesRepository.createBatch({
        productId: input.productId,
        canonicalCode: input.canonicalCode.trim(),
        manufacturingDate: input.manufacturingDate ? new Date(input.manufacturingDate) : undefined,
        receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
        expiryDate: new Date(input.expiryDate),
        supplierName: input.supplierName?.trim() || undefined,
        status: input.status ?? "ACTIVE",
      });
    } catch (err: any) {
      // Handles the race between the uniqueness check above and the insert
      // (two concurrent creates for the same product + canonical code).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict(
          `Batch with canonical code "${input.canonicalCode.trim()}" already exists for product "${product.name}"`,
        );
      }
      throw err;
    }

    await writeAudit({
      ...auditContext(req),
      action: "batch.created",
      entityType: "batch",
      entityId: batch.id,
      metadata: {
        productId: batch.productId,
        canonicalCode: batch.canonicalCode,
        expiryDate: batch.expiryDate,
        status: batch.status,
      },
    });

    return batchesRepository.getBatchById(batch.id);
  },

  async updateBatch(id: string, input: UpdateBatchInput, req: Request) {
    const batch = await prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }

    const updated = await batchesRepository.updateBatch(id, {
      status: input.status,
      supplierName: input.supplierName?.trim(),
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
    });

    await writeAudit({
      ...auditContext(req),
      action: "batch.updated",
      entityType: "batch",
      entityId: batch.id,
      metadata: {
        previousStatus: batch.status,
        newStatus: updated.status,
      },
    });

    return batchesRepository.getBatchById(id);
  },

  async createBatchAlias(batchId: string, input: CreateBatchAliasInput, req: Request) {
    // 1. Verify batch exists
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true },
    });
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }

    // 2. Verify warehouse exists and is active
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    // 3. Normalize external code
    const rawCode = input.externalCode.trim();
    const normalizedCode = normalizeBatchCode(rawCode);
    if (!normalizedCode) {
      throw ApiError.badRequest("Batch alias code must contain at least one alphanumeric character");
    }

    // 4. Check uniqueness per warehouse & normalizedCode
    const existingAlias = await prisma.batchAlias.findUnique({
      where: {
        warehouseId_normalizedCode: {
          warehouseId: input.warehouseId,
          normalizedCode,
        },
      },
      include: { batch: true },
    });

    if (existingAlias) {
      if (existingAlias.batchId === batchId) {
        throw ApiError.conflict(
          `Alias "${rawCode}" (normalized: ${normalizedCode}) is already registered for this batch in ${warehouse.name}`,
        );
      } else {
        throw ApiError.conflict(
          `Conflict: Alias "${rawCode}" (normalized: ${normalizedCode}) in ${warehouse.name} is already assigned to a different batch "${existingAlias.batch.canonicalCode}". Conflicting batch identities cannot be merged automatically.`,
        );
      }
    }

    try {
      const alias = await batchesRepository.createBatchAlias({
        batchId,
        warehouseId: input.warehouseId,
        externalCode: rawCode,
        normalizedCode,
        source: input.source?.trim() || "MANUAL",
      });

      await writeAudit({
        ...auditContext(req),
        action: "batch.alias_created",
        entityType: "batch_alias",
        entityId: alias.id,
        metadata: {
          batchId,
          canonicalCode: batch.canonicalCode,
          warehouseId: input.warehouseId,
          warehouseCode: warehouse.code,
          externalCode: rawCode,
          normalizedCode,
        },
      });

      return {
        id: alias.id,
        batchId: alias.batchId,
        warehouseId: alias.warehouseId,
        warehouseName: alias.warehouse.name,
        warehouseCode: alias.warehouse.code,
        externalCode: alias.externalCode,
        normalizedCode: alias.normalizedCode,
        source: alias.source,
        createdAt: alias.createdAt,
      };
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict(
          `Alias with normalized code "${normalizedCode}" already exists in this warehouse`,
        );
      }
      throw err;
    }
  },
};

