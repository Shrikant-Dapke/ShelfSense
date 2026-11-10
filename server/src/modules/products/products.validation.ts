import { z } from "zod";

export const PRODUCT_CATEGORIES = [
  "Dairy",
  "Fruits and Vegetables",
  "Packaged Food",
  "Bakery",
  "Frozen Food",
  "Beverages",
] as const;

export const PRODUCT_UNITS = ["kg", "g", "L", "mL", "unit", "pack", "crate"] as const;

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: z
    .string()
    .trim()
    .min(2, "SKU must be at least 2 characters")
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, "SKU may only contain letters, digits, dots, dashes and underscores")
    .transform((v) => v.toUpperCase()),
  category: z.string().trim().min(1, "Category is required").max(100),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  brand: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["name", "sku", "category", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
