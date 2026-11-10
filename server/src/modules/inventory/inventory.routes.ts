import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  adjustStock,
  getInventorySummary,
  getStockBalance,
  listInventory,
  listMovements,
  transferStock,
} from "./inventory.controller.js";
import { inventoryQuerySchema, movementQuerySchema, stockAdjustmentSchema, transferSchema } from "./inventory.validation.js";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get("/", validate(inventoryQuerySchema, "query"), listInventory);
inventoryRouter.get("/summary", getInventorySummary);
inventoryRouter.get("/movements", validate(movementQuerySchema, "query"), listMovements);
inventoryRouter.get("/balance/:warehouseId/:batchId", getStockBalance);
inventoryRouter.post("/adjust", requireRoles("ADMIN", "MANAGER"), validate(stockAdjustmentSchema), adjustStock);
inventoryRouter.post("/transfer", requireRoles("ADMIN", "MANAGER"), validate(transferSchema), transferStock);