import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  executeImport,
  getImport,
  listImports,
  multerUpload,
  previewImport,
  uploadImport,
  validateImport,
} from "./imports.controller.js";
import { importQuerySchema, validateImportSchema } from "./imports.validation.js";

export const importsRouter = Router();

importsRouter.use(requireAuth);

// History and details are read-only; every authenticated role may inspect.
importsRouter.get("/", validate(importQuerySchema, "query"), listImports);
importsRouter.get("/:id", getImport);
importsRouter.get("/:id/preview", previewImport);

// Mutations are restricted to admins and managers.
importsRouter.post("/upload", requireRoles("ADMIN", "MANAGER"), multerUpload, uploadImport);
importsRouter.post(
  "/:id/validate",
  requireRoles("ADMIN", "MANAGER"),
  validate(validateImportSchema),
  validateImport,
);
importsRouter.post("/:id/execute", requireRoles("ADMIN", "MANAGER"), executeImport);
