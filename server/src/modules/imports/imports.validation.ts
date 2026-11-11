import { z } from "zod";
import { IMPORT_TYPES } from "./imports.types.js";

export const importQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["createdAt", "status", "importType"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  status: z
    .enum([
      "PENDING",
      "VALIDATING",
      "VALIDATED",
      "PROCESSING",
      "COMPLETED",
      "PARTIALLY_COMPLETED",
      "COMMITTED",
      "FAILED",
      "ROLLED_BACK",
    ])
    .optional(),
  importType: z.enum(["PRODUCTS", "BATCHES", "BATCH_ALIASES", "OPENING_STOCK"]).optional(),
});

export const validateImportSchema = z.object({
  /** Explicit column mapping: field name -> header name. */
  columnMapping: z.record(z.string(), z.string().min(1)).optional(),
  /** Warehouse for warehouse-scoped imports when the job has none. */
  warehouseId: z.string().uuid().optional(),
});

export type ImportQuery = z.infer<typeof importQuerySchema>;
export type ValidateImportInput = z.infer<typeof validateImportSchema>;

export const UPLOAD_FIELD_NAMES = {
  importType: "importType",
  warehouseId: "warehouseId",
} as const;
