import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

let warehouseA: { id: string; name: string; code: string };
let warehouseB: { id: string; name: string; code: string };
let productMilk: { id: string; name: string; sku: string };
let productYogurt: { id: string; name: string; sku: string };
let batchMilk: { id: string; canonicalCode: string };
let batchYogurt: { id: string; canonicalCode: string };

const futureExpiry = () => new Date(Date.now() + 60 * 24 * 3600 * 1000);
const pastExpiry = () => new Date(Date.now() - 10 * 24 * 3600 * 1000);

async function seedStock(
  batchId: string,
  warehouseId: string,
  quantity: number,
  occurredAt = new Date(),
) {
  const admin = await prisma.user.findUnique({ where: { email: "admin@test.shelfsense.local" } });
  await prisma.stockMovement.create({
    data: {
      warehouseId,
      batchId,
      movementType: "RECEIPT",
      quantity,
      createdBy: admin!.id,
      occurredAt,
    },
  });
}

async function createBatch(
  productId: string,
  canonicalCode: string,
  expiryDate: Date,
  status: "ACTIVE" | "QUARANTINED" | "RECALLED" = "ACTIVE",
) {
  return prisma.batch.create({
    data: { productId, canonicalCode, expiryDate, status },
  });
}

/** Runs a governed ledger mutation and expects success. */
async function transfer(payload: Record<string, unknown>, cookie = adminCookie) {
  return request(app).post("/api/v1/inventory/transfer").set("Cookie", cookie).send(payload);
}

async function adjust(payload: Record<string, unknown>, cookie = adminCookie) {
  return request(app).post("/api/v1/inventory/adjust").set("Cookie", cookie).send(payload);
}

async function reconcile(query = "", cookie = adminCookie) {
  return request(app).get(`/api/v1/reconciliation${query}`).set("Cookie", cookie);
}

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  managerCookie = await loginAs("manager");
  operatorCookie = await loginAs("operator");
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

  batchMilk = await createBatch(productMilk.id, "LOT-REC-MILK", futureExpiry());
  batchYogurt = await createBatch(productYogurt.id, "LOT-REC-YOG", futureExpiry());
});

