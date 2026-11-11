import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { receiptsRepository } from "./receipts.repository.js";
import type { CreateReceiptInput, ReceiptQuery } from "./receipts.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const receiptsService = {
  async getReceipts(query: ReceiptQuery) {
    return receiptsRepository.getReceipts(query);
  },

  async getReceiptById(id: string) {
    const receipt = await receiptsRepository.getReceiptById(id);
    if (!receipt) {
      throw ApiError.notFound("Receipt not found");
    }
    return receipt;
  },

  async createReceipt(input: CreateReceiptInput, req: Request) {
    const userId = (req as any).user.id;

    // 1. Validate warehouse
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    // 2. Validate all products in receipt items
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of input.items) {
      const prod = productMap.get(item.productId);
      if (!prod) {
        throw ApiError.badRequest(`Product ID ${item.productId} does not exist`);
      }
      if (!prod.isActive) {
        throw ApiError.badRequest(`Product "${prod.name}" (${prod.sku}) is inactive`);
      }

      // Check dates
      const expDate = new Date(item.expiryDate);
      if (isNaN(expDate.getTime())) {
        throw ApiError.badRequest(`Invalid expiry date for item with code ${item.canonicalCode}`);
      }
    }

    // 3. Service-level idempotency check
    if (input.idempotencyKey) {
      const existing = await prisma.receipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        throw ApiError.conflict("Receipt with this idempotency key already exists");
      }
    }

    try {
      const createdReceipt = await prisma.$transaction(async (tx) => {
        // Create Receipt record
        const receipt = await tx.receipt.create({
          data: {
            warehouseId: input.warehouseId,
            supplierName: input.supplierName,
            referenceNo: input.referenceNo,
            receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
            createdBy: userId,
            idempotencyKey: input.idempotencyKey,
          },
        });

        // Deterministic lock ordering: resolve and lock every pre-existing
        // batch row in sorted batchId order BEFORE processing items. Two
        // concurrent receipts (or a receipt and a stock-count posting) whose
        // items share batches in different orders then serialize instead of
        // deadlocking (they would otherwise each lock their first batch and
        // wait on the other's). Batches not existing yet are created below in
        // this transaction, so no lock contention is possible for them.
        const existingBatchIds = new Set<string>();
        for (const item of input.items) {
          const found = item.batchId
            ? await tx.batch.findUnique({ where: { id: item.batchId } })
            : await tx.batch.findUnique({
                where: {
                  productId_canonicalCode: {
                    productId: item.productId,
                    canonicalCode: item.canonicalCode,
                  },
                },
              });
          if (found) {
            existingBatchIds.add(found.id);
          }
        }
        const sortedBatchIds = [...existingBatchIds].sort();
        for (const batchId of sortedBatchIds) {
          await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batchId}::uuid FOR UPDATE`;
        }

        for (let idx = 0; idx < input.items.length; idx++) {
          const item = input.items[idx]!;

          // Find or create canonical batch
          let batch = item.batchId
            ? await tx.batch.findUnique({ where: { id: item.batchId } })
            : await tx.batch.findUnique({
                where: {
                  productId_canonicalCode: {
                    productId: item.productId,
                    canonicalCode: item.canonicalCode,
                  },
                },
              });

          if (batch && item.batchId && batch.productId !== item.productId) {
            throw ApiError.badRequest(`Batch ${item.batchId} belongs to a different product`);
          }

          if (!batch) {
            batch = await tx.batch.create({
              data: {
                productId: item.productId,
                canonicalCode: item.canonicalCode,
                manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : undefined,
                receiptDate: item.receiptDate ? new Date(item.receiptDate) : receipt.receivedAt,
                expiryDate: new Date(item.expiryDate),
                supplierName: item.supplierName ?? input.supplierName,
                status: "ACTIVE",
              },
            });
          }

          // Row lock batch for stock ledger serialization (already acquired
          // above in sorted order for pre-existing batches; re-asserted here
          // so newly created batches are locked too, keeping the Phase A–C
          // convention uniform per item).
          await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batch.id}::uuid FOR UPDATE`;

          // Create ReceiptItem
          await tx.receiptItem.create({
            data: {
              receiptId: receipt.id,
              productId: item.productId,
              batchId: batch.id,
              quantity: item.quantity,
              unitCost: item.unitCost,
            },
          });

          // Generate RECEIPT StockMovement
          await tx.stockMovement.create({
            data: {
              warehouseId: input.warehouseId,
              batchId: batch.id,
              movementType: "RECEIPT",
              quantity: item.quantity,
              referenceId: receipt.id,
              createdBy: userId,
              idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}_item_${idx}` : undefined,
              occurredAt: receipt.receivedAt,
            },
          });
        }

        await writeAudit({
          ...auditContext(req),
          action: "receipt.created",
          entityType: "receipt",
          entityId: receipt.id,
          metadata: {
            warehouseId: receipt.warehouseId,
            referenceNo: receipt.referenceNo,
            supplierName: receipt.supplierName,
            itemCount: input.items.length,
          },
        });

        return receipt;
      });

      return receiptsRepository.getReceiptById(createdReceipt.id);
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Receipt with this idempotency key already exists");
      }
      throw err;
    }
  },
};

