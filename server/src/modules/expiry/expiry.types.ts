import type { ExpiryStatus } from "../../utils/expiry.js";

export interface ExpiryBucket {
  batches: number;
  totalQuantity: number;
}

export interface ExpiryMonitorTotals {
  /** Canonical batches with positive ledger balance in scope. */
  batchesWithStock: number;
  totalQuantity: number;
  /** Estimated monetary value (see valueAtRisk rules) — always labeled an estimate. */
  estimatedValueAtRisk: number;
  /** Quantity covered by receipt unit-cost data (the value above is only exact for this part). */
  quantityWithCost: number;
  /** Quantity without any receipt cost — shown as quantity only, never a fabricated value. */
  quantityWithoutCost: number;
}

export interface ExpiryWarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  /** Ledger-derived stock quantity per expiry bucket in this warehouse. */
  buckets: Record<ExpiryStatus, number>;
  totalQuantity: number;
  estimatedValueAtRisk: number;
}

export interface ExpiryListRow {
  batchId: string;
  canonicalCode: string;
  batchStatus: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  expiryDate: Date;
  daysToExpiry: number;
  expiryStatus: ExpiryStatus;
  availableQuantity: number;
  /** null when no receipt cost exists — quantity-only, no fabricated value. */
  estimatedValue: number | null;
  unitCost: number | null;
}

export interface ExpiryMonitor {
  buckets: Record<ExpiryStatus, ExpiryBucket>;
  totals: ExpiryMonitorTotals;
  warehouses: ExpiryWarehouseBreakdown[];
  /** Days-to-expiry 1..30 with positive stock, most urgent first (max 100 rows). */
  atRisk: ExpiryListRow[];
  /** Days-to-expiry <= 0 with positive stock, most urgent first (max 100 rows). */
  expired: ExpiryListRow[];
}

export interface ExpiryTrendMonth {
  /** YYYY-MM (server-local calendar month). */
  month: string;
  expiredQuantity: number;
  expiredRecords: number;
  totalWasteQuantity: number;
}

export interface ExpiryTrendsTotals {
  expiredQuantity: number;
  expiredRecords: number;
  totalWasteQuantity: number;
}

export interface ExpiryTrendsBreakdownRow {
  id: string;
  name: string;
  code: string | null;
  expiredQuantity: number;
  totalWasteQuantity: number;
}

export interface ExpiryTrends {
  months: number;
  series: ExpiryTrendMonth[];
  totals: ExpiryTrendsTotals;
  byReason: Array<{ reason: string; records: number; quantity: number }>;
  byWarehouse: ExpiryTrendsBreakdownRow[];
  byProduct: ExpiryTrendsBreakdownRow[];
}
