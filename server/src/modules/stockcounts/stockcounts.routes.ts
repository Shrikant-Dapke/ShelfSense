import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  approveStockCount,
  createStockCount,
  getStockCount,
  listStockCounts,
  postStockCount,
  submitStockCount,
  updateStockCount,
} from "./stockcounts.controller.js";
import {
  createStockCountSchema,
  stockCountQuerySchema,
  updateStockCountSchema,
} from "./stockcounts.validation.js";

export const stockCountsRouter = Router();

stockCountsRouter.use(requireAuth);

stockCountsRouter.get("/", validate(stockCountQuerySchema, "query"), listStockCounts);
stockCountsRouter.get("/:id", getStockCount);
// Counting is operator-level work; reviewing and posting stock-affecting
// adjustments is restricted to managers and admins below.
stockCountsRouter.post(
  "/",
  requireRoles("ADMIN", "MANAGER", "OPERATOR"),
  validate(createStockCountSchema),
  createStockCount,
);
stockCountsRouter.patch(
  "/:id",
  requireRoles("ADMIN", "MANAGER", "OPERATOR"),
  validate(updateStockCountSchema),
  updateStockCount,
);
stockCountsRouter.post("/:id/submit", requireRoles("ADMIN", "MANAGER", "OPERATOR"), submitStockCount);
stockCountsRouter.post("/:id/approve", requireRoles("ADMIN", "MANAGER"), approveStockCount);
stockCountsRouter.post("/:id/post", requireRoles("ADMIN", "MANAGER"), postStockCount);
