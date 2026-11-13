export interface DispatchItemInput {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface CreateDispatchInput {
  warehouseId: string;
  referenceNo?: string;
  dispatchedAt?: string;
  items: DispatchItemInput[];
  idempotencyKey?: string;
}

export interface DispatchQuery {
  page: number;
  pageSize: number;
  sortBy: "dispatchedAt" | "createdAt" | "referenceNo";
  sortOrder: "asc" | "desc";
  warehouseId?: string;
  referenceNo?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * FEFO allocation recommendation (advisory snapshot). Never persisted,
 * never executed — POST /dispatches remains the sole execution authority.
 */
export interface FefoAllocation {
  order: number;
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
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  receiptDate: Date | null;
  availableQuantity: number;
  recommendedQuantity: number;
}

export interface FefoRecommendation {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  requestedQuantity: number;
  totalEligibleQuantity: number;
  allocatedQuantity: number;
  /** Explicit when totalEligibleQuantity < requestedQuantity. */
  shortfall: number;
  allocations: FefoAllocation[];
}

export interface DispatchItemWithDetails {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: Date;
  quantity: number;
}

export interface DispatchWithItems {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  referenceNo: string | null;
  dispatchedAt: Date;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  items: DispatchItemWithDetails[];
}
