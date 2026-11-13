import { apiFetch } from "@/lib/api-client";
import { Paginated, toSearchParams as buildQuery } from "@/features/inventory-api";

export type ReconciliationCondition =
  | "MULTI_WAREHOUSE"
  | "MULTI_ALIAS"
  | "EXPIRED_STOCK"
  | "OPEN_VARIANCE"
  | "INCONSISTENT";

export type ExpiryStatus = "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface ReconciliationWarehouseStock {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  availableQuantity: number;
  aliasCodes: string[];
  aliasSources: string[];
}

export interface ReconciliationOpenVariance {
  stockCountId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  referenceNo: string | null;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  countedAt: string | null;
  approvedAt: string | null;
}

export interface ReconciliationMovement {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  movementType: "RECEIPT" | "DISPATCH" | "WASTE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
  quantity: number;
  referenceId: string | null;
  occurredAt: string;
}

export interface ReconciliationBatchRow {
  batchId: string;
  canonicalCode: string;
  batchStatus: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productUnit: string;
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: ExpiryStatus;
  warehouses: ReconciliationWarehouseStock[];
  totalQuantity: number;
  warehouseCount: number;
  aliasCount: number;
  openVariances: ReconciliationOpenVariance[];
  recentMovements: ReconciliationMovement[];
  conditions: ReconciliationCondition[];
}

export interface ReconciliationListParams {
  page?: number;
  pageSize?: number;
  sortBy?: "canonicalCode" | "productName" | "productSku" | "expiryDate" | "totalQuantity";
  sortOrder?: "asc" | "desc";
  search?: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string;
  condition?: ReconciliationCondition;
  expiryStatus?: ExpiryStatus;
}

export async function getReconciliation(
  params: ReconciliationListParams = {},
): Promise<Paginated<ReconciliationBatchRow>> {
  const res = await apiFetch<ReconciliationBatchRow[]>(`/reconciliation${buildQuery(params)}`);
  return { items: res.data, meta: res.meta! };
}

export interface ReconciliationOverview {
  totalQuantity: number;
  batchesWithStock: number;
  multiWarehouseBatches: number;
  expiredStockBatches: number;
  openVarianceBatches: number;
}

export async function getReconciliationOverview(
  params: { warehouseId?: string } = {},
): Promise<ReconciliationOverview> {
  const res = await apiFetch<ReconciliationOverview>(`/reconciliation/overview${buildQuery(params)}`);
  return res.data;
}
