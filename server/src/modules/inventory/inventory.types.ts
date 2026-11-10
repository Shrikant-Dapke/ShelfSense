import { MovementType } from "@prisma/client";

export interface StockBalance {
  warehouseId: string;
  batchId: string;
  productId: string;
  availableQuantity: number;
  reservedQuantity: number;
  expectedQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  lastMovementAt: Date | null;
}

export interface InventoryQuery {
  page: number;
  pageSize: number;
  sortBy: "productName" | "productSku" | "canonicalCode" | "expiryDate" | "availableQuantity" | "warehouseName";
  sortOrder: "asc" | "desc";
  search?: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string;
  category?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  lowStock?: boolean;
}

export interface InventoryItem {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productUnit: string;
  batchId: string;
  canonicalCode: string;
  manufacturingDate: Date | null;
  receiptDate: Date | null;
  expiryDate: Date;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  availableQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  lastMovementAt: Date | null;
}

export interface MovementSummary {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  batchId: string;
  canonicalCode: string;
  productId: string;
  productName: string;
  productSku: string;
  movementType: MovementType;
  quantity: number;
  referenceId: string | null;
  occurredAt: Date;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface StockAdjustmentInput {
  warehouseId: string;
  batchId: string;
  quantity: number;
  reason: string;
  idempotencyKey?: string;
}

export interface TransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  batchId: string;
  quantity: number;
  referenceId?: string;
  idempotencyKey?: string;
}

export interface MovementQuery {
  page: number;
  pageSize: number;
  sortBy: "occurredAt" | "movementType" | "quantity" | "createdAt";
  sortOrder: "asc" | "desc";
  warehouseId?: string;
  batchId?: string;
  productId?: string;
  movementType?: "RECEIPT" | "DISPATCH" | "WASTE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
  fromDate?: string;
  toDate?: string;
}