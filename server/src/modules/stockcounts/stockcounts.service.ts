import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { calculateBalanceFromMovements } from "../inventory/inventory.repository.js";
import { stockCountsRepository } from "./stockcounts.repository.js";
import { computeVariance, toQuantityDecimal } from "./stockcounts.utils.js";
import type {
  CreateStockCountInput,
  StockCountQuery,
  UpdateStockCountInput,
} from "./stockcounts.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

function currentUserId(req: Request): string {
  return (req as any).user.id;
}

/**
 * Ledger-derived expected balance for a batch in a warehouse. The immutable
 * StockMovement ledger is the single source of truth — manually stored stock
 * quantities are never trusted.
 */
async function expectedLedgerBalance(
  warehouseId: string,
  batchId: string,
): Promise<Prisma.Decimal> {
  const movements = await prisma.stockMovement.findMany({
    where: { warehouseId, batchId },
    select: { movementType: true, quantity: true },
  });
  return toQuantityDecimal(calculateBalanceFromMovements(movements));
}

/** Validates that every item references a real batch of the declared product. */
async function validateItems(items: Array<{ productId: string; batchId: string }>) {
  const batchIds = [...new Set(items.map((i) => i.batchId))];
  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds } },
    include: { product: true },
  });
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  for (const item of items) {
    const batch = batchMap.get(item.batchId);
    if (!batch) {
      throw ApiError.badRequest(`Batch ${item.batchId} does not exist`);
    }
    if (batch.productId !== item.productId) {
      throw ApiError.badRequest(
        `Batch "${batch.canonicalCode}" belongs to a different product than declared`,
      );
    }
  }

  return batchMap;
}

