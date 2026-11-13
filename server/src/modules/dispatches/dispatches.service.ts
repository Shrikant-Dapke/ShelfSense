import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { inventoryRepository, calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import { classifyExpiry } from "../../utils/expiry.js";
import { dispatchesRepository } from "./dispatches.repository.js";
import type { CreateDispatchInput, DispatchQuery, DispatchRecommendationInput } from "./dispatches.validation.js";
import type { FefoAllocation, FefoRecommendation } from "./dispatches.types.js";
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

  /**
   * Strict First-Expiry-First-Out allocation advice. Advisory snapshot
   * only: no transaction, no row locks, no stock movements, no dispatch
   * records — POST /dispatches remains the sole execution authority and
   * revalidates everything (stock, expiry, status, availability) under
   * sorted batch locks. Quantities derive from the immutable ledger via
   * the shared balance helper and allocate with Prisma.Decimal
   * (NUMERIC(19,4)); the recommendation can never exceed the
   * ledger-derived available quantity.
   *
   * Eligibility: ACTIVE batches only, expired excluded (shared expiry
   * classification), QUARANTINED/RECALLED excluded, zero/negative
   * balances excluded. Ordering: earliest expiry first, ties broken by
   * receipt date (nulls last), then canonical batch code.
   */
  async getFefoRecommendation(input: DispatchRecommendationInput): Promise<FefoRecommendation> {
    // Validate scope (outside any transaction — nothing to lock anyway).
    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    // Eligible batches for this product: ACTIVE and not expired per the
    // shared classification (QUARANTINED/RECALLED are non-ACTIVE here).
    const batches = await prisma.batch.findMany({
      where: {
        productId: input.productId,
        status: "ACTIVE",
        stockMovements: { some: { warehouseId: input.warehouseId } },
      },
      orderBy: [{ expiryDate: "asc" }, { canonicalCode: "asc" }],
    });

    // Ledger-derived balances per batch in this warehouse.
    const movements = await prisma.stockMovement.findMany({
      where: {
        warehouseId: input.warehouseId,
        batchId: { in: batches.map((b) => b.id) },
      },
      select: { batchId: true, movementType: true, quantity: true },
    });
    const byBatch = new Map<string, Array<{ movementType: Prisma.StockMovementGetPayload<{ select: { movementType: true } }>["movementType"]; quantity: Prisma.Decimal | number }>>();
    for (const m of movements) {
      const list = byBatch.get(m.batchId);
      if (list) list.push({ movementType: m.movementType, quantity: m.quantity });
      else byBatch.set(m.batchId, [{ movementType: m.movementType, quantity: m.quantity }]);
    }

    const eligible: Array<{ batch: (typeof batches)[number]; available: Prisma.Decimal }> = [];
    for (const batch of batches) {
      const batchMovements = byBatch.get(batch.id) ?? [];
      if (batchMovements.length === 0) continue; // missing data, not zero stock
      const { expiryStatus } = classifyExpiry(batch.expiryDate);
      if (expiryStatus === "EXPIRED") continue; // expired batches are never dispatched

      const balance = new Prisma.Decimal(
        calculateBalanceFromMovements(batchMovements).toFixed(4),
      );
      if (balance.lessThanOrEqualTo(0)) continue; // zero/negative balances excluded
      eligible.push({ batch, available: balance });
    }

    // Strict FEFO ordering: expiry, then receipt date (nulls last), then code.
    eligible.sort((a, b) => {
      const byExpiry = a.batch.expiryDate.getTime() - b.batch.expiryDate.getTime();
      if (byExpiry !== 0) return byExpiry;
      const aReceipt = a.batch.receiptDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bReceipt = b.batch.receiptDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aReceipt !== bReceipt) return aReceipt - bReceipt;
      return a.batch.canonicalCode.localeCompare(b.batch.canonicalCode);
    });

    const totalEligible = eligible.reduce((acc, e) => acc.plus(e.available), new Prisma.Decimal(0));
    let remaining = new Prisma.Decimal(input.quantity.toFixed(4));
    const allocations: FefoAllocation[] = [];

    for (const { batch, available } of eligible) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = available.lessThan(remaining) ? available : remaining;
      remaining = remaining.minus(take);
      const { daysToExpiry, expiryStatus } = classifyExpiry(batch.expiryDate);
      allocations.push({
        order: allocations.length + 1,
        batchId: batch.id,
        canonicalCode: batch.canonicalCode,
        batchStatus: batch.status,
        productId: batch.productId,
        productName: product.name,
        productSku: product.sku,
        productUnit: product.unit,
        warehouseId: input.warehouseId,
        warehouseName: warehouse.name,
        warehouseCode: warehouse.code,
        expiryDate: batch.expiryDate,
        daysToExpiry,
        expiryStatus,
        receiptDate: batch.receiptDate,
        availableQuantity: Number(available),
        recommendedQuantity: Number(take),
      });
    }

    const allocated = new Prisma.Decimal(input.quantity.toFixed(4)).minus(
      remaining.lessThan(0) ? new Prisma.Decimal(0) : remaining,
    );

    return {
      warehouseId: input.warehouseId,
      warehouseName: warehouse.name,
      warehouseCode: warehouse.code,
      productId: input.productId,
      productName: product.name,
      productSku: product.sku,
      productUnit: product.unit,
      requestedQuantity: input.quantity,
      totalEligibleQuantity: Number(totalEligible),
      allocatedQuantity: Number(allocated),
      shortfall: remaining.greaterThan(0) ? Number(remaining) : 0,
      allocations,
    };
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
