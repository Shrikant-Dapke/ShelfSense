import { z } from "zod";

export const analyticsPeriods = ["7d", "30d", "90d", "12m"] as const;

export const analyticsQuerySchema = z.object({
  period: z.enum(analyticsPeriods).default("30d"),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

export type AnalyticsPeriod = (typeof analyticsPeriods)[number];
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
