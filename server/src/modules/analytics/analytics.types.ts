import type { ExpiryStatus } from "../../utils/expiry.js";
import type { AnalyticsPeriod } from "./analytics.validation.js";

export interface AnalyticsInventory {
  /** Current positive ledger balances in scope (all batch statuses). */
  totalStockQuantity: number;
  /** Distinct products with positive current stock in scope. */
  activeProducts: number;
  /** Distinct warehouses with positive current stock in scope. */
  activeWarehouses: number;
  byCategory: Array<{ category: string; products: number; quantity: number }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    quantity: number;
  }>;
}

export interface AnalyticsMovementBucket {
  /** Local calendar day (YYYY-MM-DD) or month (YYYY-MM). */
  date: string;
  receipts: number;
  dispatches: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
}

export interface AnalyticsMovements {
  series: AnalyticsMovementBucket[];
  totals: {
    receipts: number;
    dispatches: number;
    transfersIn: number;
    transfersOut: number;
    adjustments: number;
    records: number;
  };
}

export interface AnalyticsWaste {
  totalQuantity: number;
  records: number;
  byReason: Array<{ reason: string; records: number; quantity: number }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    quantity: number;
  }>;
  /** RECEIPT movement quantity inside the same window/filters. */
  receivedQuantity: number;
  /** null when nothing was received in the window — an undefined ratio, not 0%. */
  wastePercentOfReceived: number | null;
  /** null when no waste line carries receipt cost data — quantity-only, never fabricated. */
  estimatedValue: number | null;
  quantityWithCost: number;
  quantityWithoutCost: number;
}

export interface AnalyticsExpiry {
  /** Same shape/semantics as the expiry monitor (shared classification). */
  buckets: Record<ExpiryStatus, { batches: number; totalQuantity: number }>;
  /** DTE <= 0 with positive ledger stock. */
  expiredQuantity: number;
  /** DTE 1..30 (CRITICAL + WARNING + MONITOR) with positive ledger stock. */
  nearExpiryQuantity: number;
  estimatedValueAtRisk: number;
  quantityWithCost: number;
  quantityWithoutCost: number;
}

export interface AnalyticsDispatch {
  topProducts: Array<{
    productId: string;
    productName: string;
    productSku: string;
    /** Number of dispatch orders containing the product in the window. */
    dispatches: number;
    quantity: number;
  }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    quantity: number;
  }>;
}

export interface AnalyticsSummary {
  period: AnalyticsPeriod;
  /** "day" for 7d/30d/90d, "month" for 12m. */
  granularity: "day" | "month";
  fromDate: string;
  toDate: string;
  inventory: AnalyticsInventory;
  movements: AnalyticsMovements;
  waste: AnalyticsWaste;
  expiry: AnalyticsExpiry;
  dispatch: AnalyticsDispatch;
}
