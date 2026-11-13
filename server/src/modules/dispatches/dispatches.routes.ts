import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createDispatch,
  getDispatch,
  getDispatchRecommendation,
  listDispatches,
} from "./dispatches.controller.js";
import {
  createDispatchSchema,
  dispatchQuerySchema,
  dispatchRecommendationSchema,
} from "./dispatches.validation.js";

export const dispatchesRouter = Router();

dispatchesRouter.use(requireAuth);

// NOTE: /recommendations must be registered before /:id so the literal
// path is never captured as an ID parameter (same convention as
// /waste/summary).
dispatchesRouter.get(
  "/recommendations",
  validate(dispatchRecommendationSchema, "query"),
  getDispatchRecommendation,
);
dispatchesRouter.get("/", validate(dispatchQuerySchema, "query"), listDispatches);
dispatchesRouter.get("/:id", getDispatch);
dispatchesRouter.post("/", requireRoles("ADMIN", "MANAGER", "OPERATOR"), validate(createDispatchSchema), createDispatch);
