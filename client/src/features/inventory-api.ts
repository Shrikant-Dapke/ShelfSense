import { apiFetch } from "@/lib/api-client";
import type { Product, Warehouse } from "@/lib/types";

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

function toSearchParams(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ---------- Products ----------

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  sortBy?: "name" | "sku" | "category" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export async function listProducts(params: ProductListParams = {}): Promise<Paginated<Product>> {
  const res = await apiFetch<Product[]>(`/products${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function createProduct(input: {
  name: string;
  sku: string;
  category: string;
  unit: string;
  brand?: string;
}): Promise<Product> {
  const res = await apiFetch<Product>("/products", { method: "POST", body: input });
  return res.data;
}

// ---------- Warehouses ----------

export interface WarehouseListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: "true" | "false";
}

export async function listWarehouses(
  params: WarehouseListParams = {},
): Promise<Paginated<Warehouse>> {
  const res = await apiFetch<Warehouse[]>(`/warehouses${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function createWarehouse(input: {
  name: string;
  code: string;
  location?: string;
}): Promise<Warehouse> {
  const res = await apiFetch<Warehouse>("/warehouses", { method: "POST", body: input });
  return res.data;
}

// ---------- Receipts ----------

export interface ReceiptItemPayload {
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

export interface CreateReceiptPayload {
  warehouseId: string;
  supplierName?: string;
  referenceNo?: string;
  receivedAt?: string;
  items: ReceiptItemPayload[];
  idempotencyKey?: string;
}

export interface ReceiptItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  manufacturingDate: string | null;
  receiptDate: string | null;
  expiryDate: string;
  supplierName: string | null;
  quantity: number;
  unitCost: number | null;
}

export interface ReceiptView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  supplierName: string | null;
  referenceNo: string | null;
  receivedAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: ReceiptItemView[];
}

export interface ReceiptListParams {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  supplierName?: string;
  sortBy?: "receivedAt" | "createdAt" | "supplierName" | "referenceNo";
  sortOrder?: "asc" | "desc";
}

export async function listReceipts(params: ReceiptListParams = {}): Promise<Paginated<ReceiptView>> {
  const res = await apiFetch<ReceiptView[]>(`/receipts${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getReceipt(id: string): Promise<ReceiptView> {
  const res = await apiFetch<ReceiptView>(`/receipts/${id}`);
  return res.data;
}

export async function createReceipt(payload: CreateReceiptPayload): Promise<ReceiptView> {
  const res = await apiFetch<ReceiptView>("/receipts", { method: "POST", body: payload });
  return res.data;
}

// ---------- Inventory / Stock ----------

export interface InventoryItemView {
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
  manufacturingDate: string | null;
  receiptDate: string | null;
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  availableQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  lastMovementAt: string | null;
}

export interface InventoryListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string;
  category?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  lowStock?: "true" | "false";
  sortBy?: "productName" | "productSku" | "canonicalCode" | "expiryDate" | "availableQuantity" | "warehouseName";
  sortOrder?: "asc" | "desc";
}

export async function listInventory(params: InventoryListParams = {}): Promise<Paginated<InventoryItemView>> {
  const res = await apiFetch<InventoryItemView[]>(`/inventory${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

// ---------- Dispatches ----------

export interface DispatchItemPayload {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface CreateDispatchPayload {
  warehouseId: string;
  referenceNo?: string;
  dispatchedAt?: string;
  items: DispatchItemPayload[];
  idempotencyKey?: string;
}

export interface DispatchItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: string;
  quantity: number;
}

export interface DispatchView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  referenceNo: string | null;
  dispatchedAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: DispatchItemView[];
}

export interface DispatchListParams {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  referenceNo?: string;
  sortBy?: "dispatchedAt" | "createdAt" | "referenceNo";
  sortOrder?: "asc" | "desc";
}

export async function listDispatches(params: DispatchListParams = {}): Promise<Paginated<DispatchView>> {
  const res = await apiFetch<DispatchView[]>(`/dispatches${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getDispatch(id: string): Promise<DispatchView> {
  const res = await apiFetch<DispatchView>(`/dispatches/${id}`);
  return res.data;
}

export async function createDispatch(payload: CreateDispatchPayload): Promise<DispatchView> {
  const res = await apiFetch<DispatchView>("/dispatches", { method: "POST", body: payload });
  return res.data;
}


