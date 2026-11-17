import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { auditLogsQuerySchema } from "./audit.validation.js";
import { listAuditLogsHandler } from "./audit.controller.js";

/**
 * Read-only audit-log viewer, ADMIN-only. Audit data is a compliance
 * surface: operators and managers get no visibility here.
 */
export const auditRouter = Router();

auditRouter.use(requireAuth, requireRoles("ADMIN"));
auditRouter.get("/", validate(auditLogsQuerySchema, "query"), listAuditLogsHandler);
