import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

let warehouseA: { id: string; name: string; code: string };
let warehouseB: { id: string; name: string; code: string };
let product: { id: string; name: string; sku: string };
let batch: { id: string; canonicalCode: string };

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  managerCookie = await loginAs("manager");
  operatorCookie = await loginAs("operator");
});

beforeEach(async () => {
  // Clean operational data while keeping test users
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

  // Create baseline warehouses
  warehouseA = await prisma.warehouse.create({
    data: { name: "Warehouse Alpha", code: "WH-ALPHA", location: "Zone 1" },
  });
  warehouseB = await prisma.warehouse.create({
    data: { name: "Warehouse Beta", code: "WH-BETA", location: "Zone 2" },
  });

  // Create baseline product
  product = await prisma.product.create({
    data: {
      name: "Organic Whole Milk 1L",
      sku: "DAI-MILK-100",
      category: "Dairy",
      unit: "L",
      brand: "FreshFarm",
    },
  });

  // Create baseline batch
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  batch = await prisma.batch.create({
    data: {
      productId: product.id,
      canonicalCode: "LOT-MILK-2026-01",
      expiryDate: expiry,
    },
  });
});

describe("Inventory Ledger & Stock Operations", () => {
  it("calculates inventory balance accurately from movements", async () => {
    // Seed initial receipt of 100 units in Warehouse A
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 100,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableQuantity).toBe(100);
    expect(res.body.data.expectedQuantity).toBe(100);
  });

  it("handles positive adjustments (surplus) and negative adjustments (shrinkage)", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 50,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    // Positive adjustment (+10)
    const posRes = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: 10,
        reason: "Audit surplus found in shelf B2",
      });
    expect(posRes.status).toBe(201);

    let balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(60);

    // Negative adjustment (-15)
    const negRes = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: -15,
        reason: "Damaged packaging during handling",
      });
    expect(negRes.status).toBe(201);

    balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(45);
  });

  it("prevents negative stock when adjustment exceeds available balance", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 20,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: -25, // Exceeds available 20
        reason: "Bulk write-off attempt",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/negative stock/i);

    // Verify balance was unchanged
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(20);
  });

  it("protects against duplicate operations via idempotencyKey", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 50,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const idempotencyKey = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

    const first = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: 5,
        reason: "Cycle count adjustment",
        idempotencyKey,
      });
    expect(first.status).toBe(201);

    // Duplicate call with same idempotency key
    const second = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: 5,
        reason: "Cycle count adjustment (retry)",
        idempotencyKey,
      });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/idempotency/i);

    // Stock should only have been adjusted once: 50 + 5 = 55
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(55);
  });

  it("atomically transfers stock between warehouses and prevents negative stock", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 50,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    // Valid transfer of 20 units from WH-A to WH-B
    const transferRes = await request(app)
      .post("/api/v1/inventory/transfer")
      .set("Cookie", managerCookie)
      .send({
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        batchId: batch.id,
        quantity: 20,
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.data.transferOutId).toBeDefined();
    expect(transferRes.body.data.transferInId).toBeDefined();

    // WH-A balance: 50 - 20 = 30
    const balA = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balA.body.data.availableQuantity).toBe(30);

    // WH-B balance: 0 + 20 = 20
    const balB = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseB.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balB.body.data.availableQuantity).toBe(20);

    // Attempting to transfer 35 units from WH-A (only 30 available) must be rejected
    const overTransfer = await request(app)
      .post("/api/v1/inventory/transfer")
      .set("Cookie", managerCookie)
      .send({
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        batchId: batch.id,
        quantity: 35,
      });

    expect(overTransfer.status).toBe(400);
    expect(overTransfer.body.error.message).toMatch(/insufficient stock/i);
  });

  it("demonstrates concurrency safety under race condition", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    // Seed exactly 10 units in Warehouse A
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 10,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    // Fire 2 concurrent transfers of 7 units each simultaneously
    // Total requested = 14, but only 10 available.
    // Under row locking (SELECT ... FOR UPDATE), one MUST succeed (201) and one MUST fail (400).
    const req1 = request(app)
      .post("/api/v1/inventory/transfer")
      .set("Cookie", adminCookie)
      .send({
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        batchId: batch.id,
        quantity: 7,
      });

    const req2 = request(app)
      .post("/api/v1/inventory/transfer")
      .set("Cookie", managerCookie)
      .send({
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        batchId: batch.id,
        quantity: 7,
      });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    // Available in WH-A must be exactly 10 - 7 = 3 (NEVER negative!)
    const balA = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseA.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balA.body.data.availableQuantity).toBe(3);

    // Available in WH-B must be exactly 7
    const balB = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseB.id}/${batch.id}`)
      .set("Cookie", adminCookie);
    expect(balB.body.data.availableQuantity).toBe(7);
  });

  it("enforces RBAC on stock modifications", async () => {
    // OPERATOR cannot adjust stock
    const adjustRes = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId: warehouseA.id,
        batchId: batch.id,
        quantity: 5,
        reason: "Unauthorized adjustment attempt",
      });
    expect(adjustRes.status).toBe(403);

    // OPERATOR cannot transfer stock
    const transferRes = await request(app)
      .post("/api/v1/inventory/transfer")
      .set("Cookie", operatorCookie)
      .send({
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        batchId: batch.id,
        quantity: 5,
      });
    expect(transferRes.status).toBe(403);
  });

  it("supports inventory search, category filtering, and movement audit listing", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 42,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    // Filter inventory by warehouse
    const invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseA.id}`)
      .set("Cookie", adminCookie);

    expect(invRes.status).toBe(200);
    expect(invRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(invRes.body.data[0].availableQuantity).toBe(42);
    expect(invRes.body.data[0].productSku).toBe("DAI-MILK-100");

    // List movements
    const moveRes = await request(app)
      .get(`/api/v1/inventory/movements?warehouseId=${warehouseA.id}`)
      .set("Cookie", adminCookie);

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(moveRes.body.data[0].movementType).toBe("RECEIPT");
  });

  it("returns a warehouse-scoped inventory summary without errors", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouseA.id,
        batchId: batch.id,
        movementType: "RECEIPT",
        quantity: 7,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/v1/inventory/summary?warehouseId=${warehouseA.id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.totalItems).toBe(1); // batch scoped via its movements
    expect(res.body.data.totalMovements).toBe(1);
    expect(res.body.data.expiredBatches).toBe(0);

    // Unscoped summary also works and includes the batch.
    const all = await request(app)
      .get("/api/v1/inventory/summary")
      .set("Cookie", adminCookie);
    expect(all.status).toBe(200);
    expect(all.body.data.totalItems).toBe(1);
  });
});

