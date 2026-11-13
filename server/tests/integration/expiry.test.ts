import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
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

/**
 * Deterministic boundary dates: local midnight N days from today, so
 * Math.ceil of the day difference yields exactly N (the classification is
 * computed against the server's local calendar, same as production).
 */
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
  const receipt = await prisma.receipt.create({
    data: {
      warehouseId,
      receivedAt,
      createdBy: adminUserId,
      items: {
        create: {
          productId,
          batchId,
          quantity,
          unitCost: unitCost === null ? undefined : unitCost,
        },
      },
    },
  });
  return receipt;
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

const monitor = (query = "", cookie = adminCookie) =>
  request(app).get(`/api/v1/expiry/monitor${query}`).set("Cookie", cookie);

describe("Expiry Intelligence Integration Tests", () => {
  // ---------- Access control ----------

  it("rejects unauthenticated access and allows every role to read", async () => {
    expect((await request(app).get("/api/v1/expiry/monitor")).status).toBe(401);
    expect((await request(app).get("/api/v1/expiry/trends")).status).toBe(401);

    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      expect((await monitor("", cookie)).status).toBe(200);
      const trends = await request(app).get("/api/v1/expiry/trends").set("Cookie", cookie);
      expect(trends.status).toBe(200);
    }
  });

  // ---------- Bucket boundaries ----------

  it("classifies every expiry boundary exactly: 31, 30, 15, 14, 7, 6, 1, 0, -1 days", async () => {
    const boundaries: Array<[number, string]> = [
      [31, "SAFE"],
      [30, "MONITOR"],
      [15, "MONITOR"],
      [14, "WARNING"],
      [7, "WARNING"],
      [6, "CRITICAL"],
      [1, "CRITICAL"],
      [0, "EXPIRED"],
      [-1, "EXPIRED"],
    ];

    for (const [days, expected] of boundaries) {
      const batch = await createBatch(
        productMilk.id,
        `LOT-EXP-${String(days).padStart(3, "0")}`,
        dayFromToday(days),
      );
      await seedStock(batch.id, warehouseA.id, 10);
    }

    const res = await monitor();
    expect(res.status).toBe(200);
    const data = res.body.data;

    // 9 batches all holding 10 units; EXPIRED holds 3 (0, -1, and none
    // other), SAFE 1, MONITOR 2, WARNING 2, CRITICAL 2.
    expect(data.buckets.SAFE).toMatchObject({ batches: 1, totalQuantity: 10 });
    expect(data.buckets.MONITOR).toMatchObject({ batches: 2, totalQuantity: 20 });
    expect(data.buckets.WARNING).toMatchObject({ batches: 2, totalQuantity: 20 });
    expect(data.buckets.CRITICAL).toMatchObject({ batches: 2, totalQuantity: 20 });
    expect(data.buckets.EXPIRED).toMatchObject({ batches: 2, totalQuantity: 20 });

    expect(data.totals.batchesWithStock).toBe(9);
    expect(data.totals.totalQuantity).toBe(90);

    // Near-expiry list: DTE 1..30 -> 6 rows (1,6,7,14,15,30), most urgent first.
    expect(data.atRisk).toHaveLength(6);
    expect(data.atRisk[0].daysToExpiry).toBe(1);
    expect(data.atRisk[data.atRisk.length - 1].daysToExpiry).toBe(30);
    expect(data.atRisk.every((r: any) => r.expiryStatus !== "EXPIRED")).toBe(true);

    // Expired list: DTE <= 0 -> 2 rows (0, -1).
    expect(data.expired).toHaveLength(2);
    expect(data.expired[0].daysToExpiry).toBe(-1);
    expect(data.expired.every((r: any) => r.expiryStatus === "EXPIRED")).toBe(true);

    // expiryStatus filter narrows the lists to that bucket only.
    const criticalOnly = await monitor("?expiryStatus=CRITICAL");
    expect(criticalOnly.body.data.atRisk).toHaveLength(2);
    expect(criticalOnly.body.data.atRisk.every((r: any) => r.expiryStatus === "CRITICAL")).toBe(true);
    expect(criticalOnly.body.data.expired).toHaveLength(0);
    // Bucket overview still describes the whole distribution.
    expect(criticalOnly.body.data.buckets.CRITICAL.batches).toBe(2);
  });

  it("derives quantities from the ledger across warehouses (transfer legs, dispatch effects)", async () => {
    const batch = await createBatch(productMilk.id, "LOT-EXP-LEDGER", dayFromToday(20));
    await seedStock(batch.id, warehouseA.id, 100);

    const transfer = await request(app).post("/api/v1/inventory/transfer").set("Cookie", managerCookie).send({
      fromWarehouseId: warehouseA.id,
      toWarehouseId: warehouseB.id,
      batchId: batch.id,
      quantity: 30,
    });
    expect(transfer.status).toBe(201);

    let res = await monitor();
    expect(res.body.data.buckets.MONITOR).toMatchObject({ batches: 1, totalQuantity: 100 });
    const whA = res.body.data.warehouses.find((w: any) => w.warehouseCode === "WH-ALPHA");
    const whB = res.body.data.warehouses.find((w: any) => w.warehouseCode === "WH-BETA");
    expect(whA.buckets.MONITOR).toBe(70);
    expect(whB.buckets.MONITOR).toBe(30);

    // Dispatching removes from the monitored stock (governed API).
    const dispatched = await request(app).post("/api/v1/dispatches").set("Cookie", managerCookie).send({
      warehouseId: warehouseB.id,
      referenceNo: "EXP-TEST-1",
      items: [{ productId: productMilk.id, batchId: batch.id, quantity: 10 }],
    });
    expect(dispatched.status).toBe(201);

    res = await monitor();
    expect(res.body.data.buckets.MONITOR.totalQuantity).toBe(90);
    const whBAfter = res.body.data.warehouses.find((w: any) => w.warehouseCode === "WH-BETA");
    expect(whBAfter.buckets.MONITOR).toBe(20);
  });

  // ---------- Zero stock vs missing data ----------

  it("distinguishes zero stock (real, not listed) from missing data (absent)", async () => {
    // Expired batch fully adjusted down to zero.
    const zeroBatch = await createBatch(productMilk.id, "LOT-EXP-ZERO", dayFromToday(-3));
    await seedStock(zeroBatch.id, warehouseA.id, 10);
    const adj = await request(app).post("/api/v1/inventory/adjust").set("Cookie", adminCookie).send({
      warehouseId: warehouseA.id,
      batchId: zeroBatch.id,
      quantity: -10,
      reason: "Cycle count correction to zero",
    });
    expect(adj.status).toBe(201);

    // Safe batch with no ledger history at all.
    await createBatch(productYogurt.id, "LOT-EXP-NOHIST", futureExpiry());

    const res = await monitor();
    expect(res.body.data.totals.batchesWithStock).toBe(0);
    expect(res.body.data.totals.totalQuantity).toBe(0);
    expect(res.body.data.expired).toHaveLength(0);
    expect(res.body.data.atRisk).toHaveLength(0);
    // The history-less batch never appears anywhere.
    expect(res.body.data.warehouses).toHaveLength(0);
  });

  // ---------- Estimated value at risk ----------

  it("estimates value from actual receipt unit costs with Decimal precision", async () => {
    const costed = await createBatch(productMilk.id, "LOT-EXP-COST", dayFromToday(4));
    await seedStock(costed.id, warehouseA.id, 12.3456);
    // Latest receipt wins for the cost basis.
    await seedReceipt(warehouseA.id, costed.id, productMilk.id, 50, 2, new Date("2026-01-01"));
    await seedReceipt(warehouseA.id, costed.id, productMilk.id, 100, 3.5, new Date("2026-06-01"));

    const uncosted = await createBatch(productYogurt.id, "LOT-EXP-NOCOST", dayFromToday(10));
    await seedStock(uncosted.id, warehouseA.id, 8);

    // A receipt with an explicitly null cost must not fabricate a value.
    await seedReceipt(warehouseA.id, uncosted.id, productYogurt.id, 8, null);

    const res = await monitor();
    const data = res.body.data;

    const costedRow = data.atRisk.find((r: any) => r.canonicalCode === "LOT-EXP-COST");
    expect(costedRow.unitCost).toBe(3.5); // latest costed receipt
    // 12.3456 * 3.5 = 43.2096 exactly (NUMERIC(19,4) math)
    expect(costedRow.estimatedValue).toBe(43.2096);

    const uncostedRow = data.atRisk.find((r: any) => r.canonicalCode === "LOT-EXP-NOCOST");
    expect(uncostedRow.estimatedValue).toBeNull();
    expect(uncostedRow.unitCost).toBeNull();

    expect(data.totals.estimatedValueAtRisk).toBe(43.2096);
    expect(data.totals.quantityWithCost).toBe(12.3456);
    expect(data.totals.quantityWithoutCost).toBe(8);

    // Warehouse breakdown carries the same value total.
    const whA = data.warehouses.find((w: any) => w.warehouseCode === "WH-ALPHA");
    expect(whA.estimatedValueAtRisk).toBe(43.2096);
  });

  // ---------- Filters ----------

  it("applies warehouse and product filters consistently", async () => {
    const milkBatch = await createBatch(productMilk.id, "LOT-EXP-FMILK", dayFromToday(5));
    await seedStock(milkBatch.id, warehouseA.id, 40);
    await seedStock(milkBatch.id, warehouseB.id, 10);
    const yogurtBatch = await createBatch(productYogurt.id, "LOT-EXP-FYOG", dayFromToday(25));
    await seedStock(yogurtBatch.id, warehouseB.id, 22);

    const scoped = await monitor(`?warehouseId=${warehouseB.id}`);
    expect(scoped.body.data.totals.totalQuantity).toBe(32);
    expect(scoped.body.data.buckets.CRITICAL.totalQuantity).toBe(10); // milk in WH-BETA only
    expect(scoped.body.data.buckets.MONITOR.totalQuantity).toBe(22);
    expect(scoped.body.data.atRisk.every((r: any) => r.warehouseCode === "WH-BETA")).toBe(true);
    expect(scoped.body.data.warehouses).toHaveLength(1);

    const byProduct = await monitor(`?productId=${productMilk.id}`);
    expect(byProduct.body.data.totals.batchesWithStock).toBe(1);
    expect(byProduct.body.data.totals.totalQuantity).toBe(50);
    expect(byProduct.body.data.atRisk.every((r: any) => r.productSku === "MILK-PAST-01")).toBe(true);
  });

  // ---------- Trends ----------

  it("aggregates historical expiry-related waste by month from actual records only", async () => {
    const milkBatch = await createBatch(productMilk.id, "LOT-EXP-TMILK", dayFromToday(-40));
    await seedStock(milkBatch.id, warehouseA.id, 100);
    const yogurtBatch = await createBatch(productYogurt.id, "LOT-EXP-TYOG", dayFromToday(-40));
    await seedStock(yogurtBatch.id, warehouseB.id, 60);

    const monthAt = (monthsAgo: number) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0); // midday, safe from month-boundary edges
      d.setMonth(d.getMonth() - monthsAgo);
      return d.toISOString();
    };

    // Waste recorded through the governed API with historical recordedAt.
    const waste = async (payload: Record<string, unknown>) =>
      request(app).post("/api/v1/waste").set("Cookie", managerCookie).send(payload);

    // Current month: expired 10 (whA) + damaged 4 (whB); prior month: expired 7.5.
    expect((await waste({ warehouseId: warehouseA.id, productId: productMilk.id, batchId: milkBatch.id, quantity: 10, reason: "EXPIRED" })).status).toBe(201);
    expect((await waste({ warehouseId: warehouseB.id, productId: productYogurt.id, batchId: yogurtBatch.id, quantity: 4, reason: "DAMAGED" })).status).toBe(201);
    expect((await waste({ warehouseId: warehouseA.id, productId: productMilk.id, batchId: milkBatch.id, quantity: 7.5, reason: "EXPIRED", recordedAt: monthAt(1) })).status).toBe(201);

    const res = await request(app).get("/api/v1/expiry/trends").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.months).toBe(12);
    expect(data.series).toHaveLength(12);

    const currentMonth = data.series[data.series.length - 1];
    expect(currentMonth.expiredQuantity).toBe(10);
    expect(currentMonth.expiredRecords).toBe(1);
    expect(currentMonth.totalWasteQuantity).toBe(14); // damaged included in total, not in expired

    const previousMonth = data.series[data.series.length - 2];
    expect(previousMonth.expiredQuantity).toBe(7.5);
    expect(previousMonth.expiredRecords).toBe(1);
    expect(previousMonth.totalWasteQuantity).toBe(7.5);

    // Empty months are present with zeros — no invented events.
    expect(data.series[0].expiredQuantity).toBe(0);
    expect(data.series[0].totalWasteQuantity).toBe(0);

    expect(data.totals).toMatchObject({ expiredQuantity: 17.5, expiredRecords: 2, totalWasteQuantity: 21.5 });
    expect(data.byReason).toContainEqual({ reason: "EXPIRED", records: 2, quantity: 17.5 });
    expect(data.byReason).toContainEqual({ reason: "DAMAGED", records: 1, quantity: 4 });

    const whA = data.byWarehouse.find((w: any) => w.code === "WH-ALPHA");
    expect(whA).toMatchObject({ expiredQuantity: 17.5, totalWasteQuantity: 17.5 });
    const whB = data.byWarehouse.find((w: any) => w.code === "WH-BETA");
    expect(whB).toMatchObject({ expiredQuantity: 0, totalWasteQuantity: 4 });

    const milk = data.byProduct.find((p: any) => p.code === "MILK-PAST-01");
    expect(milk).toMatchObject({ expiredQuantity: 17.5 });

    // Shorter window: only records within the last N months.
    const short = await request(app).get("/api/v1/expiry/trends?months=1").set("Cookie", adminCookie);
    expect(short.body.data.series).toHaveLength(1);
    expect(short.body.data.totals.expiredQuantity).toBe(10); // prior-month record outside window

    // Warehouse scoping.
    const scoped = await request(app)
      .get(`/api/v1/expiry/trends?warehouseId=${warehouseB.id}`)
      .set("Cookie", adminCookie);
    expect(scoped.body.data.totals.expiredQuantity).toBe(0);
    expect(scoped.body.data.totals.totalWasteQuantity).toBe(4);
  });

  it("reports an empty trends window honestly when no waste was recorded", async () => {
    const res = await request(app).get("/api/v1/expiry/trends?months=3").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(3);
    expect(res.body.data.series.every((m: any) => m.expiredQuantity === 0 && m.totalWasteQuantity === 0)).toBe(true);
    expect(res.body.data.totals).toMatchObject({ expiredQuantity: 0, expiredRecords: 0, totalWasteQuantity: 0 });
    expect(res.body.data.byWarehouse).toHaveLength(0);
    expect(res.body.data.byProduct).toHaveLength(0);
  });

  // ---------- Read-only guarantee & precision ----------

  it("never mutates inventory and preserves NUMERIC(19,4) precision", async () => {
    const batch = await createBatch(productMilk.id, "LOT-EXP-RO", dayFromToday(3));
    await seedStock(batch.id, warehouseA.id, 12.3456);
    await seedReceipt(warehouseA.id, batch.id, productMilk.id, 20, 1.2345);

    const movementsBefore = await prisma.stockMovement.count();
    const balancesBefore = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);

    await monitor("?expiryStatus=CRITICAL");
    await monitor();
    await request(app).get("/api/v1/expiry/trends").set("Cookie", adminCookie);

    expect(await prisma.stockMovement.count()).toBe(movementsBefore);
    expect(await prisma.auditLog.count({ where: { entityType: "stock_movement" } })).toBe(0);

    const balancesAfter = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balancesAfter.body.data.availableQuantity).toBe(
      balancesBefore.body.data.availableQuantity,
    );

    const res = await monitor();
    const row = res.body.data.atRisk[0];
    expect(row.availableQuantity).toBe(12.3456);
    // 12.3456 * 1.2345 = 15.2380... rounded to 4 decimals via Decimal math
    expect(row.estimatedValue).toBeCloseTo(Number(new Prisma.Decimal("12.3456").times("1.2345").toFixed(4)), 6);
  });
});
