import { normalizeBatchCode } from "../batches/batches.utils.js";
import type { ImportType } from "./imports.types.js";

export type ImportFieldType =
  | "name"
  | "sku"
  | "category"
  | "unit"
  | "brand"
  | "productSku"
  | "canonicalCode"
  | "expiryDate"
  | "manufacturingDate"
  | "receiptDate"
  | "supplierName"
  | "status"
  | "externalCode"
  | "warehouseCode"
  | "source"
  | "quantity"
  | "unitCost";

export interface ImportFieldSpec {
  type: ImportFieldType;
  label: string;
  required: boolean;
  /** Lowercased, punctuation-stripped header aliases for auto-detection. */
  aliases: string[];
}

const HEADER_VARIANTS: Record<ImportFieldType, string[]> = {
  name: ["name", "product name", "productname", "product"],
  sku: ["sku", "code", "product sku", "productsku", "product code"],
  category: ["category", "cat", "product category"],
  unit: ["unit", "uom", "unit of measure", "measure"],
  brand: ["brand", "manufacturer", "manufacturer brand"],
  productSku: ["product sku", "productsku", "sku", "product", "product code", "product code sku"],
  canonicalCode: [
    "batch code",
    "canonical code",
    "canonicalcode",
    "batch",
    "lot",
    "lot code",
    "batch number",
    "batchnumber",
    "canonical batch code",
  ],
  expiryDate: ["expiry", "expiry date", "expirydate", "expires", "expiration", "best before", "bestbefore"],
  manufacturingDate: ["manufacturing date", "mfg date", "mfgdate", "manufactured", "production date", "produced"],
  receiptDate: ["receipt date", "receiptdate", "received date", "received", "arrival date"],
  supplierName: ["supplier", "supplier name", "suppliername", "vendor", "vendor name"],
  status: ["status", "batch status"],
  externalCode: [
    "external code",
    "externalcode",
    "alias",
    "alias code",
    "supplier code",
    "supplier batch code",
    "original code",
    "original batch code",
  ],
  warehouseCode: ["warehouse", "warehouse code", "warehousecode", "wh", "wh code", "warehouse id code"],
  source: ["source", "origin", "alias source"],
  quantity: ["quantity", "qty", "amount", "stock quantity", "opening quantity", "opening stock"],
  unitCost: ["unit cost", "unitcost", "cost", "price", "cost per unit"],
};

export const IMPORT_FIELD_SPECS: Record<ImportType, ImportFieldSpec[]> = {
  PRODUCTS: [
    { type: "name", label: "Product Name", required: true, aliases: HEADER_VARIANTS.name },
    { type: "sku", label: "SKU", required: true, aliases: HEADER_VARIANTS.sku },
    { type: "category", label: "Category", required: true, aliases: HEADER_VARIANTS.category },
    { type: "unit", label: "Unit", required: true, aliases: HEADER_VARIANTS.unit },
    { type: "brand", label: "Brand", required: false, aliases: HEADER_VARIANTS.brand },
  ],
  BATCHES: [
    { type: "productSku", label: "Product SKU", required: true, aliases: HEADER_VARIANTS.productSku },
    { type: "canonicalCode", label: "Canonical Batch Code", required: true, aliases: HEADER_VARIANTS.canonicalCode },
    { type: "expiryDate", label: "Expiry Date", required: true, aliases: HEADER_VARIANTS.expiryDate },
    { type: "manufacturingDate", label: "Manufacturing Date", required: false, aliases: HEADER_VARIANTS.manufacturingDate },
    { type: "receiptDate", label: "Receipt Date", required: false, aliases: HEADER_VARIANTS.receiptDate },
    { type: "supplierName", label: "Supplier", required: false, aliases: HEADER_VARIANTS.supplierName },
    { type: "status", label: "Batch Status", required: false, aliases: HEADER_VARIANTS.status },
  ],
  BATCH_ALIASES: [
    { type: "productSku", label: "Product SKU", required: true, aliases: HEADER_VARIANTS.productSku },
    { type: "canonicalCode", label: "Canonical Batch Code", required: true, aliases: HEADER_VARIANTS.canonicalCode },
    { type: "externalCode", label: "External / Alias Code", required: true, aliases: HEADER_VARIANTS.externalCode },
    { type: "warehouseCode", label: "Warehouse Code", required: false, aliases: HEADER_VARIANTS.warehouseCode },
    { type: "source", label: "Source", required: false, aliases: HEADER_VARIANTS.source },
  ],
  OPENING_STOCK: [
    { type: "productSku", label: "Product SKU", required: true, aliases: HEADER_VARIANTS.productSku },
    { type: "canonicalCode", label: "Canonical Batch Code", required: true, aliases: HEADER_VARIANTS.canonicalCode },
    { type: "expiryDate", label: "Expiry Date", required: true, aliases: HEADER_VARIANTS.expiryDate },
    { type: "quantity", label: "Quantity", required: true, aliases: HEADER_VARIANTS.quantity },
    { type: "unitCost", label: "Unit Cost", required: false, aliases: HEADER_VARIANTS.unitCost },
    { type: "supplierName", label: "Supplier", required: false, aliases: HEADER_VARIANTS.supplierName },
    { type: "manufacturingDate", label: "Manufacturing Date", required: false, aliases: HEADER_VARIANTS.manufacturingDate },
    { type: "receiptDate", label: "Receipt Date", required: false, aliases: HEADER_VARIANTS.receiptDate },
  ],
};

/** Lowercase, strip non-alphanumerics — deterministic header normalization. */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Canonicalized batch-code form used to compare codes independent of case. */
export function canonicalizeBatchCode(code: string): string {
  return normalizeBatchCode(code) || code.trim().toUpperCase();
}

/**
 * Auto-detects a field -> header mapping for the given import type.
 * Each header can only be claimed once; required fields are matched first so
 * ambiguous headers prefer mandatory mappings.
 */
export function autoDetectMapping(
  importType: ImportType,
  headers: string[],
): Record<string, string> {
  const normalized = headers.map((h) => ({ header: h, normalized: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  const specs = IMPORT_FIELD_SPECS[importType];
  for (const pass of [true, false] as const) {
    for (const spec of specs) {
      if (spec.required !== pass) continue;
      const match = normalized.find(
        (h) =>
          !used.has(h.header) &&
          (h.normalized === spec.type.toLowerCase() ||
            spec.aliases.some((alias) => normalizeHeader(alias) === h.normalized)),
      );
      if (match) {
        mapping[spec.type] = match.header;
        used.add(match.header);
      }
    }
  }
  return mapping;
}

/** Builds the header index lookup for a mapping. */
export function buildColumnIndex(headers: string[], mapping: Record<string, string>): Map<string, number> {
  const index = new Map<string, number>();
  for (const [field, header] of Object.entries(mapping)) {
    const i = headers.indexOf(header);
    if (i >= 0) index.set(field, i);
  }
  return index;
}

export function missingRequiredFields(importType: ImportType, mapping: Record<string, string>): ImportFieldSpec[] {
  return IMPORT_FIELD_SPECS[importType].filter((spec) => spec.required && !mapping[spec.type]);
}
