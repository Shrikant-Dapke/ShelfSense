import { Prisma } from "@prisma/client";

export interface ReceiptItemInput {
  productId: string;
  batchId?: string;
  canonicalCode: string;
  manufacturingDate?: string;
  receiptDate?: string;
  expiryDate: string;
  supplierName?: string;
  quantity: number;
  unitCost?: number;
}

export interface CreateReceiptInput {
  warehouseId: string;
  supplierName?: string;
  referenceNo?: string;
  receivedAt: string;
  items: ReceiptItemInput[];
  idempotencyKey?: string;
}

export interface ReceiptQuery {
  page: number;
  pageSize: number;
  sortBy: "receivedAt" | "createdAt" | "supplierName" | "referenceNo";
  sortOrder: "asc" | "desc";
  warehouseId?: string;
  supplierName?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ReceiptWithItems {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  supplierName: string | null;
  referenceNo: string | null;
  receivedAt: Date;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  items: ReceiptItemWithDetails[];
}

export interface ReceiptItemWithDetails {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  manufacturingDate: Date | null;
  receiptDate: Date | null;
  expiryDate: Date;
  supplierName: string | null;
  quantity: number;
  unitCost: number | null;
}