import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateBalanceFromMovements } from "../../src/modules/inventory/inventory.repository.js";

describe("Stock Ledger Calculation Unit Tests", () => {
  it("calculates zero balance when there are no movements", () => {
    const balance = calculateBalanceFromMovements([]);
    expect(balance).toBe(0);
  });

  it("adds RECEIPT and TRANSFER_IN movements", () => {
    const movements = [
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(100.5) },
      { movementType: "TRANSFER_IN" as const, quantity: new Prisma.Decimal(25.25) },
    ];
    const balance = calculateBalanceFromMovements(movements);
    expect(balance).toBe(125.75);
  });

  it("deducts DISPATCH, WASTE, and TRANSFER_OUT movements", () => {
    const movements = [
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(100) },
      { movementType: "DISPATCH" as const, quantity: new Prisma.Decimal(40) },
      { movementType: "WASTE" as const, quantity: new Prisma.Decimal(5.5) },
      { movementType: "TRANSFER_OUT" as const, quantity: new Prisma.Decimal(14.5) },
    ];
    const balance = calculateBalanceFromMovements(movements);
    expect(balance).toBe(40);
  });

  it("handles positive and negative ADJUSTMENT movements correctly", () => {
    const movements = [
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(50) },
      { movementType: "ADJUSTMENT" as const, quantity: new Prisma.Decimal(5.25) }, // surplus found
      { movementType: "ADJUSTMENT" as const, quantity: new Prisma.Decimal(-3.125) }, // shrinkage found
    ];
    const balance = calculateBalanceFromMovements(movements);
    expect(balance).toBe(52.125);
  });

  it("avoids JavaScript floating-point representation anomalies", () => {
    const movements = [
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(0.1) },
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(0.2) },
    ];
    const balance = calculateBalanceFromMovements(movements);
    expect(balance).toBe(0.3);
  });

  it("supports all 6 movement types within a single ledger history", () => {
    // Formula: Opening (Receipt) + Receipts + Transfers In - Dispatches - Waste - Transfers Out + Adjustments
    const movements = [
      { movementType: "RECEIPT" as const, quantity: new Prisma.Decimal(1000) },
      { movementType: "TRANSFER_IN" as const, quantity: new Prisma.Decimal(200) },
      { movementType: "DISPATCH" as const, quantity: new Prisma.Decimal(300) },
      { movementType: "WASTE" as const, quantity: new Prisma.Decimal(50) },
      { movementType: "TRANSFER_OUT" as const, quantity: new Prisma.Decimal(150) },
      { movementType: "ADJUSTMENT" as const, quantity: new Prisma.Decimal(-20) },
    ];
    // 1000 + 200 - 300 - 50 - 150 - 20 = 680
    const balance = calculateBalanceFromMovements(movements);
    expect(balance).toBe(680);
  });
});
