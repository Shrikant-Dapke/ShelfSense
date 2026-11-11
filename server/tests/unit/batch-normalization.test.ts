import { describe, it, expect } from "vitest";
import { normalizeBatchCode } from "../../src/modules/batches/batches.utils.js";

describe("Batch Code Normalization Unit Tests", () => {
  it("trims and converts lowercase codes to uppercase", () => {
    expect(normalizeBatchCode("  lot-dairy-001  ")).toBe("LOT-DAIRY-001");
  });

  it("replaces spaces, slashes, and underscores with single hyphen", () => {
    expect(normalizeBatchCode("lot 2026 / 04")).toBe("LOT-2026-04");
    expect(normalizeBatchCode("LOT_2026_MAY_01")).toBe("LOT-2026-MAY-01");
  });

  it("collapses multiple consecutive delimiters into a single hyphen", () => {
    expect(normalizeBatchCode("BATCH---2026___01")).toBe("BATCH-2026-01");
    expect(normalizeBatchCode("LOT - - - A")).toBe("LOT-A");
  });

  it("strips invalid special characters while preserving numbers and letters", () => {
    expect(normalizeBatchCode("LOT#2026@EXP!")).toBe("LOT2026EXP");
    expect(normalizeBatchCode("BATCH [2026] #1")).toBe("BATCH-2026-1");
  });

  it("strips leading and trailing hyphens", () => {
    expect(normalizeBatchCode("-LOT-101-")).toBe("LOT-101");
    expect(normalizeBatchCode("---ALPHA---")).toBe("ALPHA");
  });

  it("returns empty string for empty or non-alphanumeric input", () => {
    expect(normalizeBatchCode("")).toBe("");
    expect(normalizeBatchCode("   ---   ")).toBe("");
    expect(normalizeBatchCode("!@#$%^&*()")).toBe("");
  });
});

