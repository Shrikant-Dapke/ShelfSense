import { describe, it, expect } from "vitest";
import {
  IMPORT_FIELD_SPECS,
  autoDetectMapping,
  buildColumnIndex,
  canonicalizeBatchCode,
  missingRequiredFields,
  normalizeHeader,
} from "../../src/modules/imports/imports.mapping.js";
import {
  assertFileAcceptable,
  formatFromFilename,
  fileChecksum,
} from "../../src/modules/imports/imports.parsers.js";
import { ApiError } from "../../src/utils/api-error.js";

describe("imports.mapping", () => {
  describe("normalizeHeader", () => {
    it("lowercases and strips punctuation", () => {
      expect(normalizeHeader("Product SKU*")).toBe("product sku");
      expect(normalizeHeader("  Expiry_Date  ")).toBe("expiry date");
      expect(normalizeHeader("LOT-CODE")).toBe("lot code");
    });
  });

  describe("canonicalizeBatchCode", () => {
    it("normalizes spaced / punctuated codes to the canonical form", () => {
      expect(canonicalizeBatchCode(" lot_2026/01 ")).toBe("LOT-2026-01");
      expect(canonicalizeBatchCode("BATCH APEX 101")).toBe("BATCH-APEX-101");
    });

    it("is idempotent", () => {
      expect(canonicalizeBatchCode(canonicalizeBatchCode("lot/2026 01"))).toBe("LOT-2026-01");
    });
  });

  describe("autoDetectMapping", () => {
    it("maps well-named product headers", () => {
      const mapping = autoDetectMapping("PRODUCTS", ["Name", "SKU", "Category", "Unit"]);
      expect(mapping).toEqual({
        name: "Name",
        sku: "SKU",
        category: "Category",
        unit: "Unit",
      });
    });

    it("maps alias headers (batch code, external code)", () => {
      const mapping = autoDetectMapping("BATCH_ALIASES", [
        "Product SKU",
        "Canonical Batch Code",
        "Supplier Code",
        "Warehouse",
      ]);
      expect(mapping.productSku).toBe("Product SKU");
      expect(mapping.canonicalCode).toBe("Canonical Batch Code");
      expect(mapping.externalCode).toBe("Supplier Code");
      expect(mapping.warehouseCode).toBe("Warehouse");
    });

    it("maps opening-stock aliases like qty and best before", () => {
      const mapping = autoDetectMapping("OPENING_STOCK", [
        "SKU",
        "Lot Code",
        "Best Before",
        "Qty",
      ]);
      expect(mapping.productSku).toBe("SKU");
      expect(mapping.canonicalCode).toBe("Lot Code");
      expect(mapping.expiryDate).toBe("Best Before");
      expect(mapping.quantity).toBe("Qty");
    });

    it("leaves ambiguous headers unmapped rather than guessing", () => {
      const mapping = autoDetectMapping("PRODUCTS", ["Mystery Column"]);
      expect(mapping).toEqual({});
    });
  });

  describe("missingRequiredFields", () => {
    it("reports required fields without a mapping", () => {
      const missing = missingRequiredFields("PRODUCTS", { name: "Name" });
      expect(missing.map((f) => f.type)).toEqual(["sku", "category", "unit"]);
    });

    it("returns empty when all required fields are mapped", () => {
      const missing = missingRequiredFields("PRODUCTS", {
        name: "Name",
        sku: "SKU",
        category: "Category",
        unit: "Unit",
      });
      expect(missing).toEqual([]);
    });
  });

  describe("buildColumnIndex", () => {
    it("resolves header positions and drops unknown headers", () => {
      const index = buildColumnIndex(["a", "b", "c"], { name: "b", sku: "zzz" });
      expect(index.get("name")).toBe(1);
      expect(index.has("sku")).toBe(false);
    });
  });

  describe("IMPORT_FIELD_SPECS", () => {
    it("defines at least one required field per import type", () => {
      for (const [type, specs] of Object.entries(IMPORT_FIELD_SPECS)) {
        expect(specs.length, type).toBeGreaterThan(0);
        expect(specs.some((s) => s.required), type).toBe(true);
      }
    });
  });
});

describe("imports.parsers", () => {
  describe("formatFromFilename", () => {
    it("detects CSV and XLSX case-insensitively", () => {
      expect(formatFromFilename("stock.CSV")).toBe("CSV");
      expect(formatFromFilename("Stock Report.xlsx")).toBe("XLSX");
    });

    it("rejects legacy .xls and unknown extensions", () => {
      expect(() => formatFromFilename("old.xls")).toThrow(ApiError);
      expect(() => formatFromFilename("notes.txt")).toThrow(ApiError);
    });
  });

  describe("assertFileAcceptable", () => {
    it("accepts a valid CSV upload", () => {
      expect(
        assertFileAcceptable({
          originalname: "products.csv",
          size: 1024,
          mimetype: "text/csv",
        }),
      ).toBe("CSV");
    });

    it("rejects legacy .xls regardless of MIME", () => {
      expect(() =>
        assertFileAcceptable({
          originalname: "products.xls",
          size: 1024,
          mimetype: "application/vnd.ms-excel",
        }),
      ).toThrow(ApiError);
    });

    it("rejects unsupported MIME types", () => {
      expect(() =>
        assertFileAcceptable({
          originalname: "products.csv",
          size: 1024,
          mimetype: "application/zip",
        }),
      ).toThrow(ApiError);
    });

    it("rejects empty files", () => {
      expect(() =>
        assertFileAcceptable({
          originalname: "products.csv",
          size: 0,
          mimetype: "text/csv",
        }),
      ).toThrow(ApiError);
    });

    it("rejects files over the size limit with 413", () => {
      try {
        assertFileAcceptable({
          originalname: "big.xlsx",
          size: 6 * 1024 * 1024,
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(413);
      }
    });
  });

  describe("fileChecksum", () => {
    it("produces a stable sha256 hex fingerprint", () => {
      const a = fileChecksum(Buffer.from("hello"));
      const b = fileChecksum(Buffer.from("hello"));
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
      expect(fileChecksum(Buffer.from("world"))).not.toBe(a);
    });
  });
});
