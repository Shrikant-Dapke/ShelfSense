import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { inventoryRepository } from "../inventory/inventory.repository.js";
import { wasteRepository } from "./waste.repository.js";
import type { CreateWasteInput, WasteQuery, WasteSummaryQuery } from "./waste.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const wasteService = {
  async getWasteRecords(query: WasteQuery) {
    return wasteRepository.getWasteRecords(query);
  },

  async getWasteRecordById(id: string) {
    const record = await wasteRepository.getWasteRecordById(id);
    if (!record) {
      throw ApiError.notFound("Waste record not found");
    }
    return record;
  },

  async getWasteSummary(query: WasteSummaryQuery) {
    return wasteRepository.getWasteSummary(query);
  },

  /**
   * Records waste atomically: one transaction creates the WASTE stock
   * movement and the linked WasteRecord, or rolls back both.
   *
   * Safety guarantees (Phase A–C ledger convention):
   * - The batch row is locked FOR UPDATE, then the available balance is
   *   recalculated from the immutable ledger after the lock — never from a
   *   pre-lock read.
   * - Wasting more than the recalculated balance is refused, so recording
   *   waste can never drive stock negative.
   * - Expired and QUARANTINED/RECALLED batches may be wasted (that is the
   *   point of the module); the batch must simply exist and belong to the
   *   submitted product, and the warehouse must be active.
   * - Quantities pass through Prisma.Decimal (NUMERIC(19,4)) — no floats in
   *   the ledger.
   * - The optional idempotencyKey is enforced by the unique index on
   *   stock_movements.idempotency_key; a replayed request fails with 409
   *   instead of double-wasting.
   */
  async recordWaste(input: CreateWasteInput, req: Request) {
    const userId = (req as any).user.id;

    // 1. Validate the warehouse exists and is active (outside the tx — a
    //    missing/inactive warehouse can never be fixed by retrying under lock).
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    // 2. Validate the batch exists and belongs to the submitted product.
    const batch = await prisma.batch.findUnique({
      where: { id: input.batchId },
    });
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }
    if (batch.productId !== input.productId) {
      throw ApiError.badRequest(
        `Batch "${batch.canonicalCode}" does not belong to the submitted product`,
      );
    }

    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
    const wasteQuantity = new Prisma.Decimal(input.quantity.toString());

    try {
      const created = await prisma.$transaction(async (tx) => {
        // 3. Row lock + ledger-derived balance (single batch — the shared
        //    getAvailableQuantity helper acquires the lock itself).
        const available = await inventoryRepository.getAvailableQuantity(
          tx,
          input.warehouseId,
          input.batchId,
          { forUpdate: true },
        );
        const availableDecimal = new Prisma.Decimal(available.toFixed(4));

        // 4. Negative-stock prevention.
        if (availableDecimal.lessThan(wasteQuantity)) {
          throw ApiError.badRequest(
            `Insufficient stock for batch "${batch.canonicalCode}". Available: ${availableDecimal.toFixed(4)}, Requested: ${wasteQuantity.toFixed(4)}`,
          );
        }

        // 5. Create the WASTE ledger movement.
        const movement = await tx.stockMovement.create({
          data: {
            warehouseId: input.warehouseId,
            batchId: input.batchId,
            movementType: "WASTE",
            quantity: wasteQuantity,
            referenceId: null,
            createdBy: userId,
            idempotencyKey: input.idempotencyKey,
            occurredAt: recordedAt,
          },
        });

        // 6. Create the linked WasteRecord in the same transaction — both
        //    rows commit together or roll back together. (Product identity is
        //    held by the batch; the submitted productId is validated against
        //    it above but not denormalized here.)
        const record = await tx.wasteRecord.create({
          data: {
            warehouseId: input.warehouseId,
            batchId: input.batchId,
            quantity: wasteQuantity,
            reason: input.reason,
            recordedAt,
            recordedBy: userId,
            notes: input.notes?.trim() || null,
            relatedStockMovementId: movement.id,
          },
        });

        return { movement, record };
      });

      await writeAudit({
        ...auditContext(req),
        action: "waste.recorded",
        entityType: "waste_record",
        entityId: created.record.id,
        metadata: {
          warehouseId: input.warehouseId,
          batchId: input.batchId,
          movementId: created.movement.id,
          quantity: wasteQuantity.toFixed(4),
          reason: input.reason,
          batchStatus: batch.status,
        },
      });

      return wasteRepository.getWasteRecordById(created.record.id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Waste with this idempotency key already exists");
      }
      throw err;
    }
  },
};
