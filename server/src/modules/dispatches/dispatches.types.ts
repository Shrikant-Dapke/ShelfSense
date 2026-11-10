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
