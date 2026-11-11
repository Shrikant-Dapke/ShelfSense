import { z } from "zod";

export const createBatchSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  canonicalCode: z.string().trim().min(1, "Canonical batch code is required").max(100),
  manufacturingDate: z.string().datetime().optional(),
  receiptDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime({ message: "Valid expiry date is required" }),
  supplierName: z.string().trim().max(200).optional(),
  status: z.enum(["ACTIVE", "QUARANTINED", "RECALLED"]).default("ACTIVE"),
});

export const updateBatchSchema = z.object({
  status: z.enum(["ACTIVE", "QUARANTINED", "RECALLED"]).optional(),
  supplierName: z.string().trim().max(200).optional(),
  expiryDate: z.string().datetime().optional(),
});

export const createBatchAliasSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  externalCode: z.string().trim().min(1, "External alias code is required").max(100),
  source: z.string().trim().max(50).default("MANUAL"),
});

export const batchQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["canonicalCode", "expiryDate", "createdAt", "status"]).default("expiryDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  productId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "QUARANTINED", "RECALLED"]).optional(),
  warehouseId: z.string().uuid().optional(),
  expiryStatus: z.enum(["SAFE", "MONITOR", "WARNING", "CRITICAL", "EXPIRED"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type CreateBatchAliasInput = z.infer<typeof createBatchAliasSchema>;
export type BatchQuery = z.infer<typeof batchQuerySchema>;

