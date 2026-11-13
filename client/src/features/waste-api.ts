import { apiFetch } from "@/lib/api-client";
import { Paginated, toSearchParams as buildQuery } from "@/features/inventory-api";

export type WasteReason = "EXPIRED" | "DAMAGED" | "SPOILED" | "LOST" | "OTHER";

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
  expiryDate: string;
  batchStatus: string;
  quantity: number;
  reason: WasteReason;
  recordedAt: string;
  recordedBy: string;
  recordedByName: string;
  notes: string | null;
  relatedStockMovementId: string | null;
  createdAt: string;
}

export interface WasteListParams {
  page?: number;
  pageSize?: number;
  sortBy?: "recordedAt" | "createdAt" | "reason" | "quantity";
  sortOrder?: "asc" | "desc";
  warehouseId?: string;
  batchId?: string;
  productId?: string;
  reason?: WasteReason;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export async function listWaste(params: WasteListParams = {}): Promise<Paginated<WasteRecordView>> {
  const res = await apiFetch<WasteRecordView[]>(`/waste${buildQuery(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getWasteRecord(id: string): Promise<WasteRecordView> {
  const res = await apiFetch<WasteRecordView>(`/waste/${id}`);
  return res.data;
}

export interface CreateWastePayload {
  warehouseId: string;
  productId: string;
  batchId: string;
  quantity: number;
  reason: WasteReason;
  notes?: string;
  idempotencyKey?: string;
}

export async function createWaste(payload: CreateWastePayload): Promise<WasteRecordView> {
  const res = await apiFetch<WasteRecordView>("/waste", { method: "POST", body: payload });
  return res.data;
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

export interface WasteSummaryParams {
  warehouseId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function getWasteSummary(params: WasteSummaryParams = {}): Promise<WasteSummary> {
  const res = await apiFetch<WasteSummary>(`/waste/summary${buildQuery(params)}`);
  return res.data;
}
