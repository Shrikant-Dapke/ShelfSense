import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createProduct,
  deactivateProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./products.controller.js";
import { createProductSchema, productQuerySchema, updateProductSchema } from "./products.validation.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", validate(productQuerySchema, "query"), listProducts);
productsRouter.post("/", requireRoles("ADMIN", "MANAGER"), validate(createProductSchema), createProduct);
productsRouter.get("/:id", getProduct);
productsRouter.patch("/:id", requireRoles("ADMIN", "MANAGER"), validate(updateProductSchema), updateProduct);
productsRouter.delete("/:id", requireRoles("ADMIN"), deactivateProduct);
