export type StockCountStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface StockCountItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: Date;
  /** Ledger-derived expected balance at the time the count item was last computed. */
  expectedQuantity: number;
  /** Physical quantity entered by the counter. */
  countedQuantity: number;
  /** countedQuantity - expectedQuantity (positive = surplus, negative = shortage). */
  variance: number;
}

export interface StockCountView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: StockCountStatus;
  referenceNo: string | null;
  description: string | null;
  countedAt: Date | null;
  countedByName: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  postedByName: string | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: StockCountItemView[];
  totalExpectedQuantity: number;
  totalCountedQuantity: number;
  totalVariance: number;
}

export interface StockCountQuery {
  page: number;
  pageSize: number;
  sortBy: "createdAt" | "countedAt" | "status" | "referenceNo";
  sortOrder: "asc" | "desc";
  warehouseId?: string;
  status?: StockCountStatus;
}
