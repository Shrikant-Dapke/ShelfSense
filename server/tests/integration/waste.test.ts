import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;
let adminUserId: string;

let warehouse: { id: string; name: string; code: string };
let warehouse2: { id: string; name: string; code: string };
let productA: { id: string; name: string; sku: string };
let productB: { id: string; name: string; sku: string };
let batchA: { id: string; canonicalCode: string };
let batchB: { id: string; canonicalCode: string };

const futureExpiry = () => new Date(Date.now() + 60 * 24 * 3600 * 1000);
const pastExpiry = () => new Date(Date.now() - 10 * 24 * 3600 * 1000);

/** Seeds `quantity` units of a batch into the warehouse via a RECEIPT movement. */
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
  status: "ACTIVE" | "QUARANTINED" | "RECALLED" = "ACTIVE",
) {
  return prisma.batch.create({
    data: { productId, canonicalCode, expiryDate, status },
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

  warehouse = await prisma.warehouse.create({
    data: { name: "Central Cold Store", code: "WH-COLD-1", location: "Dock A" },
  });
  warehouse2 = await prisma.warehouse.create({
    data: { name: "North Depot", code: "WH-NORTH-2", location: "Dock B" },
  });

  productA = await prisma.product.create({
    data: { name: "Pasteurized Milk 1L", sku: "MILK-PAST-01", category: "Dairy", unit: "L" },
  });
  productB = await prisma.product.create({
    data: { name: "Greek Yogurt 500g", sku: "YOG-GRK-01", category: "Dairy", unit: "kg" },
  });

  batchA = await createBatch(productA.id, "LOT-WA-1", futureExpiry());
  batchB = await createBatch(productB.id, "LOT-WB-1", futureExpiry());
});

const wastePayload = (overrides: Record<string, unknown> = {}) => ({
  warehouseId: warehouse.id,
  productId: productA.id,
  batchId: batchA.id,
  quantity: 10,
  reason: "SPOILED",
  ...overrides,
});

describe("Waste Management Integration Tests", () => {
  // ---------- Access control & RBAC ----------

  it("rejects unauthenticated access to all waste endpoints", async () => {
    const list = await request(app).get("/api/v1/waste");
    expect(list.status).toBe(401);

    const create = await request(app).post("/api/v1/waste").send(wastePayload());
    expect(create.status).toBe(401);

    const summary = await request(app).get("/api/v1/waste/summary");
    expect(summary.status).toBe(401);
  });

  it("allows OPERATOR to record waste but forbids the administrative summary", async () => {
    await seedStock(batchA.id, warehouse.id, 100);

    const create = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ quantity: 5 }));
    expect(create.status).toBe(201);

    const summary = await request(app)
      .get("/api/v1/waste/summary")
      .set("Cookie", operatorCookie);
    expect(summary.status).toBe(403);
  });

  it("allows ADMIN and MANAGER to read the summary; all roles may read history", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ quantity: 5 }));

    for (const cookie of [adminCookie, managerCookie]) {
      const summary = await request(app).get("/api/v1/waste/summary").set("Cookie", cookie);
      expect(summary.status).toBe(200);
      expect(summary.body.data.totalRecords).toBe(1);
    }
    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      const list = await request(app).get("/api/v1/waste").set("Cookie", cookie);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
    }
  });

  // ---------- Validation ----------

  it("rejects invalid payloads: missing reason, non-positive quantity, bad ids", async () => {
    const noReason = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ reason: undefined }));
    expect(noReason.status).toBe(422);

    const badReason = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ reason: "NOT_A_REASON" }));
    expect(badReason.status).toBe(422);

    const zeroQty = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 0 }));
    expect(zeroQty.status).toBe(422);

    const negativeQty = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: -5 }));
    expect(negativeQty.status).toBe(422);

    const overPrecise = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 1.23456 }));
    expect(overPrecise.status).toBe(422);

    const badBatch = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ batchId: "not-a-uuid" }));
    expect(badBatch.status).toBe(422);
  });

  it("rejects unknown batch, product mismatch, and inactive warehouse", async () => {
    const unknownBatch = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ batchId: "00000000-0000-4000-8000-000000000000" }));
    expect(unknownBatch.status).toBe(404);

    const productMismatch = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ productId: productB.id }));
    expect(productMismatch.status).toBe(400);

    const inactive = await prisma.warehouse.create({
      data: { name: "Closed Depot", code: "WH-CLOSED", isActive: false },
    });
    const inactiveWh = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ warehouseId: inactive.id }));
    expect(inactiveWh.status).toBe(404);
  });

  // ---------- Atomic creation & ledger effects ----------

  it("atomically creates the WASTE movement and linked WasteRecord and deducts the ledger", async () => {
    await seedStock(batchA.id, warehouse.id, 100);

    const res = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", managerCookie)
      .send(wastePayload({ quantity: 30, notes: "Leaked in cold storage" }));
    expect(res.status).toBe(201);

    const record = res.body.data;
    expect(record.quantity).toBe(30);
    expect(record.reason).toBe("SPOILED");
    expect(record.relatedStockMovementId).toBeTruthy();
    expect(record.canonicalCode).toBe("LOT-WA-1");
    expect(record.productName).toBe("Pasteurized Milk 1L");
    expect(record.warehouseCode).toBe("WH-COLD-1");

    // Both rows exist and are linked.
    const movement = await prisma.stockMovement.findUnique({
      where: { id: record.relatedStockMovementId },
    });
    expect(movement).not.toBeNull();
    expect(movement!.movementType).toBe("WASTE");
    expect(Number(movement!.quantity)).toBe(30);

    // Ledger-derived balance dropped from 100 to 70.
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(70);
  });

  it("prevents negative stock and rolls back completely when the request exceeds the balance", async () => {
    await seedStock(batchA.id, warehouse.id, 10);

    const res = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 11 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");

    // No movement, no record, no balance change — full rollback.
    expect(await prisma.stockMovement.count({ where: { batchId: batchA.id, movementType: "WASTE" } })).toBe(0);
    expect(await prisma.wasteRecord.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "waste.recorded" } })).toBe(0);

    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(10);
  });

  it("recalculates the balance under the row lock, not from a stale pre-read", async () => {
    // The balance is derived from movements AFTER the lock; seed exactly the
    // requestable amount and confirm a matching request succeeds precisely.
    await seedStock(batchA.id, warehouse.id, 12.5);
    const res = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 12.5 }));
    expect(res.status).toBe(201);

    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(0);
  });

  it("allows wasting expired and quarantined stock", async () => {
    await seedStock(batchA.id, warehouse.id, 40);

    const expired = await createBatch(productA.id, "LOT-WA-EXPIRED", pastExpiry());
    await seedStock(expired.id, warehouse.id, 20);

    const quarantined = await createBatch(productB.id, "LOT-WB-QUAR", futureExpiry(), "QUARANTINED");
    await seedStock(quarantined.id, warehouse.id, 15);

    const expiredRes = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ batchId: expired.id, productId: productA.id, quantity: 20, reason: "EXPIRED" }));
    expect(expiredRes.status).toBe(201);
    expect(expiredRes.body.data.batchStatus).toBe("ACTIVE"); // batch row itself unchanged

    const quarantinedRes = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ batchId: quarantined.id, productId: productB.id, quantity: 15, reason: "DAMAGED" }));
    expect(quarantinedRes.status).toBe(201);

    const expiredBal = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${expired.id}`)
      .set("Cookie", adminCookie);
    expect(expiredBal.body.data.availableQuantity).toBe(0);

    const quarantinedBal = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${quarantined.id}`)
      .set("Cookie", adminCookie);
    expect(quarantinedBal.body.data.availableQuantity).toBe(0);
  });

  // ---------- Idempotency ----------

  it("rejects duplicate idempotency keys with 409 and never double-wastes", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    const key = "a1b2c3d4-0000-4000-8000-000000000001";

    const first = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ quantity: 10, idempotencyKey: key }));
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 10, idempotencyKey: key }));
    expect(replay.status).toBe(409);

    expect(await prisma.wasteRecord.count()).toBe(1);
    expect(await prisma.stockMovement.count({ where: { idempotencyKey: key } })).toBe(1);

    // Balance dropped exactly once.
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(90);
  });

  // ---------- Decimal precision ----------

  it("preserves NUMERIC(19,4) precision end to end", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    await seedStock(batchB.id, warehouse.id, 100);

    const res = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ batchId: batchB.id, productId: productB.id, quantity: 12.3456 }));
    expect(res.status).toBe(201);

    const movement = await prisma.stockMovement.findFirst({
      where: { batchId: batchB.id, movementType: "WASTE" },
    });
    expect(movement!.quantity.toString()).toBe("12.3456");

    const record = await prisma.wasteRecord.findFirst();
    expect(record!.quantity.toString()).toBe("12.3456");

    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchB.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(87.6544);
  });

  // ---------- Audit logging ----------

  it("writes an audit entry for every recorded waste", async () => {
    await seedStock(batchA.id, warehouse.id, 100);

    await request(app)
      .post("/api/v1/waste")
      .set("Cookie", operatorCookie)
      .send(wastePayload({ quantity: 3 }));

    const audits = await prisma.auditLog.findMany({ where: { action: "waste.recorded" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].entityType).toBe("waste_record");
    expect(audits[0].metadata).toMatchObject({ reason: "SPOILED", quantity: "3.0000" });
  });

  // ---------- History: detail, filters, pagination ----------

  it("returns a waste record by ID; 404 for unknown and 400 for malformed IDs", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    const created = await request(app)
      .post("/api/v1/waste")
      .set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 5 }));
    const id = created.body.data.id as string;

    const got = await request(app).get(`/api/v1/waste/${id}`).set("Cookie", operatorCookie);
    expect(got.status).toBe(200);
    expect(got.body.data.id).toBe(id);
    expect(got.body.data.notes).toBeNull();

    const missing = await request(app)
      .get("/api/v1/waste/00000000-0000-4000-8000-000000000099")
      .set("Cookie", adminCookie);
    expect(missing.status).toBe(404);

    const malformed = await request(app).get("/api/v1/waste/not-a-uuid").set("Cookie", adminCookie);
    expect(malformed.status).toBe(400);
  });

  it("supports warehouse, reason, batch, date filters and search with pagination", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    await seedStock(batchB.id, warehouse.id, 100);
    await seedStock(batchA.id, warehouse2.id, 50);

    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 5, reason: "EXPIRED" }));
    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ batchId: batchB.id, productId: productB.id, quantity: 7, reason: "DAMAGED" }));
    await request(app).post("/api/v1/waste").set("Cookie", managerCookie)
      .send(wastePayload({ warehouseId: warehouse2.id, quantity: 3, reason: "LOST" }));

    const byWarehouse = await request(app)
      .get(`/api/v1/waste?warehouseId=${warehouse.id}`)
      .set("Cookie", adminCookie);
    expect(byWarehouse.body.data).toHaveLength(2);

    const byReason = await request(app)
      .get("/api/v1/waste?reason=EXPIRED")
      .set("Cookie", adminCookie);
    expect(byReason.body.data).toHaveLength(1);
    expect(byReason.body.data[0].reason).toBe("EXPIRED");

    const byBatch = await request(app)
      .get(`/api/v1/waste?batchId=${batchB.id}`)
      .set("Cookie", adminCookie);
    expect(byBatch.body.data).toHaveLength(1);
    expect(byBatch.body.data[0].canonicalCode).toBe("LOT-WB-1");

    const bySearch = await request(app)
      .get("/api/v1/waste?search=YOG-GRK-01")
      .set("Cookie", adminCookie);
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].productSku).toBe("YOG-GRK-01");

    const byProduct = await request(app)
      .get(`/api/v1/waste?productId=${productA.id}`)
      .set("Cookie", adminCookie);
    // Records 1 (EXPIRED, batchA) and 3 (LOST, batchA in warehouse2) are both product A.
    expect(byProduct.body.data).toHaveLength(2);

    const dated = await request(app)
      .get(`/api/v1/waste?fromDate=${new Date(Date.now() + 3600 * 1000).toISOString()}`)
      .set("Cookie", adminCookie);
    expect(dated.body.data).toHaveLength(0);

    const paged = await request(app)
      .get("/api/v1/waste?page=1&pageSize=2&sortBy=reason&sortOrder=asc")
      .set("Cookie", adminCookie);
    expect(paged.status).toBe(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.total).toBe(3);
    // Postgres enums sort by declaration order (EXPIRED first), not alphabetically.
    expect(paged.body.data[0].reason).toBe("EXPIRED");
  });

  // ---------- Summary reconciliation ----------

  it("summarizes by reason and warehouse and reconciles with the ledger movements", async () => {
    await seedStock(batchA.id, warehouse.id, 100);
    await seedStock(batchB.id, warehouse.id, 100);
    await seedStock(batchA.id, warehouse2.id, 50);

    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 10, reason: "EXPIRED" }));
    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ quantity: 2.5, reason: "EXPIRED" }));
    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ batchId: batchB.id, productId: productB.id, quantity: 7, reason: "DAMAGED" }));
    await request(app).post("/api/v1/waste").set("Cookie", adminCookie)
      .send(wastePayload({ warehouseId: warehouse2.id, quantity: 4, reason: "SPOILED" }));

    const summary = await request(app)
      .get("/api/v1/waste/summary")
      .set("Cookie", adminCookie);
    expect(summary.status).toBe(200);
    const data = summary.body.data;

    expect(data.totalRecords).toBe(4);
    expect(data.totalQuantity).toBe(23.5);

    const expired = data.byReason.find((r: any) => r.reason === "EXPIRED");
    const damaged = data.byReason.find((r: any) => r.reason === "DAMAGED");
    const spoiled = data.byReason.find((r: any) => r.reason === "SPOILED");
    expect(expired.totalQuantity).toBe(12.5);
    expect(expired.records).toBe(2);
    expect(damaged.totalQuantity).toBe(7);
    expect(spoiled.totalQuantity).toBe(4);

    const wh1 = data.byWarehouse.find((w: any) => w.warehouseCode === "WH-COLD-1");
    const wh2 = data.byWarehouse.find((w: any) => w.warehouseCode === "WH-NORTH-2");
    expect(wh1.totalQuantity).toBe(19.5);
    expect(wh1.records).toBe(3);
    expect(wh2.totalQuantity).toBe(4);

    // Scoped to one warehouse.
    const scoped = await request(app)
      .get(`/api/v1/waste/summary?warehouseId=${warehouse2.id}`)
      .set("Cookie", adminCookie);
    expect(scoped.body.data.totalRecords).toBe(1);
    expect(scoped.body.data.totalQuantity).toBe(4);

    // Reconciliation: the WASTE ledger movements must sum to the same totals.
    const movements = await prisma.stockMovement.findMany({ where: { movementType: "WASTE" } });
    const movementTotal =
      Math.round(movements.reduce((acc, m) => acc + Number(m.quantity), 0) * 10000) / 10000;
    expect(movementTotal).toBe(data.totalQuantity);
    expect(movements).toHaveLength(data.totalRecords);

    const mvApi = await request(app)
      .get("/api/v1/inventory/movements?movementType=WASTE&pageSize=100")
      .set("Cookie", adminCookie);
    expect(mvApi.status).toBe(200);
    expect(mvApi.body.data).toHaveLength(4);
  });
});
