import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getAnalyticsSummary } from "./analytics.controller.js";
import { analyticsQuerySchema } from "./analytics.validation.js";

/**
 * Read-only module, available to every authenticated role — the same
 * convention as the expiry and reconciliation modules. No mutating routes.
 */
export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get("/summary", validate(analyticsQuerySchema, "query"), getAnalyticsSummary);
