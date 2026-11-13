import { z } from "zod";

/**
 * Reconciliation conditions surfaced per batch row. They are derived from
 * ledger balances, aliases and open stock counts — never inferred from
 * similar-looking batch codes without an explicit canonical association.
 */
export const reconciliationConditionValues = [
  "MULTI_WAREHOUSE", // positive stock in more than one warehouse
  "MULTI_ALIAS", // different warehouse aliases represent the same canonical batch
  "EXPIRED_STOCK", // batch expired while still holding positive stock
  "OPEN_VARIANCE", // approved/submitted (not yet posted) count variance exists
  "INCONSISTENT", // non-active batch holding stock, or a negative ledger balance
] as const;

export const reconciliationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z
    .enum(["canonicalCode", "productName", "productSku", "expiryDate", "totalQuantity"])
    .default("canonicalCode"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().max(100).optional(),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  condition: z.enum(reconciliationConditionValues).optional(),
  expiryStatus: z.enum(["SAFE", "MONITOR", "WARNING", "CRITICAL", "EXPIRED"]).optional(),
});

export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;
export type ReconciliationCondition = (typeof reconciliationConditionValues)[number];
