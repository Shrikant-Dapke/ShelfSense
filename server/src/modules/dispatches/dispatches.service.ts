import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { inventoryRepository } from "../inventory/inventory.repository.js";
import { dispatchesRepository } from "./dispatches.repository.js";
import type { CreateDispatchInput, DispatchQuery } from "./dispatches.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const dispatchesService = {
  async getDispatches(query: DispatchQuery) {
    return dispatchesRepository.getDispatches(query);
  },

  async getDispatchById(id: string) {
    const dispatch = await dispatchesRepository.getDispatchById(id);
    if (!dispatch) {
      throw ApiError.notFound("Dispatch not found");
    }
    return dispatch;
  },

  async createDispatch(input: CreateDispatchInput, req: Request) {
    const userId = (req as any).user.id;

    // 1. Validate warehouse exists and is active
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    // 2. Validate no duplicate batches in the same dispatch
    const batchIds = input.items.map((i) => i.batchId);
    if (new Set(batchIds).size !== batchIds.length) {
      throw ApiError.badRequest("Duplicate batch items found in dispatch request");
    }

    // 3. Service-level idempotency check
    if (input.idempotencyKey) {
      const existing = await prisma.dispatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        throw ApiError.conflict("Dispatch with this idempotency key already exists");
      }
    }

    const now = new Date();

    try {
      const createdDispatch = await prisma.$transaction(async (tx) => {
        // Deterministic lock ordering: acquire every batch row lock in sorted
        // batchId order BEFORE processing items. Two concurrent dispatches (or
        // a dispatch and a receipt/stock-count posting) whose items share
        // batches in different orders then serialize instead of deadlocking
        // (they would otherwise each lock their first batch and wait on the
        // other's). Dispatch items always reference existing batches, so all
        // locks can be resolved upfront.
        const sortedBatchIds = [...new Set(input.items.map((i) => i.batchId))].sort();
        for (const batchId of sortedBatchIds) {
          await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batchId}::uuid FOR UPDATE`;
        }

        // Concurrency-safe validation for each item with row-level locks
        for (const item of input.items) {
          const batch = await tx.batch.findUnique({
            where: { id: item.batchId },
            include: { product: true },
          });

          if (!batch) {
            throw ApiError.notFound(`Batch ID ${item.batchId} not found`);
          }

          if (batch.productId !== item.productId) {
            throw ApiError.badRequest(`Batch ${batch.canonicalCode} does not belong to product ${item.productId}`);
          }

          // Inactive / Quarantined stock prevention
          if (batch.status !== "ACTIVE") {
            throw ApiError.badRequest(
              `Batch "${batch.canonicalCode}" is not active (status: ${batch.status}) and cannot be dispatched`,
            );
          }

          // Expired stock prevention
          if (batch.expiryDate.getTime() <= now.getTime()) {
            throw ApiError.badRequest(
              `Batch "${batch.canonicalCode}" has expired (${batch.expiryDate.toISOString().split("T")[0]}) and cannot be dispatched`,
            );
          }

          // Row-level lock on the batch to serialize stock deductions
          // (already acquired above in sorted order; re-asserted per item to
          // keep the Phase A–C convention uniform and the loop self-contained).
          await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batch.id}::uuid FOR UPDATE`;

          // Check available balance in the specified warehouse
          const available = await inventoryRepository.getAvailableQuantity(tx, input.warehouseId, batch.id);
          if (available < item.quantity) {
            throw ApiError.badRequest(
              `Insufficient stock for batch "${batch.canonicalCode}". Available: ${available}, Requested: ${item.quantity}`,
            );
          }
        }

        // Create Dispatch record
        const dispatch = await tx.dispatch.create({
          data: {
            warehouseId: input.warehouseId,
            referenceNo: input.referenceNo,
            dispatchedAt: input.dispatchedAt ? new Date(input.dispatchedAt) : now,
            createdBy: userId,
            idempotencyKey: input.idempotencyKey,
          },
        });

        // Create DispatchItems and DISPATCH StockMovements
        for (let idx = 0; idx < input.items.length; idx++) {
          const item = input.items[idx]!;

          await tx.dispatchItem.create({
            data: {
              dispatchId: dispatch.id,
              productId: item.productId,
              batchId: item.batchId,
              quantity: item.quantity,
            },
          });

          await tx.stockMovement.create({
            data: {
              warehouseId: input.warehouseId,
              batchId: item.batchId,
              movementType: "DISPATCH",
              quantity: item.quantity,
              referenceId: dispatch.id,
              createdBy: userId,
              idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}_item_${idx}` : undefined,
              occurredAt: dispatch.dispatchedAt,
            },
          });
        }

        await writeAudit({
          ...auditContext(req),
          action: "dispatch.created",
          entityType: "dispatch",
          entityId: dispatch.id,
          metadata: {
            warehouseId: dispatch.warehouseId,
            referenceNo: dispatch.referenceNo,
            itemCount: input.items.length,
          },
        });

        return dispatch;
      });

      return dispatchesRepository.getDispatchById(createdDispatch.id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Dispatch with this idempotency key already exists");
      }
      throw err;
    }
  },
};
