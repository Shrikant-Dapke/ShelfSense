import { z } from "zod";

export const dispatchItemInputSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  quantity: z.number().positive("Quantity must be greater than zero").multipleOf(0.0001),
});

export const createDispatchSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  referenceNo: z.string().trim().max(100).optional(),
  dispatchedAt: z.string().datetime().optional().default(() => new Date().toISOString()),
  items: z.array(dispatchItemInputSchema).min(1, "At least one item is required in a dispatch"),
  idempotencyKey: z.string().uuid("Invalid idempotency key").optional(),
});

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type DispatchItemInput = z.infer<typeof dispatchItemInputSchema>;

/**
 * FEFO recommendation request — advisory only; the endpoint never writes.
 */
export const dispatchRecommendationSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  productId: z.string().uuid("Invalid product ID"),
  // Query params arrive as strings — coerce like every other query schema.
  quantity: z.coerce.number().positive("Quantity must be greater than zero").multipleOf(0.0001),
});

export type DispatchRecommendationInput = z.infer<typeof dispatchRecommendationSchema>;

export const dispatchQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["dispatchedAt", "createdAt", "referenceNo"]).default("dispatchedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  referenceNo: z.string().trim().max(100).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type DispatchQuery = z.infer<typeof dispatchQuerySchema>;
