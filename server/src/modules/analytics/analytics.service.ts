import { analyticsRepository } from "./analytics.repository.js";
import type { AnalyticsQuery } from "./analytics.validation.js";

/**
 * Analytics is read-only intelligence over the immutable ledger and the
 * completed M3 modules' records. It never mutates stock and introduces no
 * forecasting, ML, or LLM features — every figure is deterministic
 * aggregation of recorded data.
 */
export const analyticsService = {
  getSummary(query: AnalyticsQuery) {
    return analyticsRepository.getSummary(query);
  },
};
