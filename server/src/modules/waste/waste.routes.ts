import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createWaste, getWasteRecord, getWasteSummary, listWaste } from "./waste.controller.js";
import {
  createWasteSchema,
  wasteQuerySchema,
  wasteSummaryQuerySchema,
} from "./waste.validation.js";

export const wasteRouter = Router();

wasteRouter.use(requireAuth);

// NOTE: /summary must be registered before /:id so "summary" is never
// captured as an ID parameter.
wasteRouter.get("/summary", requireRoles("ADMIN", "MANAGER"), validate(wasteSummaryQuerySchema, "query"), getWasteSummary);
wasteRouter.get("/", validate(wasteQuerySchema, "query"), listWaste);
wasteRouter.get("/:id", getWasteRecord);
wasteRouter.post("/", requireRoles("ADMIN", "MANAGER", "OPERATOR"), validate(createWasteSchema), createWaste);
