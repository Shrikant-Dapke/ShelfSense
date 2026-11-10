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
