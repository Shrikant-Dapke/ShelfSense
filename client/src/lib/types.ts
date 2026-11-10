export type UserRole = "ADMIN" | "MANAGER" | "OPERATOR";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  brand: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