export const stockCountsService = {
  async getStockCounts(query: StockCountQuery) {
    return stockCountsRepository.getStockCounts(query);
  },

  async getStockCountById(id: string) {
    const count = await stockCountsRepository.getStockCountById(id);
    if (!count) {
      throw ApiError.notFound("Stock count not found");
    }
    return count;
  },

  /**
   * Creates a draft stock count. Expected quantities are derived from the
   * ledger at creation time and variance is recorded, but inventory is never
   * touched here — only posting an approved count adjusts stock.
   */
  async createStockCount(input: CreateStockCountInput, req: Request) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    await validateItems(input.items);

    try {
      const created = await prisma.$transaction(async (tx) => {
        const count = await tx.stockCount.create({
          data: {
            warehouseId: input.warehouseId,
            referenceNo: input.referenceNo,
            description: input.description,
            status: "PENDING",
            countedAt: input.countedAt ? new Date(input.countedAt) : new Date(),
            countedBy: currentUserId(req),
          },
        });

        for (const item of input.items) {
          const expected = await expectedLedgerBalance(input.warehouseId, item.batchId);
          const counted = new Prisma.Decimal(item.countedQuantity.toString());
          const variance = computeVariance(counted, expected);

          await tx.stockCountItem.create({
            data: {
              stockCountId: count.id,
              productId: item.productId,
              batchId: item.batchId,
              expectedQuantity: expected,
              countedQuantity: counted,
              variance,
            },
          });
        }

        return count;
      });

      await writeAudit({
        ...auditContext(req),
        action: "stockcount.created",
        entityType: "stock_count",
        entityId: created.id,
        metadata: {
          warehouseId: input.warehouseId,
          referenceNo: input.referenceNo,
          itemCount: input.items.length,
        },
      });

      return stockCountsRepository.getStockCountById(created.id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict(
          "Duplicate counted batch: each batch may appear only once per stock count",
        );
      }
      throw err;
    }
  },

  /**
   * Updates an editable (draft or submitted) stock count. Counts that are
   * approved or already posted are immutable.
   */
  async updateStockCount(id: string, input: UpdateStockCountInput, req: Request) {
    const existing = await stockCountsRepository.getStockCountWithRelations(id);
    if (!existing) {
      throw ApiError.notFound("Stock count not found");
    }

    if (existing.status === "APPROVED" || existing.status === "REJECTED" || existing.postedAt) {
      throw ApiError.conflict(
        `Stock count cannot be edited while status is ${existing.status}${existing.postedAt ? " (already posted)" : ""}`,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.stockCount.update({
          where: { id },
          data: {
            ...(input.referenceNo !== undefined ? { referenceNo: input.referenceNo } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            countedAt: input.countedAt ? new Date(input.countedAt) : new Date(),
            countedBy: currentUserId(req),
          },
        });

        if (input.items) {
          await validateItems(input.items);
          await tx.stockCountItem.deleteMany({ where: { stockCountId: id } });

          for (const item of input.items) {
            const expected = await expectedLedgerBalance(existing.warehouseId, item.batchId);
            const counted = new Prisma.Decimal(item.countedQuantity.toString());
            const variance = computeVariance(counted, expected);

            await tx.stockCountItem.create({
              data: {
                stockCountId: id,
                productId: item.productId,
                batchId: item.batchId,
                expectedQuantity: expected,
                countedQuantity: counted,
                variance,
              },
            });
          }
        }
      });

      await writeAudit({
        ...auditContext(req),
        action: "stockcount.updated",
        entityType: "stock_count",
        entityId: id,
        metadata: {
          itemsReplaced: input.items ? input.items.length : undefined,
        },
      });

      return stockCountsRepository.getStockCountById(id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict(
          "Duplicate counted batch: each batch may appear only once per stock count",
        );
      }
      throw err;
    }
  },

  /** Draft -> Submitted for review. */
  async submitStockCount(id: string, req: Request) {
    const count = await stockCountsRepository.getStockCountWithRelations(id);
    if (!count) {
      throw ApiError.notFound("Stock count not found");
    }
    if (count.status === "SUBMITTED") {
      throw ApiError.conflict("Stock count is already submitted for review");
    }
    if (count.status !== "PENDING") {
      throw ApiError.badRequest(
        `Only draft counts can be submitted. Current status: ${count.status}`,
      );
    }

    const updated = await prisma.stockCount.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    await writeAudit({
      ...auditContext(req),
      action: "stockcount.submitted",
      entityType: "stock_count",
      entityId: id,
      metadata: { itemCount: count.items.length },
    });

    return stockCountsRepository.getStockCountById(id);
  },

  /** Submitted -> Approved. Approval must be explicit and is audited. */
  async approveStockCount(id: string, req: Request) {
    const count = await stockCountsRepository.getStockCountWithRelations(id);
    if (!count) {
      throw ApiError.notFound("Stock count not found");
    }
    if (count.status === "APPROVED") {
      throw ApiError.conflict("Stock count is already approved");
    }
    if (count.status !== "SUBMITTED") {
      throw ApiError.badRequest(
        `Only submitted counts can be approved. Current status: ${count.status}`,
      );
    }

    const approverId = currentUserId(req);
    await prisma.stockCount.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: approverId, approvedAt: new Date() },
    });

    await writeAudit({
      ...auditContext(req),
      action: "stockcount.approved",
      entityType: "stock_count",
      entityId: id,
      metadata: { itemCount: count.items.length },
    });

    return stockCountsRepository.getStockCountById(id);
  },

  /**
   * Posts an approved count by creating signed ADJUSTMENT stock movements.
   *
   * Safety guarantees:
   * - The count row is locked FOR UPDATE so concurrent posts serialize; the
   *   loser observes posted_at and fails with 409 (duplicate posting prevention).
   * - Each counted batch row is locked FOR UPDATE (Phase A–C convention) and
   *   the expected balance is recalculated from the ledger after acquiring the
   *   lock, so adjustments reflect any movements that happened since counting.
   * - The final ledger balance equals the counted quantity; because counted
   *   quantities are validated >= 0, posting can never drive stock negative.
   * - Movements carry per-item idempotency keys (`<countId>_adj_<itemId>`)
   *   backed by the unique idempotency_key constraint.
   */
  async postStockCount(id: string, req: Request) {
    const existing = await stockCountsRepository.getStockCountWithRelations(id);
    if (!existing) {
      throw ApiError.notFound("Stock count not found");
    }
    if (existing.postedAt) {
      throw ApiError.conflict("Stock count has already been posted");
    }
    if (existing.status === "PENDING" || existing.status === "SUBMITTED") {
      throw ApiError.badRequest(
        `Stock count must be approved before posting. Current status: ${existing.status}`,
      );
    }
    if (existing.status !== "APPROVED") {
      throw ApiError.badRequest(`Stock count cannot be posted. Current status: ${existing.status}`);
    }

    const posterId = currentUserId(req);

    try {
      const posted = await prisma.$transaction(async (tx) => {
          // Serialize concurrent posts on the count row itself.
          await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${id}::uuid FOR UPDATE`;

          const fresh = await tx.stockCount.findUnique({
            where: { id },
            include: { items: { orderBy: { createdAt: "asc" } } },
          });
          if (!fresh) {
            throw ApiError.notFound("Stock count not found");
          }
          if (fresh.postedAt) {
            throw ApiError.conflict("Stock count has already been posted");
          }
          if (fresh.status !== "APPROVED") {
            throw ApiError.badRequest(
              `Stock count must be approved before posting. Current status: ${fresh.status}`,
            );
          }

          const adjustmentsCreated: Array<{ batchId: string; variance: string }> = [];

          for (const item of fresh.items) {
            // Phase A–C convention: lock the batch row, then recalculate the
            // expected balance from the immutable ledger.
            await tx.$queryRaw`SELECT id FROM batches WHERE id = ${item.batchId}::uuid FOR UPDATE`;
            const expected = await (async () => {
              const movements = await tx.stockMovement.findMany({
                where: { warehouseId: fresh.warehouseId, batchId: item.batchId },
                select: { movementType: true, quantity: true },
              });
              return toQuantityDecimal(calculateBalanceFromMovements(movements));
            })();

            const counted = new Prisma.Decimal(item.countedQuantity.toString());
            const variance = computeVariance(counted, expected);
            const resultingBalance = expected.plus(variance);

            if (resultingBalance.lessThan(0)) {
              throw ApiError.conflict(
                `Posting this count would drive batch ${item.batchId} negative. Recalculated ledger balance: ${expected.toFixed(4)}`,
              );
            }

            // Record the recalculated expectation and variance on the item so
            // the preserved history reflects what was actually posted.
            await tx.stockCountItem.update({
              where: { id: item.id },
              data: {
                expectedQuantity: expected,
                variance,
              },
            });

            if (!variance.isZero()) {
              await tx.stockMovement.create({
                data: {
                  warehouseId: fresh.warehouseId,
                  batchId: item.batchId,
                  movementType: "ADJUSTMENT",
                  quantity: variance,
                  referenceId: fresh.id,
                  createdBy: posterId,
                  idempotencyKey: `${fresh.id}_adj_${item.id}`,
                  occurredAt: new Date(),
                },
              });
              adjustmentsCreated.push({ batchId: item.batchId, variance: variance.toFixed(4) });
            }
          }

          await tx.stockCount.update({
            where: { id },
            data: { postedAt: new Date(), postedBy: posterId },
          });

          return { adjustments: adjustmentsCreated };
        },
      );

      await writeAudit({
        ...auditContext(req),
        action: "stockcount.posted",
        entityType: "stock_count",
        entityId: id,
        metadata: {
          warehouseId: existing.warehouseId,
          adjustmentCount: posted.adjustments.length,
          adjustments: posted.adjustments,
        },
      });

      return stockCountsRepository.getStockCountById(id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Stock count has already been posted");
      }
      throw err;
    }
  },
};
