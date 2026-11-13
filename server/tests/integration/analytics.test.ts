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

/** Midday N days ago — safely inside/outside day-bucket windows. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

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

async function createBatch(productId: string, canonicalCode: string, expiryDate: Date) {
  return prisma.batch.create({ data: { productId, canonicalCode, expiryDate } });
}

/** Direct receipt row for unit-cost seeding (bypasses the multi-item API). */
async function seedReceipt(
  warehouseId: string,
  batchId: string,
  productId: string,
  quantity: number,
  unitCost: number | null,
  receivedAt = new Date(),
) {
  await prisma.receipt.create({
    data: {
      warehouseId,
      receivedAt,
      createdBy: adminUserId,
      items: { create: { productId, batchId, quantity, unitCost: unitCost === null ? undefined : unitCost } },
    },
  });
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
});

/**
 * Fixture set shared by most tests (30d window focus):
 *  M1 milk  expiry +10d  A:100@12d ago, cost 2.5   -> transfer 15 to B, dispatch 20 @2d ago, waste 7.5 EXPIRED @1d ago
 *  M2 milk  expiry +40d  B:50 now, 200@40d ago (out of window), cost 3 -> adjust +2.5 @3d ago
 *  Y1 yogurt expiry -5d  A:20@20d ago, no cost      -> waste 4 DAMAGED @3d ago
 *  Y2 yogurt expiry +3d  A:30.1234 now, no cost     -> dispatch 10 @1d ago
 */
async function seedFixtures() {
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

  const m1 = await createBatch(productMilk.id, "LOT-AN-M1", dayFromToday(10));
  const m2 = await createBatch(productMilk.id, "LOT-AN-M2", dayFromToday(40));
  const y1 = await createBatch(productYogurt.id, "LOT-AN-Y1", dayFromToday(-5));
  const y2 = await createBatch(productYogurt.id, "LOT-AN-Y2", dayFromToday(3));

  await seedStock(m1.id, warehouseA.id, 100, daysAgo(12));
  await seedReceipt(warehouseA.id, m1.id, productMilk.id, 100, 2.5, daysAgo(12));
  await seedStock(m2.id, warehouseB.id, 50);
  await seedStock(m2.id, warehouseB.id, 200, daysAgo(40)); // outside every d-window
  await seedReceipt(warehouseB.id, m2.id, productMilk.id, 250, 3, daysAgo(40));
  await seedStock(y1.id, warehouseA.id, 20, daysAgo(20));
  await seedReceipt(warehouseA.id, y1.id, productYogurt.id, 20, null, daysAgo(20)); // explicitly cost-less
  await seedStock(y2.id, warehouseA.id, 30.1234);

  const transfer = await request(app).post("/api/v1/inventory/transfer").set("Cookie", managerCookie).send({
    fromWarehouseId: warehouseA.id,
    toWarehouseId: warehouseB.id,
    batchId: m1.id,
    quantity: 15,
  });
  expect(transfer.status).toBe(201);

  const dispatch1 = await request(app).post("/api/v1/dispatches").set("Cookie", managerCookie).send({
    warehouseId: warehouseA.id,
    dispatchedAt: daysAgo(2).toISOString(),
    items: [{ productId: productMilk.id, batchId: m1.id, quantity: 20 }],
  });
  expect(dispatch1.status).toBe(201);

  const dispatch2 = await request(app).post("/api/v1/dispatches").set("Cookie", managerCookie).send({
    warehouseId: warehouseA.id,
    dispatchedAt: daysAgo(1).toISOString(),
    items: [{ productId: productYogurt.id, batchId: y2.id, quantity: 10 }],
  });
  expect(dispatch2.status).toBe(201);

  const waste1 = await request(app).post("/api/v1/waste").set("Cookie", managerCookie).send({
    warehouseId: warehouseA.id,
    productId: productMilk.id,
    batchId: m1.id,
    quantity: 7.5,
    reason: "EXPIRED",
    recordedAt: daysAgo(1).toISOString(),
  });
  expect(waste1.status).toBe(201);

  const waste2 = await request(app).post("/api/v1/waste").set("Cookie", managerCookie).send({
    warehouseId: warehouseA.id,
    productId: productYogurt.id,
    batchId: y1.id,
    quantity: 4,
    reason: "DAMAGED",
    recordedAt: daysAgo(3).toISOString(),
  });
  expect(waste2.status).toBe(201);

  const adjust = await request(app).post("/api/v1/inventory/adjust").set("Cookie", adminCookie).send({
    warehouseId: warehouseB.id,
    batchId: m2.id,
    quantity: 2.5,
    reason: "Cycle count correction",
  });
  expect(adjust.status).toBe(201);

  return { m1, m2, y1, y2 };
}

