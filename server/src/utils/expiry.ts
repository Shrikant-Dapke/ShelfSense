/**
 * Global expiry classification — the single source of truth for the
 * ShelfSense bucket thresholds. Every module (inventory, batches,
 * reconciliation, expiry) must use these helpers instead of keeping a
 * local copy so a batch can never be classified differently between
 * modules.
 *
 * Buckets by days-to-expiry (DTE):
 *   DTE <= 0     -> EXPIRED
 *   DTE 1–6      -> CRITICAL
 *   DTE 7–14     -> WARNING
 *   DTE 15–30    -> MONITOR
 *   DTE > 30     -> SAFE
 *
 * Days are computed against the server's local calendar (the deployment
 * timezone), consistent with the rest of the ledger architecture.
 */

export type ExpiryStatus = "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";

export function daysToExpiry(expiryDate: Date): number {
  const now = new Date();
  const diff = expiryDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function expiryStatus(days: number): ExpiryStatus {
  if (days <= 0) return "EXPIRED";
  if (days <= 6) return "CRITICAL";
  if (days <= 14) return "WARNING";
  if (days <= 30) return "MONITOR";
  return "SAFE";
}

export function classifyExpiry(expiryDate: Date): { daysToExpiry: number; expiryStatus: ExpiryStatus } {
  const days = daysToExpiry(expiryDate);
  return { daysToExpiry: days, expiryStatus: expiryStatus(days) };
}
