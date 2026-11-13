import { z } from "zod";

export const expiryBucketValues = ["SAFE", "MONITOR", "WARNING", "CRITICAL", "EXPIRED"] as const;

export const expiryMonitorQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  // Narrows the near-expiry / expired lists to one bucket; the bucket
  // overview always describes the full (warehouse/product-scoped)
  // distribution so the cards stay meaningful.
  expiryStatus: z.enum(expiryBucketValues).optional(),
});

export type ExpiryMonitorQuery = z.infer<typeof expiryMonitorQuerySchema>;

export const expiryTrendsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

export type ExpiryTrendsQuery = z.infer<typeof expiryTrendsQuerySchema>;
