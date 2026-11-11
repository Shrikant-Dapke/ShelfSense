export type BatchStatus = "ACTIVE" | "QUARANTINED" | "RECALLED";

export interface CreateBatchInput {
  productId: string;
  canonicalCode: string;
  manufacturingDate?: string;
  receiptDate?: string;
  expiryDate: string;
  supplierName?: string;
  status?: BatchStatus;
}

export interface UpdateBatchInput {
  status?: BatchStatus;
  supplierName?: string;
  expiryDate?: string;
}

export interface CreateBatchAliasInput {
  warehouseId: string;
  externalCode: string;
  source?: string;
}

export interface BatchQuery {
  page: number;
  pageSize: number;
  sortBy: "canonicalCode" | "expiryDate" | "createdAt" | "status";
  sortOrder: "asc" | "desc";
  productId?: string;
  status?: BatchStatus;
  warehouseId?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  search?: string;
}

export interface BatchWarehouseStock {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  availableQuantity: number;
}

export interface BatchAliasView {
  id: string;
  batchId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  externalCode: string;
  normalizedCode: string;
  source: string;
  createdAt: Date;
}

export interface BatchView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productUnit: string;
  canonicalCode: string;
  manufacturingDate: Date | null;
  receiptDate: Date | null;
  expiryDate: Date;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  supplierName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  totalAvailableStock: number;
  warehouses: BatchWarehouseStock[];
  aliases: BatchAliasView[];
}

