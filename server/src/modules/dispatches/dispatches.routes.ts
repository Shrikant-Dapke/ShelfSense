import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createDispatch, getDispatch, listDispatches } from "./dispatches.controller.js";
import { createDispatchSchema, dispatchQuerySchema } from "./dispatches.validation.js";

export const dispatchesRouter = Router();

dispatchesRouter.use(requireAuth);

dispatchesRouter.get("/", validate(dispatchQuerySchema, "query"), listDispatches);
dispatchesRouter.get("/:id", getDispatch);
dispatchesRouter.post("/", requireRoles("ADMIN", "MANAGER", "OPERATOR"), validate(createDispatchSchema), createDispatch);