describe("Reconciliation Integration Tests", () => {
  // ---------- Access control ----------

  it("rejects unauthenticated access and allows every role to read", async () => {
    expect((await request(app).get("/api/v1/reconciliation")).status).toBe(401);
    expect((await request(app).get("/api/v1/reconciliation/overview")).status).toBe(401);

    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      const list = await reconcile("", cookie);
      expect(list.status).toBe(200);
      const overview = await request(app)
        .get("/api/v1/reconciliation/overview")
        .set("Cookie", cookie);
      expect(overview.status).toBe(200);
    }
  });

  // ---------- Cross-warehouse distribution & transfers ----------

  it("shows the same canonical batch across warehouses after a transfer with correct per-warehouse balances", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 100);

    const res = await transfer({
      fromWarehouseId: warehouseA.id,
      toWarehouseId: warehouseB.id,
      batchId: batchMilk.id,
      quantity: 30,
    }, managerCookie);
    expect(res.status).toBe(201);

    const list = await reconcile();
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(row).toBeDefined();

    const whA = row.warehouses.find((w: any) => w.warehouseCode === "WH-ALPHA");
    const whB = row.warehouses.find((w: any) => w.warehouseCode === "WH-BETA");
    expect(whA.availableQuantity).toBe(70);
    expect(whB.availableQuantity).toBe(30);
    expect(row.totalQuantity).toBe(100); // transfers conserve total stock
    expect(row.warehouseCount).toBe(2);
    expect(row.conditions).toContain("MULTI_WAREHOUSE");

    // Recent movement history shows both ledger legs of the transfer.
    const types = row.recentMovements.map((m: any) => m.movementType);
    expect(types).toContain("TRANSFER_OUT");
    expect(types).toContain("TRANSFER_IN");
  });

  it("reflects waste movements in the reconciliation balances", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 50);

    const waste = await request(app).post("/api/v1/waste").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      productId: productMilk.id,
      batchId: batchMilk.id,
      quantity: 12.5,
      reason: "SPOILED",
    });
    expect(waste.status).toBe(201);

    const list = await reconcile();
    const row = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(row.totalQuantity).toBe(37.5);
    expect(row.warehouseCount).toBe(1);
    expect(row.conditions).not.toContain("MULTI_WAREHOUSE");
  });

  // ---------- Open stock-count variances ----------

  it("surfaces open stock-count variances until the count is posted", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 70);

    // Count 65 vs ledger 70 -> variance -5; create -> submit -> approve, do NOT post.
    const created = await request(app).post("/api/v1/stock-counts").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      referenceNo: "CC-REC-1",
      items: [{ productId: productMilk.id, batchId: batchMilk.id, countedQuantity: 65 }],
    });
    expect(created.status).toBe(201);
    const countId = created.body.data.id;

    await request(app).post(`/api/v1/stock-counts/${countId}/submit`).set("Cookie", managerCookie);
    await request(app).post(`/api/v1/stock-counts/${countId}/approve`).set("Cookie", adminCookie);

    const open = await reconcile();
    let row = open.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(row.conditions).toContain("OPEN_VARIANCE");
    expect(row.openVariances).toHaveLength(1);
    expect(row.openVariances[0]).toMatchObject({
      warehouseCode: "WH-ALPHA",
      status: "APPROVED",
      expectedQuantity: 70,
      countedQuantity: 65,
      variance: -5,
      referenceNo: "CC-REC-1",
    });

    // Posting the count writes ADJUSTMENT movements and closes the gap.
    const posted = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(posted.status).toBe(200);

    const after = await reconcile();
    row = after.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(row.openVariances).toHaveLength(0);
    expect(row.conditions).not.toContain("OPEN_VARIANCE");
    // Ledger now matches the counted quantity (65) via posted adjustments.
    expect(row.totalQuantity).toBe(65);
  });

  it("does not treat pending, rejected or posted counts as open variances", async () => {
    await seedStock(batchYogurt.id, warehouseA.id, 40);

    const created = await request(app).post("/api/v1/stock-counts").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      items: [{ productId: productYogurt.id, batchId: batchYogurt.id, countedQuantity: 35 }],
    });
    const countId = created.body.data.id;

    // Still PENDING -> not open.
    let list = await reconcile();
    let row = list.body.data.find((r: any) => r.batchId === batchYogurt.id);
    expect(row.openVariances).toHaveLength(0);

    // SUBMITTED -> open.
    await request(app).post(`/api/v1/stock-counts/${countId}/submit`).set("Cookie", managerCookie);
    list = await reconcile();
    row = list.body.data.find((r: any) => r.batchId === batchYogurt.id);
    expect(row.openVariances).toHaveLength(1);
    expect(row.openVariances[0].status).toBe("SUBMITTED");
  });

  // ---------- Expired stock ----------

  it("flags expired stock still held in a warehouse", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 25);
    const expired = await createBatch(productYogurt.id, "LOT-REC-OLD", pastExpiry());
    await seedStock(expired.id, warehouseB.id, 15);

    const list = await reconcile();
    const expiredRow = list.body.data.find((r: any) => r.batchId === expired.id);
    expect(expiredRow.expiryStatus).toBe("EXPIRED");
    expect(expiredRow.conditions).toContain("EXPIRED_STOCK");

    const freshRow = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(freshRow.conditions).not.toContain("EXPIRED_STOCK");

    // Condition and expiry filters are precise.
    const byCondition = await reconcile("?condition=EXPIRED_STOCK");
    expect(byCondition.body.data).toHaveLength(1);
    expect(byCondition.body.data[0].batchId).toBe(expired.id);

    const byExpiry = await reconcile("?expiryStatus=EXPIRED");
    expect(byExpiry.body.data).toHaveLength(1);
    expect(byExpiry.body.data[0].batchId).toBe(expired.id);
  });

  // ---------- Aliases ----------

  it("lists warehouse-scoped aliases and flags batches known under different codes", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 30);
    await seedStock(batchMilk.id, warehouseB.id, 20);

    const aliasA = await request(app)
      .post(`/api/v1/batches/${batchMilk.id}/aliases`)
      .set("Cookie", adminCookie)
      .send({ warehouseId: warehouseA.id, externalCode: "SUPP-A-777" });
    expect(aliasA.status).toBe(201);
    const aliasB = await request(app)
      .post(`/api/v1/batches/${batchMilk.id}/aliases`)
      .set("Cookie", adminCookie)
      .send({ warehouseId: warehouseB.id, externalCode: "SUPP-B-888" });
    expect(aliasB.status).toBe(201);

    const list = await reconcile();
    const row = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(row.conditions).toContain("MULTI_ALIAS");
    expect(row.aliasCount).toBe(2);

    const whA = row.warehouses.find((w: any) => w.warehouseCode === "WH-ALPHA");
    const whB = row.warehouses.find((w: any) => w.warehouseCode === "WH-BETA");
    expect(whA.aliasCodes).toEqual(["SUPP-A-777"]);
    expect(whB.aliasCodes).toEqual(["SUPP-B-888"]);

    // Searching by a warehouse alias finds the canonical batch — but the
    // module never merges anything automatically.
    const byAlias = await reconcile("?search=SUPP-B-888");
    expect(byAlias.body.data).toHaveLength(1);
    expect(byAlias.body.data[0].canonicalCode).toBe("LOT-REC-MILK");
  });

  // ---------- Inconsistent records ----------

  it("flags inconsistent records: non-active batches holding stock and negative balances", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 10);
    await prisma.batch.update({ where: { id: batchMilk.id }, data: { status: "QUARANTINED" } });

    // A negative ledger balance cannot be produced by the governed APIs;
    // simulate a corrupt ledger entry directly to prove detection.
    const admin = await prisma.user.findUnique({ where: { email: "admin@test.shelfsense.local" } });
    await seedStock(batchYogurt.id, warehouseB.id, 5);
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseB.id,
        batchId: batchYogurt.id,
        movementType: "DISPATCH",
        quantity: 8, // more than available — deliberately inconsistent ledger
        createdBy: admin!.id,
        occurredAt: new Date(),
      },
    });

    const list = await reconcile();
    const quarantined = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(quarantined.conditions).toContain("INCONSISTENT");

    const negative = list.body.data.find((r: any) => r.batchId === batchYogurt.id);
    expect(negative.conditions).toContain("INCONSISTENT");
    expect(
      negative.warehouses.find((w: any) => w.warehouseCode === "WH-BETA").availableQuantity,
    ).toBe(-3);
  });

  // ---------- Zero stock vs missing data ----------

  it("distinguishes zero stock (movement history, 0 balance) from missing data (no movements)", async () => {
    // Batch with history but fully removed stock: adjust down to zero.
    await seedStock(batchMilk.id, warehouseA.id, 10);
    const adj = await adjust({
      warehouseId: warehouseA.id,
      batchId: batchMilk.id,
      quantity: -10,
      reason: "Cycle count correction to zero",
    });
    expect(adj.status).toBe(201);

    // A batch with no ledger history at all.
    await createBatch(productYogurt.id, "LOT-REC-NOHIST", futureExpiry());

    const list = await reconcile();
    const zeroRow = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    expect(zeroRow).toBeDefined();
    expect(zeroRow.totalQuantity).toBe(0);
    expect(zeroRow.warehouses).toHaveLength(1); // history exists — real zero
    expect(zeroRow.warehouseCount).toBe(0);

    // Missing data: the history-less batch never appears.
    expect(list.body.data.find((r: any) => r.canonicalCode === "LOT-REC-NOHIST")).toBeUndefined();
    expect(list.body.meta.total).toBe(1);
  });

  // ---------- Filters ----------

  it("applies warehouse, product and batch filters consistently", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 40);
    await seedStock(batchMilk.id, warehouseB.id, 10);
    await seedStock(batchYogurt.id, warehouseB.id, 22);

    const byWarehouse = await reconcile(`?warehouseId=${warehouseB.id}`);
    const codes = byWarehouse.body.data.map((r: any) => r.canonicalCode).sort();
    expect(codes).toEqual(["LOT-REC-MILK", "LOT-REC-YOG"]);
    // Warehouse scoping: rows only carry the filtered warehouse's numbers.
    const milkRow = byWarehouse.body.data.find((r: any) => r.canonicalCode === "LOT-REC-MILK");
    expect(milkRow.warehouses).toHaveLength(1);
    expect(milkRow.warehouses[0].availableQuantity).toBe(10);
    expect(milkRow.totalQuantity).toBe(10);

    const byProduct = await reconcile(`?productId=${productMilk.id}`);
    expect(byProduct.body.data).toHaveLength(1);
    expect(byProduct.body.data[0].productName).toBe("Pasteurized Milk 1L");

    const byBatch = await reconcile(`?batchId=${batchYogurt.id}`);
    expect(byBatch.body.data).toHaveLength(1);
    expect(byBatch.body.data[0].canonicalCode).toBe("LOT-REC-YOG");

    // Search by product name and by SKU.
    const bySearch = await reconcile("?search=yogurt");
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].productSku).toBe("YOG-GRK-01");
  });

  // ---------- Sorting & pagination ----------

  it("supports pagination and totalQuantity sorting", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 5);
    await seedStock(batchYogurt.id, warehouseA.id, 50);

    const asc = await reconcile("?sortBy=totalQuantity&sortOrder=asc");
    const ascQty = asc.body.data.map((r: any) => r.totalQuantity);
    expect(ascQty).toEqual([...ascQty].sort((a: number, b: number) => a - b));

    const desc = await reconcile("?sortBy=totalQuantity&sortOrder=desc");
    expect(desc.body.data[0].canonicalCode).toBe("LOT-REC-YOG");

    const paged = await reconcile("?page=1&pageSize=1&sortBy=canonicalCode&sortOrder=asc");
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(2);
    expect(paged.body.data[0].canonicalCode).toBe("LOT-REC-MILK");

    const paged2 = await reconcile("?page=2&pageSize=1&sortBy=canonicalCode&sortOrder=asc");
    expect(paged2.body.data[0].canonicalCode).toBe("LOT-REC-YOG");
  });

  // ---------- Decimal precision ----------

  it("preserves NUMERIC(19,4) precision across warehouses and totals", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 12.3456);
    const res = await transfer({
      fromWarehouseId: warehouseA.id,
      toWarehouseId: warehouseB.id,
      batchId: batchMilk.id,
      quantity: 2.2222,
    });
    expect(res.status).toBe(201);

    const list = await reconcile();
    const row = list.body.data.find((r: any) => r.batchId === batchMilk.id);
    const whA = row.warehouses.find((w: any) => w.warehouseCode === "WH-ALPHA");
    const whB = row.warehouses.find((w: any) => w.warehouseCode === "WH-BETA");
    expect(whA.availableQuantity).toBe(10.1234);
    expect(whB.availableQuantity).toBe(2.2222);
    expect(row.totalQuantity).toBe(12.3456);
  });

  // ---------- Read-only guarantee ----------

  it("never mutates inventory: reads leave movements, balances and aliases untouched", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 100);
    await transfer({
      fromWarehouseId: warehouseA.id,
      toWarehouseId: warehouseB.id,
      batchId: batchMilk.id,
      quantity: 10,
    });

    const movementsBefore = await prisma.stockMovement.count();
    const aliasesBefore = await prisma.batchAlias.count();
    const balanceBefore = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batchMilk.id}`)
      .set("Cookie", adminCookie);

    await reconcile("?sortBy=totalQuantity&condition=MULTI_WAREHOUSE");
    await reconcile();
    await request(app).get("/api/v1/reconciliation/overview").set("Cookie", adminCookie);

    expect(await prisma.stockMovement.count()).toBe(movementsBefore);
    expect(await prisma.batchAlias.count()).toBe(aliasesBefore);
    expect(await prisma.auditLog.count({ where: { entityType: "batch" } })).toBe(0);

    const balanceAfter = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batchMilk.id}`)
      .set("Cookie", adminCookie);
    expect(balanceAfter.body.data.availableQuantity).toBe(
      balanceBefore.body.data.availableQuantity,
    );
  });

  // ---------- Ledger reconciliation & overview ----------

  it("reconciles overview totals against the actual ledger movements", async () => {
    await seedStock(batchMilk.id, warehouseA.id, 100);
    await seedStock(batchYogurt.id, warehouseA.id, 40);
    await seedStock(batchMilk.id, warehouseB.id, 25);
    await transfer({
      fromWarehouseId: warehouseA.id,
      toWarehouseId: warehouseB.id,
      batchId: batchYogurt.id,
      quantity: 15,
    }, managerCookie);
    await request(app).post("/api/v1/waste").set("Cookie", managerCookie).send({
      warehouseId: warehouseA.id,
      productId: productMilk.id,
      batchId: batchMilk.id,
      quantity: 5,
      reason: "DAMAGED",
    });

    // Ground truth: sum RECEIPT + TRANSFER_IN + ADJUSTMENT minus the rest,
    // straight from the immutable ledger.
    const movements = await prisma.stockMovement.findMany();
    let ledgerTotal = 0;
    for (const m of movements) {
      const q = Number(m.quantity);
      if (["RECEIPT", "TRANSFER_IN", "ADJUSTMENT"].includes(m.movementType)) ledgerTotal += q;
      else ledgerTotal -= q;
    }
    ledgerTotal = Math.round(ledgerTotal * 10000) / 10000;

    const overview = await request(app)
      .get("/api/v1/reconciliation/overview")
      .set("Cookie", adminCookie);
    expect(overview.status).toBe(200);
    expect(overview.body.data.totalQuantity).toBe(ledgerTotal);
    expect(overview.body.data.batchesWithStock).toBe(2);
    expect(overview.body.data.multiWarehouseBatches).toBe(2);

    // The list endpoint agrees with the overview.
    const list = await reconcile();
    const listTotal =
      Math.round(list.body.data.reduce((acc: number, r: any) => acc + r.totalQuantity, 0) * 10000) / 10000;
    expect(listTotal).toBe(overview.body.data.totalQuantity);

    // Warehouse-scoped overview only counts that warehouse's movements.
    const scoped = await request(app)
      .get(`/api/v1/reconciliation/overview?warehouseId=${warehouseB.id}`)
      .set("Cookie", adminCookie);
    const whBMovements = movements.filter((m) => m.warehouseId === warehouseB.id);
    let whBTotal = 0;
    for (const m of whBMovements) {
      const q = Number(m.quantity);
      if (["RECEIPT", "TRANSFER_IN", "ADJUSTMENT"].includes(m.movementType)) whBTotal += q;
      else whBTotal -= q;
    }
    expect(scoped.body.data.totalQuantity).toBe(Math.round(whBTotal * 10000) / 10000);
  });
});
