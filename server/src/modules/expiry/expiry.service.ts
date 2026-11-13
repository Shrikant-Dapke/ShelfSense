import { expiryRepository } from "./expiry.repository.js";
import type { ExpiryMonitorQuery, ExpiryTrendsQuery } from "./expiry.validation.js";

/**
 * Expiry intelligence is read-only monitoring. It classifies ledger stock
 * with the shared global thresholds (utils/expiry.ts) and estimates value
 * from actual receipt unit costs — it never dispatches, quarantines,
 * wastes, or otherwise mutates stock. Acting on at-risk stock happens
 * through the existing dispatch, waste, and stock-count workflows.
 */
export const expiryService = {
  getMonitor(query: ExpiryMonitorQuery) {
    return expiryRepository.getMonitor(query);
  },

  getTrends(query: ExpiryTrendsQuery) {
    return expiryRepository.getTrends(query);
  },
};
