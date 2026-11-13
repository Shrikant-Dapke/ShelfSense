import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getExpiryMonitor, getExpiryTrends } from "./expiry.controller.js";
import { expiryMonitorQuerySchema, expiryTrendsQuerySchema } from "./expiry.validation.js";

/**
 * Read-only module, available to every authenticated role: operators need
 * expiry visibility to act through the dispatch/waste workflows, which
 * enforce their own stricter RBAC. No stock-mutating routes exist here.
 */
export const expiryRouter = Router();

expiryRouter.use(requireAuth);

expiryRouter.get("/monitor", validate(expiryMonitorQuerySchema, "query"), getExpiryMonitor);
expiryRouter.get("/trends", validate(expiryTrendsQuerySchema, "query"), getExpiryTrends);
