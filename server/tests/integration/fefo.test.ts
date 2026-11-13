import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;
let adminUserId: string;

let warehouseA: { id: string; name: string; code: string };
let warehouseB: { id: string; name: string; code: string };
let productMilk: { id: string; name: string; sku: string };
let productYogurt: { id: string; name: string; sku: string };

const futureExpiry = () => new Date(Date.now() + 90 * 24 * 3600 * 1000);
const pastExpiry = () => new Date(Date.now() - 10 * 24 * 3600 * 1000);

/** Deterministic local-midnight dates so daysToExpiry is exact. */
function dayFromToday(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function seedStock(
  batchId: string,
  warehouseId: string,
  quantity: number,
  occurredAt = new Date(),
) {
  await prisma.stockMovement.create({
    data: {
      warehouseId,
      batchId,
      movementType: "RECEIPT",
      quantity,
      createdBy: adminUserId,
      occurredAt,
    },
  });
}

async function createBatch(
  productId: string,
  canonicalCode: string,
  expiryDate: Date,
  options: { status?: "ACTIVE" | "QUARANTINED" | "RECALLED"; receiptDate?: Date } = {},
) {
  return prisma.batch.create({
    data: {
      productId,
      canonicalCode,
      expiryDate,
      status: options.status ?? "ACTIVE",
      ...(options.receiptDate ? { receiptDate: options.receiptDate } : {}),
    },
  });
}

async function recommend(
  params: { warehouseId: string; productId: string; quantity: number | string },
  cookie = adminCookie,
) {
  const qs = new URLSearchParams({
    warehouseId: params.warehouseId,
    productId: params.productId,
    quantity: String(params.quantity),
  });
  return request(app).get(`/api/v1/dispatches/recommendations?${qs}`).set("Cookie", cookie);
}

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  managerCookie = await loginAs("manager");
  operatorCookie = await loginAs("operator");
  const admin = await prisma.user.findUnique({ where: { email: "admin@test.shelfsense.local" } });
  adminUserId = admin!.id;
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.wasteRecord.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.dispatchItem.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.receiptItem.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.batchAlias.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  warehouseA = await prisma.warehouse.create({
    data: { name: "Alpha Cold Store", code: "WH-ALPHA", location: "North" },
  });
  warehouseB = await prisma.warehouse.create({
    data: { name: "Beta Depot", code: "WH-BETA", location: "South" },
  });

  productMilk = await prisma.product.create({
    data: { name: "Pasteurized Milk 1L", sku: "MILK-PAST-01", category: "Dairy", unit: "L" },
  });
  productYogurt = await prisma.product.create({
    data: { name: "Greek Yogurt 500g", sku: "YOG-GRK-01", category: "Dairy", unit: "kg" },
  });
});

