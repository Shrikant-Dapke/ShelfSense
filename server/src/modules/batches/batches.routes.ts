import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createBatch,
  createBatchAlias,
  getBatch,
  listBatches,
  updateBatch,
} from "./batches.controller.js";
import {
  batchQuerySchema,
  createBatchAliasSchema,
  createBatchSchema,
  updateBatchSchema,
} from "./batches.validation.js";

export const batchesRouter = Router();

batchesRouter.use(requireAuth);

batchesRouter.get("/", validate(batchQuerySchema, "query"), listBatches);
batchesRouter.get("/:id", getBatch);
batchesRouter.post("/", requireRoles("ADMIN", "MANAGER"), validate(createBatchSchema), createBatch);
batchesRouter.patch("/:id", requireRoles("ADMIN", "MANAGER"), validate(updateBatchSchema), updateBatch);
batchesRouter.post("/:id/aliases", requireRoles("ADMIN", "MANAGER"), validate(createBatchAliasSchema), createBatchAlias);

