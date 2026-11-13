import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getReconciliation, getReconciliationOverview } from "./reconciliation.controller.js";
import { reconciliationQuerySchema } from "./reconciliation.validation.js";

/**
 * Read-only module: browsing and overviews are available to every
 * authenticated role. Corrections happen exclusively through the governed
 * ADMIN/MANAGER inventory operations (POST /inventory/adjust,
 * POST /inventory/transfer, stock-count posting) — never through here.
 */
export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth);

reconciliationRouter.get("/", validate(reconciliationQuerySchema, "query"), getReconciliation);
reconciliationRouter.get("/overview", getReconciliationOverview);