describe("FEFO Recommendation Integration Tests", () => {
  // ---------- Ordering ----------

  it("orders strictly by earliest expiry first", async () => {
    const late = await createBatch(productMilk.id, "LOT-FEFO-LATE", dayFromToday(30));
    const early = await createBatch(productMilk.id, "LOT-FEFO-EARLY", dayFromToday(5));
    const middle = await createBatch(productMilk.id, "LOT-FEFO-MID", dayFromToday(12));
    await seedStock(late.id, warehouseA.id, 20);
    await seedStock(early.id, warehouseA.id, 20);
    await seedStock(middle.id, warehouseA.id, 20);

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 50 });
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.allocations.map((a: any) => a.canonicalCode)).toEqual([
      "LOT-FEFO-EARLY",
      "LOT-FEFO-MID",
      "LOT-FEFO-LATE",
    ]);
    expect(data.allocations.map((a: any) => a.recommendedQuantity)).toEqual([20, 20, 10]);
    expect(data.requestedQuantity).toBe(50);
    expect(data.totalEligibleQuantity).toBe(60);
    expect(data.allocatedQuantity).toBe(50);
    expect(data.shortfall).toBe(0);
    expect(data.allocations[0].order).toBe(1);
    expect(data.allocations[0].warehouseCode).toBe("WH-ALPHA");
    expect(data.allocations[0].productSku).toBe("MILK-PAST-01");
  });

  it("tie-breaks equal expiry dates by receipt date, then canonical code", async () => {
    const expiry = dayFromToday(10);
    // Same expiry; B received earlier than A; C has no receipt date (last).
    const batchA = await createBatch(productMilk.id, "LOT-FEFO-A", expiry, {
      receiptDate: new Date("2026-03-10"),
    });
    const batchB = await createBatch(productMilk.id, "LOT-FEFO-B", expiry, {
      receiptDate: new Date("2026-01-05"),
    });
    const batchC = await createBatch(productMilk.id, "LOT-FEFO-C", expiry);
    await seedStock(batchA.id, warehouseA.id, 10);
    await seedStock(batchB.id, warehouseA.id, 10);
    await seedStock(batchC.id, warehouseA.id, 10);

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 25 });
    expect(res.status).toBe(200);
    // B (earliest receipt) -> A (later receipt) -> C (no receipt date, then by code).
    expect(res.body.data.allocations.map((a: any) => a.canonicalCode)).toEqual([
      "LOT-FEFO-B",
      "LOT-FEFO-A",
      "LOT-FEFO-C",
    ]);
  });

  it("tie-breaks equal expiry and receipt dates by canonical batch code", async () => {
    const expiry = dayFromToday(10);
    const receipt = new Date("2026-02-01");
    const zulu = await createBatch(productMilk.id, "LOT-FEFO-ZULU", expiry, { receiptDate: receipt });
    const alpha = await createBatch(productMilk.id, "LOT-FEFO-ALPHA", expiry, { receiptDate: receipt });
    await seedStock(zulu.id, warehouseA.id, 5);
    await seedStock(alpha.id, warehouseA.id, 5);

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 8 });
    expect(res.body.data.allocations.map((a: any) => a.canonicalCode)).toEqual([
      "LOT-FEFO-ALPHA",
      "LOT-FEFO-ZULU",
    ]);
    expect(res.body.data.allocations[0].recommendedQuantity).toBe(5);
    expect(res.body.data.allocations[1].recommendedQuantity).toBe(3);
  });

  // ---------- Exclusions ----------

  it("excludes expired, quarantined and recalled batches; only ACTIVE stock is eligible", async () => {
    const good = await createBatch(productMilk.id, "LOT-FEFO-GOOD", dayFromToday(20));
    const expired = await createBatch(productMilk.id, "LOT-FEFO-EXPIRED", pastExpiry());
    const boundary = await createBatch(productMilk.id, "LOT-FEFO-BOUNDARY", dayFromToday(0)); // DTE 0 = EXPIRED
    const quarantined = await createBatch(productMilk.id, "LOT-FEFO-QUAR", dayFromToday(20), {
      status: "QUARANTINED",
    });
    const recalled = await createBatch(productMilk.id, "LOT-FEFO-RECALLED", dayFromToday(20), {
      status: "RECALLED",
    });
    for (const b of [good, expired, boundary, quarantined, recalled]) {
      await seedStock(b.id, warehouseA.id, 10);
    }

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 15 });
    expect(res.status).toBe(200);
    expect(res.body.data.allocations.map((a: any) => a.canonicalCode)).toEqual(["LOT-FEFO-GOOD"]);
    expect(res.body.data.totalEligibleQuantity).toBe(10);
    expect(res.body.data.allocatedQuantity).toBe(10);
    expect(res.body.data.shortfall).toBe(5);
  });

  it("excludes zero and negative balances", async () => {
    // Zero-balance batch (real history, fully consumed).
    const zero = await createBatch(productMilk.id, "LOT-FEFO-ZERO", dayFromToday(10));
    await seedStock(zero.id, warehouseA.id, 10);
    const adj = await request(app).post("/api/v1/inventory/adjust").set("Cookie", adminCookie).send({
      warehouseId: warehouseA.id,
      batchId: zero.id,
      quantity: -10,
      reason: "Correction to zero",
    });
    expect(adj.status).toBe(201);

    // Negative balance cannot be produced by governed APIs; seed directly.
    const negative = await createBatch(productMilk.id, "LOT-FEFO-NEG", dayFromToday(10));
    await seedStock(negative.id, warehouseA.id, 5);
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: negative.id,
        movementType: "DISPATCH",
        quantity: 8, // deliberately inconsistent ledger
        createdBy: adminUserId,
        occurredAt: new Date(),
      },
    });

    const good = await createBatch(productMilk.id, "LOT-FEFO-GOOD2", dayFromToday(10));
    await seedStock(good.id, warehouseA.id, 12);

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 12 });
    expect(res.body.data.allocations.map((a: any) => a.canonicalCode)).toEqual(["LOT-FEFO-GOOD2"]);
    expect(res.body.data.totalEligibleQuantity).toBe(12);
  });

  // ---------- Multi-batch allocation & shortfall ----------

  it("splits requested quantities across multiple batches and reports shortfalls", async () => {
    const b1 = await createBatch(productMilk.id, "LOT-FEFO-S1", dayFromToday(3));
    const b2 = await createBatch(productMilk.id, "LOT-FEFO-S2", dayFromToday(9));
    await seedStock(b1.id, warehouseA.id, 4.5);
    await seedStock(b2.id, warehouseA.id, 8);

    // Exact fit.
    let res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 12.5 });
    expect(res.body.data.shortfall).toBe(0);
    expect(res.body.data.allocations).toHaveLength(2);

    // Shortfall: request more than eligible.
    res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 20 });
    expect(res.body.data.totalEligibleQuantity).toBe(12.5);
    expect(res.body.data.allocatedQuantity).toBe(12.5);
    expect(res.body.data.shortfall).toBe(7.5);
    // Never recommends more than the ledger-derived available quantity.
    expect(res.body.data.allocations.every((a: any) => a.recommendedQuantity <= a.availableQuantity)).toBe(true);

    // Zero eligible stock: explicit shortfall, no allocations.
    const emptyProduct = await prisma.product.create({
      data: { name: "Empty Product", sku: "EMPTY-01", category: "Dairy", unit: "L" },
    });
    res = await recommend({ warehouseId: warehouseA.id, productId: emptyProduct.id, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.allocations).toHaveLength(0);
    expect(res.body.data.totalEligibleQuantity).toBe(0);
    expect(res.body.data.allocatedQuantity).toBe(0);
    expect(res.body.data.shortfall).toBe(5);
  });

  // ---------- Precision & isolation ----------

  it("preserves NUMERIC(19,4) precision through allocation", async () => {
    const b1 = await createBatch(productMilk.id, "LOT-FEFO-P1", dayFromToday(4));
    const b2 = await createBatch(productMilk.id, "LOT-FEFO-P2", dayFromToday(8));
    await seedStock(b1.id, warehouseA.id, 12.3456);
    await seedStock(b2.id, warehouseA.id, 7.6544);

    const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 15.2345 });
    expect(res.body.data.allocations[0]).toMatchObject({
      canonicalCode: "LOT-FEFO-P1",
      availableQuantity: 12.3456,
      recommendedQuantity: 12.3456,
    });
    expect(res.body.data.allocations[1]).toMatchObject({
      canonicalCode: "LOT-FEFO-P2",
      availableQuantity: 7.6544,
      recommendedQuantity: 2.8889, // 15.2345 - 12.3456
    });
    expect(res.body.data.allocatedQuantity).toBe(15.2345);
    expect(res.body.data.shortfall).toBe(0);
  });

  it("isolates recommendations by warehouse and product", async () => {
    const milkBatch = await createBatch(productMilk.id, "LOT-FEFO-ISO-M", dayFromToday(10));
    const yogurtBatch = await createBatch(productYogurt.id, "LOT-FEFO-ISO-Y", dayFromToday(5));
    await seedStock(milkBatch.id, warehouseA.id, 30);
    await seedStock(milkBatch.id, warehouseB.id, 15);
    await seedStock(yogurtBatch.id, warehouseA.id, 40);

    const whA = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 50 });
    expect(whA.body.data.totalEligibleQuantity).toBe(30); // WH-B stock invisible
    expect(whA.body.data.shortfall).toBe(20);

    const whB = await recommend({ warehouseId: warehouseB.id, productId: productMilk.id, quantity: 10 });
    expect(whB.body.data.totalEligibleQuantity).toBe(15);
    expect(whB.body.data.allocations[0].warehouseCode).toBe("WH-BETA");

    const yogurt = await recommend({ warehouseId: warehouseA.id, productId: productYogurt.id, quantity: 10 });
    expect(yogurt.body.data.totalEligibleQuantity).toBe(40);
    expect(yogurt.body.data.allocations).toHaveLength(1);
    expect(yogurt.body.data.allocations[0].canonicalCode).toBe("LOT-FEFO-ISO-Y");
  });

  // ---------- Read-only guarantee ----------

  it("never mutates anything: recommendations leave movements, dispatches and audit untouched", async () => {
    const batch = await createBatch(productMilk.id, "LOT-FEFO-RO", dayFromToday(15));
    await seedStock(batch.id, warehouseA.id, 100);

    const movementsBefore = await prisma.stockMovement.count();
    const dispatchesBefore = await prisma.dispatch.count();
    const auditsBefore = await prisma.auditLog.count();

    await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 40 });
    await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 500 }); // shortfall path

    expect(await prisma.stockMovement.count()).toBe(movementsBefore);
    expect(await prisma.dispatch.count()).toBe(dispatchesBefore);
    expect(await prisma.auditLog.count()).toBe(auditsBefore);

    const balance = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balance.body.data.availableQuantity).toBe(100);
  });

  // ---------- Staleness: dispatch execution revalidates ----------

  it("rejects a stale recommendation with insufficient stock when actually dispatched", async () => {
    const batch = await createBatch(productMilk.id, "LOT-FEFO-STALE", dayFromToday(14));
    await seedStock(batch.id, warehouseA.id, 10);

    // Snapshot says 10 available.
    const rec = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 10 });
    expect(rec.body.data.allocations[0].recommendedQuantity).toBe(10);

    // Stock moves on (another dispatch consumes 4 through the governed API).
    const consume = await request(app).post("/api/v1/dispatches").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      referenceNo: "STALE-CONSUME",
      items: [{ productId: productMilk.id, batchId: batch.id, quantity: 4 }],
    });
    expect(consume.status).toBe(201);

    // Replay the stale allocation through the real dispatch endpoint: the
    // sole execution authority revalidates availability under the row lock.
    const stale = await request(app).post("/api/v1/dispatches").set("Cookie", operatorCookie).send({
      warehouseId: warehouseA.id,
      referenceNo: "STALE-REPLAY",
      items: [{ productId: productMilk.id, batchId: batch.id, quantity: 10 }],
    });
    expect(stale.status).toBe(400);
    expect(stale.body.error.message).toContain("Insufficient stock");

    // A fresh recommendation now reflects the new balance (6).
    const fresh = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 10 });
    expect(fresh.body.data.totalEligibleQuantity).toBe(6);
    expect(fresh.body.data.allocations[0].recommendedQuantity).toBe(6);
    expect(fresh.body.data.shortfall).toBe(4);
  });

  // ---------- RBAC & input validation ----------

  it("enforces authentication and validates inputs", async () => {
    const qs = `warehouseId=${warehouseA.id}&productId=${productMilk.id}&quantity=10`;
    expect((await request(app).get(`/api/v1/dispatches/recommendations?${qs}`)).status).toBe(401);

    // All roles may read recommendations (advisory, read-only).
    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      const res = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 1 }, cookie);
      expect(res.status).toBe(200);
    }

    // Invalid inputs.
    const noQuantity = await request(app)
      .get(`/api/v1/dispatches/recommendations?warehouseId=${warehouseA.id}&productId=${productMilk.id}`)
      .set("Cookie", adminCookie);
    expect(noQuantity.status).toBe(422);

    const zeroQuantity = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 0 });
    expect(zeroQuantity.status).toBe(422);

    const badPrecision = await recommend({ warehouseId: warehouseA.id, productId: productMilk.id, quantity: 1.23456 });
    expect(badPrecision.status).toBe(422);

    const badIds = await recommend({ warehouseId: "not-a-uuid", productId: productMilk.id, quantity: 1 });
    expect(badIds.status).toBe(422);

    const unknownWarehouse = await recommend({
      warehouseId: "00000000-0000-4000-8000-0000000000aa",
      productId: productMilk.id,
      quantity: 1,
    });
    expect(unknownWarehouse.status).toBe(404);

    const unknownProduct = await recommend({
      warehouseId: warehouseA.id,
      productId: "00000000-0000-4000-8000-0000000000bb",
      quantity: 1,
    });
    expect(unknownProduct.status).toBe(404);
  });
});
