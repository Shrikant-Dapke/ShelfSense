import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeVariance, toQuantityDecimal, isZeroQuantity } from "../../src/modules/stockcounts/stockcounts.utils.js";

describe("Stock Count Variance Unit Tests", () => {
  it("computes a positive variance (surplus) exactly", () => {
    const v = computeVariance(120, 100);
    expect(v.toNumber()).toBe(20);
    expect(v.toFixed(4)).toBe("20.0000");
  });

  it("computes a negative variance (shortage) exactly", () => {
    const v = computeVariance(80, 100);
    expect(v.toNumber()).toBe(-20);
    expect(v.toFixed(4)).toBe("-20.0000");
  });

  it("computes a zero variance", () => {
    const v = computeVariance(100, 100);
    expect(v.isZero()).toBe(true);
    expect(isZeroQuantity(v)).toBe(true);
  });

  it("preserves 4-decimal precision without floating-point drift", () => {
    // 0.1 + 0.2 style drift must never appear in authoritative quantities
    const v = computeVariance(12.3457, 12.3456);
    expect(v.toFixed(4)).toBe("0.0001");

    const v2 = computeVariance(0.0001, 0);
    expect(v2.toFixed(4)).toBe("0.0001");

    const v3 = computeVariance(0, 0.0001);
    expect(v3.toFixed(4)).toBe("-0.0001");
  });

  it("handles large NUMERIC(19,4) values exactly", () => {
    const counted = new Prisma.Decimal("999999999999.9999");
    const expected = new Prisma.Decimal("999999999999.0001");
    const v = computeVariance(counted, expected);
    expect(v.toFixed(4)).toBe("0.9998");
  });

  it("accepts Decimal, number, and string inputs interchangeably", () => {
    expect(computeVariance(new Prisma.Decimal("5.5"), new Prisma.Decimal("2.5")).toNumber()).toBe(3);
    expect(computeVariance("5.5000", "2.5000").toNumber()).toBe(3);
    expect(computeVariance(5.5, 2.5).toNumber()).toBe(3);
  });

  it("converts a rounded ledger balance to an exact 4-decimal Decimal", () => {
    expect(toQuantityDecimal(150).toFixed(4)).toBe("150.0000");
    expect(toQuantityDecimal(12.3456).toFixed(4)).toBe("12.3456");
    expect(toQuantityDecimal(-20).toFixed(4)).toBe("-20.0000");
  });
});
