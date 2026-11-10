import { Router } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { warehousesService } from "./warehouses.service.js";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseQuerySchema,
  type WarehouseQuery,
} from "./warehouses.validation.js";
import type { RequestHandler } from "express";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid warehouse id format");
  }
  return id;
}

const listWarehouses: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      // req.query has already been parsed/transformed by validate(warehouseQuerySchema).
      const query = req.query as unknown as WarehouseQuery;
      const { items, total } = await warehousesService.list(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

const createWarehouse: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouse = await warehousesService.create(req.body, req);
      sendSuccess(res, warehouse, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

const getWarehouse: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouse = await warehousesService.getById(parseId(req));
      sendSuccess(res, warehouse);
    } catch (err) {
      next(err);
    }
  })();
};

const updateWarehouse: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouse = await warehousesService.update(parseId(req), req.body, req);
      sendSuccess(res, warehouse);
    } catch (err) {
      next(err);
    }
  })();
};

const deactivateWarehouse: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const warehouse = await warehousesService.deactivate(parseId(req), req);
      sendSuccess(res, warehouse);
    } catch (err) {
      next(err);
    }
  })();
};

export const warehousesRouter = Router();

warehousesRouter.use(requireAuth);

warehousesRouter.get("/", validate(warehouseQuerySchema, "query"), listWarehouses);
warehousesRouter.post("/", requireRoles("ADMIN"), validate(createWarehouseSchema), createWarehouse);
warehousesRouter.get("/:id", getWarehouse);
warehousesRouter.patch("/:id", requireRoles("ADMIN"), validate(updateWarehouseSchema), updateWarehouse);
warehousesRouter.delete("/:id", requireRoles("ADMIN"), deactivateWarehouse);
