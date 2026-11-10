import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { inventoryRepository } from "./inventory.repository.js";
import type { InventoryQuery, StockAdjustmentInput, TransferInput, MovementQuery } from "./inventory.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const inventoryService = {
  async listInventory(query: InventoryQuery) {
    return inventoryRepository.getInventory(query);
  },

  async getStockBalance(warehouseId: string, batchId: string) {
    return inventoryRepository.getStockBalance(warehouseId, batchId);
  },

  async listMovements(query: MovementQuery) {
    return inventoryRepository.getMovements(query);
  },

  async adjustStock(input: StockAdjustmentInput, req: Request) {
    const { warehouseId, batchId, quantity, reason, idempotencyKey } = input;

    // Check if batch exists
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true },
    });
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw ApiError.notFound("Warehouse not found or inactive");
    }

    // Check for duplicate idempotency key upfront
    if (idempotencyKey) {
      const existing = await prisma.stockMovement.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        throw ApiError.conflict("Stock movement with this idempotency key already exists");
      }
    }

    try {
      const movement = await prisma.$transaction(async (tx) => {
        // Concurrency-safe lock and balance check
        const available = await inventoryRepository.getAvailableQuantity(tx, warehouseId, batchId, { forUpdate: true });

        if (quantity < 0 && available + quantity < 0) {
          throw ApiError.badRequest(`Adjustment would result in negative stock. Current available: ${available}, Adjustment: ${quantity}`);
        }

        const mv = await inventoryRepository.createStockMovement(tx, {
          warehouseId,
          batchId,
          movementType: "ADJUSTMENT",
          quantity,
          createdBy: (req as any).user.id,
          idempotencyKey,
          occurredAt: new Date(),
        });

        await writeAudit({
          ...auditContext(req),
          action: "inventory.adjusted",
          entityType: "stock_movement",
          entityId: mv.id,
          metadata: {
            warehouseId,
            batchId,
            canonicalCode: batch.canonicalCode,
            quantity,
            reason,
          },
        });

        return mv;
      });

      return movement;
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Stock movement with this idempotency key already exists");
      }
      throw err;
    }
  },

  async transferStock(input: TransferInput, req: Request) {
    const { fromWarehouseId, toWarehouseId, batchId, quantity, referenceId, idempotencyKey } = input;

    if (fromWarehouseId === toWarehouseId) {
      throw ApiError.badRequest("Source and destination warehouses must be different");
    }

    // Verify both warehouses exist and are active
    const [fromWh, toWh] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: fromWarehouseId } }),
      prisma.warehouse.findUnique({ where: { id: toWarehouseId } }),
    ]);

    if (!fromWh || !fromWh.isActive) {
      throw ApiError.notFound("Source warehouse not found or inactive");
    }
    if (!toWh || !toWh.isActive) {
      throw ApiError.notFound("Destination warehouse not found or inactive");
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true },
    });
    if (!batch) {
      throw ApiError.notFound("Batch not found");
    }

    // Check idempotency upfront
    if (idempotencyKey) {
      const existingOut = await prisma.stockMovement.findUnique({
        where: { idempotencyKey: `${idempotencyKey}_out` },
      });
      if (existingOut) {
        throw ApiError.conflict("Transfer with this idempotency key already exists");
      }
    }

    try {
      const { transferOutId, transferInId } = await prisma.$transaction(async (tx) => {
        // Concurrency-safe lock and available quantity validation
        const available = await inventoryRepository.getAvailableQuantity(tx, fromWarehouseId, batchId, { forUpdate: true });
        if (available < quantity) {
          throw ApiError.badRequest(`Insufficient stock. Available: ${available}, Requested: ${quantity}`);
        }

        // Transfer out from source
        const transferOut = await inventoryRepository.createStockMovement(tx, {
          warehouseId: fromWarehouseId,
          batchId,
          movementType: "TRANSFER_OUT",
          quantity,
          referenceId,
          createdBy: (req as any).user.id,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}_out` : undefined,
          occurredAt: new Date(),
        });

        // Transfer in to destination
        const transferIn = await inventoryRepository.createStockMovement(tx, {
          warehouseId: toWarehouseId,
          batchId,
          movementType: "TRANSFER_IN",
          quantity,
          referenceId,
          createdBy: (req as any).user.id,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}_in` : undefined,
          occurredAt: new Date(),
        });

        await writeAudit({
          ...auditContext(req),
          action: "inventory.transferred",
          entityType: "stock_movement",
          entityId: transferOut.id,
          metadata: {
            fromWarehouseId,
            toWarehouseId,
            batchId,
            canonicalCode: batch.canonicalCode,
            quantity,
            referenceId,
          },
        });

        return { transferOutId: transferOut.id, transferInId: transferIn.id };
      });

      return { transferOutId, transferInId };
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("Transfer with this idempotency key already exists");
      }
      throw err;
    }
  },

  async getInventorySummary(warehouseId?: string) {
    const where = warehouseId ? { warehouseId } : {};
    const totalItems = await prisma.batch.count({
      where: { status: "ACTIVE", ...where },
    });
    const totalMovements = await prisma.stockMovement.count({ where });
    const pendingCounts = await prisma.stockCount.count({ where: { status: "PENDING", ...where } });
    const expiredBatches = await prisma.batch.count({
      where: { status: "ACTIVE", expiryDate: { lt: new Date() }, ...where },
    });

    return {
      totalItems,
      totalMovements,
      pendingCounts,
      expiredBatches,
    };
  },
};
