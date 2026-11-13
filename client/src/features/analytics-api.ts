import { apiFetch } from "@/lib/api-client";
import { toSearchParams } from "@/features/inventory-api";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "12m";

export type ExpiryBucketName = "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface AnalyticsInventory {
  totalStockQuantity: number;
  activeProducts: number;
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
  date: string;
  receipts: number;
  dispatches: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
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
  receivedQuantity: number;
  wastePercentOfReceived: number | null;
  estimatedValue: number | null;
  quantityWithCost: number;
  quantityWithoutCost: number;
}

export interface AnalyticsExpiry {
  buckets: Record<ExpiryBucketName, { batches: number; totalQuantity: number }>;
  expiredQuantity: number;
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
  granularity: "day" | "month";
  fromDate: string;
  toDate: string;
  inventory: AnalyticsInventory;
  movements: AnalyticsMovementsShape;
  waste: AnalyticsWaste;
  expiry: AnalyticsExpiry;
  dispatch: AnalyticsDispatch;
}

interface AnalyticsMovementsShape {
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

export interface AnalyticsParams {
  period?: AnalyticsPeriod;
  warehouseId?: string;
  productId?: string;
}

export async function getAnalyticsSummary(params: AnalyticsParams = {}): Promise<AnalyticsSummary> {
  const res = await apiFetch<AnalyticsSummary>(`/analytics/summary${toSearchParams(params)}`);
  return res.data;
}
