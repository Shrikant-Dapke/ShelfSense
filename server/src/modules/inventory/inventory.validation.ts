import { z } from "zod";

export const inventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z
    .enum([
      "productName",
      "productSku",
      "canonicalCode",
      "expiryDate",
      "availableQuantity",
      "warehouseName",
    ])
    .default("productName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().max(100).optional(),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  category: z.string().trim().max(100).optional(),
  expiryStatus: z
    .enum(["SAFE", "MONITOR", "WARNING", "CRITICAL", "EXPIRED"])
    .optional(),
  lowStock: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export interface InventoryQuery {
  page: number;
  pageSize: number;
  sortBy: "productName" | "productSku" | "canonicalCode" | "expiryDate" | "availableQuantity" | "warehouseName";
  sortOrder: "asc" | "desc";
  search?: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string;
  category?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  lowStock?: boolean;
}

export const stockAdjustmentSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  quantity: z.number().multipleOf(0.0001, "Quantity must have at most 4 decimal places"),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  idempotencyKey: z.string().uuid().optional(),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const transferSchema = z.object({
  fromWarehouseId: z.string().uuid("Invalid source warehouse ID"),
  toWarehouseId: z.string().uuid("Invalid destination warehouse ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  quantity: z.number().positive("Quantity must be positive").multipleOf(0.0001),
  referenceId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type TransferInput = z.infer<typeof transferSchema>;

export const movementQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z
    .enum(["occurredAt", "movementType", "quantity", "createdAt"])
    .default("occurredAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  movementType: z
    .enum(["RECEIPT", "DISPATCH", "WASTE", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT"])
    .optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export interface MovementQuery {
  page: number;
  pageSize: number;
  sortBy: "occurredAt" | "movementType" | "quantity" | "createdAt";
  sortOrder: "asc" | "desc";
  warehouseId?: string;
  batchId?: string;
  productId?: string;
  movementType?: "RECEIPT" | "DISPATCH" | "WASTE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
  fromDate?: string;
  toDate?: string;
}