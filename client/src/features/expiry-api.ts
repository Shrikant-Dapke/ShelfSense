import { apiFetch } from "@/lib/api-client";
import { toSearchParams as buildQuery } from "@/features/inventory-api";

export type ExpiryBucketName = "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface ExpiryBucket {
  batches: number;
  totalQuantity: number;
}

export interface ExpiryMonitorTotals {
  batchesWithStock: number;
  totalQuantity: number;
  estimatedValueAtRisk: number;
  quantityWithCost: number;
  quantityWithoutCost: number;
}

export interface ExpiryWarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  buckets: Record<ExpiryBucketName, number>;
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
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: ExpiryBucketName;
  availableQuantity: number;
  estimatedValue: number | null;
  unitCost: number | null;
}

export interface ExpiryMonitor {
  buckets: Record<ExpiryBucketName, ExpiryBucket>;
  totals: ExpiryMonitorTotals;
  warehouses: ExpiryWarehouseBreakdown[];
  atRisk: ExpiryListRow[];
  expired: ExpiryListRow[];
}

export interface ExpiryMonitorParams {
  warehouseId?: string;
  productId?: string;
  expiryStatus?: ExpiryBucketName;
}

export async function getExpiryMonitor(params: ExpiryMonitorParams = {}): Promise<ExpiryMonitor> {
  const res = await apiFetch<ExpiryMonitor>(`/expiry/monitor${buildQuery(params)}`);
  return res.data;
}

export interface ExpiryTrendMonth {
  month: string;
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
  totals: { expiredQuantity: number; expiredRecords: number; totalWasteQuantity: number };
  byReason: Array<{ reason: string; records: number; quantity: number }>;
  byWarehouse: ExpiryTrendsBreakdownRow[];
  byProduct: ExpiryTrendsBreakdownRow[];
}

export interface ExpiryTrendsParams {
  months?: number;
  warehouseId?: string;
  productId?: string;
}

export async function getExpiryTrends(params: ExpiryTrendsParams = {}): Promise<ExpiryTrends> {
  const res = await apiFetch<ExpiryTrends>(`/expiry/trends${buildQuery(params)}`);
  return res.data;
}