const summary = (query = "", cookie = adminCookie) =>
  request(app).get(`/api/v1/analytics/summary${query}`).set("Cookie", cookie);

describe("Analytics Integration Tests", () => {
  // ---------- RBAC & input validation ----------

  it("rejects unauthenticated access and validates inputs", async () => {
    expect((await request(app).get("/api/v1/analytics/summary")).status).toBe(401);

    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      expect((await summary("", cookie)).status).toBe(200);
    }

    expect((await summary("?period=forever")).status).toBe(422);
    expect((await summary(`?warehouseId=not-a-uuid`)).status).toBe(422);
    expect((await summary(`?productId=not-a-uuid`)).status).toBe(422);
  });

  // ---------- Full fixture: default 30d window, no filters ----------

  it("derives inventory overview from current positive ledger balances (all statuses)", async () => {
    await seedFixtures();
    const res = await summary();
    expect(res.status).toBe(200);
    const data = res.body.data;

    // M1: A 57.5 (100 - 20 dispatched - 15 out - 7.5 wasted) + B 15;
    // M2: 252.5 (200+50+2.5); Y1: 16 (expired stock, 20 - 4 wasted); Y2: 20.1234.
    expect(data.inventory.totalStockQuantity).toBe(361.1234);
    expect(data.inventory.activeProducts).toBe(2);
    expect(data.inventory.activeWarehouses).toBe(2);
    expect(data.inventory.byCategory).toEqual([
      { category: "Dairy", products: 2, quantity: 361.1234 },
    ]);
    expect(data.inventory.byWarehouse).toEqual([
      { warehouseId: warehouseB.id, warehouseName: "Beta Depot", warehouseCode: "WH-BETA", quantity: 267.5 },
      { warehouseId: warehouseA.id, warehouseName: "Alpha Cold Store", warehouseCode: "WH-ALPHA", quantity: 93.6234 },
    ]);
    expect(data.period).toBe("30d");
    expect(data.granularity).toBe("day");
    expect(data.movements.series).toHaveLength(30);
  });

  it("reconciles totalStockQuantity exactly against the inventory ledger", async () => {
    await seedFixtures();
    const [analytics, invA, invB] = await Promise.all([
      summary(),
      request(app).get(`/api/v1/inventory?warehouseId=${warehouseA.id}`).set("Cookie", adminCookie),
      request(app).get(`/api/v1/inventory?warehouseId=${warehouseB.id}`).set("Cookie", adminCookie),
    ]);
    const ledgerSum =
      invA.body.data.reduce((acc: number, i: any) => acc + i.availableQuantity, 0) +
      invB.body.data.reduce((acc: number, i: any) => acc + i.availableQuantity, 0);
    expect(analytics.body.data.inventory.totalStockQuantity).toBe(
      Math.round(ledgerSum * 10000) / 10000,
    );
  });

  it("aggregates movements over the window without double-counting transfers", async () => {
    const { m1, m2, y1, y2 } = { ...(await seedFixtures()) };
    const res = await summary();
    const movements = res.body.data.movements;

    // In-window receipts only: 100 + 50 + 20 + 30.1234 = 200.1234.
    // The 200 @40d ago is outside the 30d window (but in current stock).
    expect(movements.totals.receipts).toBe(200.1234);
    expect(movements.totals.dispatches).toBe(30); // 20 milk + 10 yogurt
    // Transfer legs reported separately — one transfer, two movements.
    expect(movements.totals.transfersIn).toBe(15);
    expect(movements.totals.transfersOut).toBe(15);
    expect(movements.totals.adjustments).toBe(2.5);
    expect(movements.totals.records).toBe(11); // 4 receipts + 2 dispatches + 2 transfer legs + 1 adjust + 2 waste

    // Every transfer leg magnitude matches — nothing is summed into one total.
    expect(movements.totals.transfersIn + movements.totals.transfersOut).toBe(30);

    // Daily buckets carry the movement of their local day.
    const today = movements.series[movements.series.length - 1];
    expect(today.receipts).toBeCloseTo(50 + 30.1234, 4);

    // Out-of-window receipt (200 @40d ago) lands in no bucket; the largest
    // in-window daily receipt is 100 (12 days ago).
    expect(movements.series.every((b: any) => b.receipts <= 100)).toBe(true);
    expect(movements.series[movements.series.length - 1 - 12].receipts).toBe(100);
    void m1; void m2; void y1; void y2;
  });

  it("aggregates waste and reconciles against the waste summary module", async () => {
    await seedFixtures();
    const res = await summary();
    const waste = res.body.data.waste;

    expect(waste.totalQuantity).toBe(11.5); // 7.5 EXPIRED + 4 DAMAGED
    expect(waste.records).toBe(2);
    expect(waste.byReason).toContainEqual({ reason: "EXPIRED", records: 1, quantity: 7.5 });
    expect(waste.byReason).toContainEqual({ reason: "DAMAGED", records: 1, quantity: 4 });
    expect(waste.byWarehouse).toHaveLength(1);
    expect(waste.byWarehouse[0]).toMatchObject({ warehouseCode: "WH-ALPHA", quantity: 11.5 });

    // Waste % of received: 11.5 / 200.1234 * 100 = 5.7465 (rounded 4).
    expect(waste.receivedQuantity).toBe(200.1234);
    expect(waste.wastePercentOfReceived).toBeCloseTo((11.5 / 200.1234) * 100, 4);

    // Cost basis: milk record costed (7.5 x 2.5), yogurt batch cost-less.
    expect(waste.estimatedValue).toBe(18.75);
    expect(waste.quantityWithCost).toBe(7.5);
    expect(waste.quantityWithoutCost).toBe(4);

    // Reconciliation against the dedicated waste summary for the same window.
    const from = res.body.data.fromDate;
    const wasteSummary = await request(app)
      .get(`/api/v1/waste/summary?fromDate=${encodeURIComponent(from)}`)
      .set("Cookie", adminCookie);
    expect(wasteSummary.body.data.totalQuantity).toBe(waste.totalQuantity);
    expect(wasteSummary.body.data.totalRecords).toBe(waste.records);
  });

  it("reconciles expiry buckets against the expiry monitor (shared classification)", async () => {
    await seedFixtures();
    const [analytics, monitor] = await Promise.all([
      summary(),
      request(app).get("/api/v1/expiry/monitor").set("Cookie", adminCookie),
    ]);
    const expiry = analytics.body.data.expiry;

    expect(expiry.buckets).toEqual(monitor.body.data.buckets);
    expect(expiry.expiredQuantity).toBe(16); // Y1 expired, still holding stock
    expect(expiry.nearExpiryQuantity).toBe(92.6234); // M1 72.5 (WARNING) + Y2 20.1234 (CRITICAL)

    // Value at risk: M1 72.5 x 2.5 = 181.25; M2 252.5 x 3 = 757.5; costless Y1/Y2 excluded.
    expect(expiry.estimatedValueAtRisk).toBe(938.75);
    expect(expiry.quantityWithCost).toBe(325);
    expect(expiry.quantityWithoutCost).toBeCloseTo(36.1234, 4);
  });

  it("ranks top dispatched products and dispatch quantities by warehouse", async () => {
    await seedFixtures();
    const res = await summary();
    const dispatch = res.body.data.dispatch;

    expect(dispatch.topProducts).toEqual([
      {
        productId: productMilk.id,
        productName: "Pasteurized Milk 1L",
        productSku: "MILK-PAST-01",
        dispatches: 1,
        quantity: 20,
      },
      {
        productId: productYogurt.id,
        productName: "Greek Yogurt 500g",
        productSku: "YOG-GRK-01",
        dispatches: 1,
        quantity: 10,
      },
    ]);
    expect(dispatch.byWarehouse).toEqual([
      { warehouseId: warehouseA.id, warehouseName: "Alpha Cold Store", warehouseCode: "WH-ALPHA", quantity: 30 },
    ]);
  });

  // ---------- Periods ----------

  it("supports every period: 7d, 90d (daily) and 12m (monthly)", async () => {
    await seedFixtures();

    const p7 = await summary("?period=7d");
    expect(p7.body.data.granularity).toBe("day");
    expect(p7.body.data.movements.series).toHaveLength(7);
    // Only the last-7-days receipts: 50 + 30.1234.
    expect(p7.body.data.movements.totals.receipts).toBeCloseTo(80.1234, 4);
    expect(p7.body.data.movements.totals.dispatches).toBe(30);

    const p90 = await summary("?period=90d");
    expect(p90.body.data.movements.series).toHaveLength(90);
    expect(p90.body.data.movements.totals.receipts).toBeCloseTo(400.1234, 4); // includes 200 @40d ago
    expect(p90.body.data.movements.totals.dispatches).toBe(30);

    const p12 = await summary("?period=12m");
    expect(p12.body.data.granularity).toBe("month");
    expect(p12.body.data.movements.series).toHaveLength(12);
    expect(p12.body.data.movements.totals.receipts).toBeCloseTo(400.1234, 4);
    expect(p12.body.data.waste.totalQuantity).toBe(11.5);
    // Current stock is time-independent — identical across periods.
    expect(p12.body.data.inventory.totalStockQuantity).toBe(361.1234);
  });

  // ---------- Filters ----------

  it("applies warehouse and product filters consistently across every section", async () => {
    const { m1 } = await seedFixtures();

    const whB = await summary(`?warehouseId=${warehouseB.id}`);
    const whBData = whB.body.data;
    expect(whBData.inventory.totalStockQuantity).toBe(267.5); // M1 15 + M2 252.5
    expect(whBData.inventory.activeWarehouses).toBe(1);
    expect(whBData.movements.totals.receipts).toBe(50);
    expect(whBData.movements.totals.transfersIn).toBe(15);
    expect(whBData.movements.totals.transfersOut).toBe(0);
    expect(whBData.movements.totals.dispatches).toBe(0);
    // Received > 0 but no waste in WH-B: a real 0%, not null.
    expect(whBData.waste.receivedQuantity).toBe(50);
    expect(whBData.waste.totalQuantity).toBe(0);
    expect(whBData.waste.wastePercentOfReceived).toBe(0);
    expect(whBData.dispatch.byWarehouse).toHaveLength(0);
    expect(whBData.expiry.buckets.WARNING).toMatchObject({ batches: 1, totalQuantity: 15 });

    const milk = await summary(`?productId=${productMilk.id}`);
    const milkData = milk.body.data;
    expect(milkData.inventory.totalStockQuantity).toBe(325); // M1 72.5 + M2 252.5
    expect(milkData.movements.totals.receipts).toBe(150); // 100 + 50
    expect(milkData.waste.totalQuantity).toBe(7.5);
    expect(milkData.waste.estimatedValue).toBe(18.75);
    expect(milkData.dispatch.topProducts).toHaveLength(1);
    expect(milkData.dispatch.topProducts[0].productId).toBe(productMilk.id);
    expect(milkData.expiry.buckets.CRITICAL.totalQuantity).toBe(0); // yogurt excluded
    void m1;
  });

  // ---------- Zero vs unavailable ----------

  it("distinguishes real zeros from unavailable data on an empty scope", async () => {
    await seedFixtures();
    const emptyWarehouse = await prisma.warehouse.create({
      data: { name: "Empty Site", code: "WH-EMPTY", location: "Nowhere" },
    });
    const res = await summary(`?warehouseId=${emptyWarehouse.id}`);
    const data = res.body.data;

    expect(data.inventory.totalStockQuantity).toBe(0);
    expect(data.inventory.activeProducts).toBe(0);
    expect(data.inventory.byCategory).toEqual([]);
    // Nothing received in the window -> the ratio is unavailable (null), not 0%.
    expect(data.waste.receivedQuantity).toBe(0);
    expect(data.waste.totalQuantity).toBe(0);
    expect(data.waste.wastePercentOfReceived).toBeNull();
    // No costed waste lines -> value unavailable (null), not zero.
    expect(data.waste.estimatedValue).toBeNull();
    expect(data.expiry.buckets.EXPIRED).toMatchObject({ batches: 0, totalQuantity: 0 });
    expect(data.movements.series.every((b: any) => b.receipts === 0 && b.dispatches === 0)).toBe(true);
  });

  it("excludes waste value only when cost data is genuinely missing, not when zero-cost", async () => {
    await seedFixtures();
    // A batch with an explicit zero unit cost IS cost data (value 0 x qty).
    const zeroCostBatch = await createBatch(productYogurt.id, "LOT-AN-ZEROCOST", dayFromToday(30));
    await seedStock(zeroCostBatch.id, warehouseA.id, 5);
    await seedReceipt(warehouseA.id, zeroCostBatch.id, productYogurt.id, 5, 0);
    const waste = await request(app).post("/api/v1/waste").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      productId: productYogurt.id,
      batchId: zeroCostBatch.id,
      quantity: 5,
      reason: "DAMAGED",
    });
    expect(waste.status).toBe(201);

    const res = await summary();
    // 18.75 (milk) + 0 (zero-cost batch is real cost data) = 18.75
    expect(res.body.data.waste.estimatedValue).toBe(18.75);
    expect(res.body.data.waste.quantityWithCost).toBe(12.5);
    expect(res.body.data.waste.quantityWithoutCost).toBe(4);
  });

  // ---------- Read-only guarantee ----------

  it("never mutates anything: summary leaves movements, waste, dispatches and audit untouched", async () => {
    await seedFixtures();
    const before = {
      movements: await prisma.stockMovement.count(),
      waste: await prisma.wasteRecord.count(),
      dispatches: await prisma.dispatch.count(),
      audits: await prisma.auditLog.count(),
    };

    await summary();
    await summary("?period=12m");
    await summary(`?warehouseId=${warehouseA.id}&productId=${productMilk.id}`);

    expect(await prisma.stockMovement.count()).toBe(before.movements);
    expect(await prisma.wasteRecord.count()).toBe(before.waste);
    expect(await prisma.dispatch.count()).toBe(before.dispatches);
    expect(await prisma.auditLog.count()).toBe(before.audits);
  });

  // ---------- Decimal precision ----------

  it("preserves NUMERIC(19,4) precision through every aggregation", async () => {
    await seedFixtures();
    const res = await summary();
    const data = res.body.data;

    expect(data.inventory.totalStockQuantity).toBe(361.1234);
    expect(data.movements.totals.receipts).toBe(200.1234);
    expect(data.expiry.buckets.CRITICAL.totalQuantity).toBe(20.1234);
    // Waste percent rounds to 4 decimals without float drift.
    expect(data.waste.wastePercentOfReceived).toBeCloseTo(5.7465, 4);
  });
});
