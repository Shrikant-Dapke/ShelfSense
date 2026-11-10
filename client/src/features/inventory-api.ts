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

