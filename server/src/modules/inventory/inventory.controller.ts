import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { inventoryService } from "./inventory.service.js";
import { inventoryQuerySchema, movementQuerySchema, stockAdjustmentSchema, transferSchema } from "./inventory.validation.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listInventory: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await inventoryService.listInventory(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getStockBalance: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouseId = Array.isArray(req.params.warehouseId) ? req.params.warehouseId[0] : req.params.warehouseId;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
      if (!warehouseId || !batchId || !uuidSchema.test(warehouseId) || !uuidSchema.test(batchId)) {
        throw ApiError.badRequest("Invalid warehouse or batch ID");
      }
      const balance = await inventoryService.getStockBalance(warehouseId, batchId);
      if (!balance) {
        throw ApiError.notFound("No stock found for this batch in this warehouse");
      }
      sendSuccess(res, balance);
    } catch (err) {
      next(err);
    }
  })();
};

export const listMovements: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await inventoryService.listMovements(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const adjustStock: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const movement = await inventoryService.adjustStock(req.body, req);
      sendSuccess(res, movement, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const transferStock: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const result = await inventoryService.transferStock(req.body, req);
      sendSuccess(res, result, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const getInventorySummary: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouseId = req.query.warehouseId as string | undefined;
      if (warehouseId && !uuidSchema.test(warehouseId)) {
        throw ApiError.badRequest("Invalid warehouse ID");
      }
      const summary = await inventoryService.getInventorySummary(warehouseId);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  })();
};

export const inventoryRouterHandlers = { requireAuth, requireRoles, validate };