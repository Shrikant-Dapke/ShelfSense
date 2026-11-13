import { z } from "zod";

export const wasteReasonValues = ["EXPIRED", "DAMAGED", "SPOILED", "LOST", "OTHER"] as const;

export const createWasteSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  productId: z.string().uuid("Invalid product ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  quantity: z.number().positive("Quantity must be greater than zero").multipleOf(0.0001),
  reason: z.enum(wasteReasonValues, { message: "A waste reason is required" }),
  notes: z.string().trim().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
  idempotencyKey: z.string().uuid("Invalid idempotency key").optional(),
});

export type CreateWasteInput = z.infer<typeof createWasteSchema>;

export const wasteQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["recordedAt", "createdAt", "reason", "quantity"]).default("recordedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  reason: z.enum(wasteReasonValues).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  search: z.string().trim().max(100).optional(),
});

export type WasteQuery = z.infer<typeof wasteQuerySchema>;

export const wasteSummaryQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type WasteSummaryQuery = z.infer<typeof wasteSummaryQuerySchema>;
