import type { MovementType, StockCountStatus } from "@prisma/client";
import type { ReconciliationCondition } from "./reconciliation.validation.js";

export interface ReconciliationWarehouseStock {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  /** Ledger-derived balance for this batch in this warehouse (may be 0). */
  availableQuantity: number;
  /** Warehouse-scoped alias codes for this canonical batch (empty if none). */
  aliasCodes: string[];
  aliasSources: string[];
}

export interface ReconciliationOpenVariance {
  stockCountId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: StockCountStatus;
  referenceNo: string | null;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  countedAt: Date | null;
  approvedAt: Date | null;
}

export interface ReconciliationMovement {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  movementType: MovementType;
  quantity: number;
  referenceId: string | null;
  occurredAt: Date;
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
  expiryDate: Date;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  /** One entry per warehouse with movement history for this batch. */
  warehouses: ReconciliationWarehouseStock[];
  /** Sum of positive per-warehouse balances (NUMERIC(19,4)-safe). */
  totalQuantity: number;
  /** Warehouses currently holding a positive balance. */
  warehouseCount: number;
  aliasCount: number;
  openVariances: ReconciliationOpenVariance[];
  recentMovements: ReconciliationMovement[];
  conditions: ReconciliationCondition[];
}

export interface ReconciliationTotals {
  batches: number;
  totalQuantity: number;
  multiWarehouseBatches: number;
  expiredStockBatches: number;
  openVarianceBatches: number;
}
