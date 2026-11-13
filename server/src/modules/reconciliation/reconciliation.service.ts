import { reconciliationRepository } from "./reconciliation.repository.js";
import type { ReconciliationQuery } from "./reconciliation.validation.js";

/**
 * Reconciliation is strictly read-only: every number it returns is derived
 * from the immutable StockMovement ledger (via the shared
 * calculateBalanceFromMovements helper) plus alias and stock-count reads.
 * Nothing here writes stock, merges batches/aliases, or infers batch
 * identity — discrepancies are surfaced for a human to investigate and
 * resolve through the governed inventory operations (adjust, transfer,
 * stock-count posting) if appropriate.
 */
export const reconciliationService = {
  getReconciliation(query: ReconciliationQuery) {
    return reconciliationRepository.getReconciliation(query);
  },

  getOverview(query: { warehouseId?: string }) {
    return reconciliationRepository.getOverview(query);
  },
};
