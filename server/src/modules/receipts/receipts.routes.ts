import { Router } from "express";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createReceipt, getReceipt, listReceipts } from "./receipts.controller.js";
import { createReceiptSchema, receiptQuerySchema } from "./receipts.validation.js";

export const receiptsRouter = Router();

receiptsRouter.use(requireAuth);

receiptsRouter.get("/", validate(receiptQuerySchema, "query"), listReceipts);
receiptsRouter.get("/:id", getReceipt);
receiptsRouter.post("/", requireRoles("ADMIN", "MANAGER", "OPERATOR"), validate(createReceiptSchema), createReceipt);
