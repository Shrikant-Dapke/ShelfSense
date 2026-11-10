import { z } from "zod";

export const receiptItemInputSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  batchId: z.string().uuid("Invalid batch ID").optional(),
  canonicalCode: z.string().trim().min(1, "Batch code is required").max(100),
  manufacturingDate: z.string().datetime().optional(),
  receiptDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime({ message: "Valid expiry date is required" }),
  supplierName: z.string().trim().max(200).optional(),
  quantity: z.number().positive("Quantity must be greater than zero").multipleOf(0.0001),
  unitCost: z.number().nonnegative("Unit cost cannot be negative").multipleOf(0.0001).optional(),
});

export const createReceiptSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  supplierName: z.string().trim().max(200).optional(),
  referenceNo: z.string().trim().max(100).optional(),
  receivedAt: z.string().datetime().optional().default(() => new Date().toISOString()),
  items: z.array(receiptItemInputSchema).min(1, "At least one item is required in a receipt"),
  idempotencyKey: z.string().uuid("Invalid idempotency key").optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type ReceiptItemInput = z.infer<typeof receiptItemInputSchema>;

export const receiptQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["receivedAt", "createdAt", "supplierName", "referenceNo"]).default("receivedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  supplierName: z.string().trim().max(200).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type ReceiptQuery = z.infer<typeof receiptQuerySchema>;

