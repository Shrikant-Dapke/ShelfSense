import type { WasteReason } from "@prisma/client";

export interface WasteRecordView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: Date;
  batchStatus: string;
  quantity: number;
  reason: WasteReason;
  recordedAt: Date;
  recordedBy: string;
  recordedByName: string;
  notes: string | null;
  relatedStockMovementId: string | null;
  createdAt: Date;
}

export interface WasteSummaryByReason {
  reason: WasteReason;
  records: number;
  totalQuantity: number;
}

export interface WasteSummaryByWarehouse {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  records: number;
  totalQuantity: number;
}

export interface WasteSummary {
  totalRecords: number;
  totalQuantity: number;
  byReason: WasteSummaryByReason[];
  byWarehouse: WasteSummaryByWarehouse[];
}
