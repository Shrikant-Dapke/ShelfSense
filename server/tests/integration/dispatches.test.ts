import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

let warehouse: { id: string; name: string; code: string };
let productA: { id: string; name: string; sku: string };
let productB: { id: string; name: string; sku: string };
let activeBatchA: { id: string; canonicalCode: string };
let activeBatchB: { id: string; canonicalCode: string };

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

  warehouse = await prisma.warehouse.create({
    data: { name: "Central Fulfillment Hub", code: "WH-FULFILL", location: "Bay 4" },
  });

  productA = await prisma.product.create({
    data: { name: "Greek Yogurt 1kg", sku: "YOG-1KG-001", category: "Dairy", unit: "kg" },
  });

  productB = await prisma.product.create({
    data: { name: "Cheddar Cheese 500g", sku: "CHS-500G-002", category: "Dairy", unit: "pack" },
  });

  // Create active non-expired batch for product A (expires in 20 days)
  const expA = new Date(Date.now() + 20 * 24 * 3600 * 1000);
  activeBatchA = await prisma.batch.create({
    data: {
      productId: productA.id,
      canonicalCode: "BATCH-YOG-2026-01",
      expiryDate: expA,
      status: "ACTIVE",
    },
  });

  // Create active non-expired batch for product B (expires in 45 days)
  const expB = new Date(Date.now() + 45 * 24 * 3600 * 1000);
  activeBatchB = await prisma.batch.create({
    data: {
      productId: productB.id,
      canonicalCode: "BATCH-CHS-2026-01",
      expiryDate: expB,
      status: "ACTIVE",
    },
  });
});

describe("Dispatch Management Integration Tests", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/dispatches");
    expect(res.status).toBe(401);
  });

  it("successfully creates a dispatch, books DISPATCH stock movements, and decreases available stock", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    // Seed stock movement (100 units received in warehouse)
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: activeBatchA.id,
        movementType: "RECEIPT",
        quantity: 100,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "SO-DISP-1001",
        items: [
          {
            productId: productA.id,
            batchId: activeBatchA.id,
            quantity: 35,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.referenceNo).toBe("SO-DISP-1001");
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(35);

    // Verify DISPATCH movement in database
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id, batchId: activeBatchA.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(movements).toHaveLength(2);
    expect(movements[1].movementType).toBe("DISPATCH");
    expect(Number(movements[1].quantity)).toBe(35);

    // Verify ledger balance: 100 - 35 = 65
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchA.id}`)
      .set("Cookie", operatorCookie);
    expect(balRes.body.data.availableQuantity).toBe(65);
  });

  it("atomically handles multi-item dispatches", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    // Seed stock for both products
    await prisma.stockMovement.createMany({
      data: [
        {
          warehouseId: warehouse.id,
          batchId: activeBatchA.id,
          movementType: "RECEIPT",
          quantity: 50,
          createdBy: adminUser.id,
          occurredAt: new Date(),
        },
        {
          warehouseId: warehouse.id,
          batchId: activeBatchB.id,
          movementType: "RECEIPT",
          quantity: 40,
          createdBy: adminUser.id,
          occurredAt: new Date(),
        },
      ],
    });

    const res = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "MULTI-OUT-99",
        items: [
          { productId: productA.id, batchId: activeBatchA.id, quantity: 15 },
          { productId: productB.id, batchId: activeBatchB.id, quantity: 20 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(2);

    // Verify balances
    const balA = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchA.id}`)
      .set("Cookie", adminCookie);
    expect(balA.body.data.availableQuantity).toBe(35); // 50 - 15

    const balB = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchB.id}`)
      .set("Cookie", adminCookie);
    expect(balB.body.data.availableQuantity).toBe(20); // 40 - 20
  });

  it("strictly prevents dispatching expired stock", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    // Create an expired batch (expired 2 days ago)
    const pastDate = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    const expiredBatch = await prisma.batch.create({
      data: {
        productId: productA.id,
        canonicalCode: "EXPIRED-LOT-X",
        expiryDate: pastDate,
        status: "ACTIVE",
      },
    });

    // Seed movements
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: expiredBatch.id,
        movementType: "RECEIPT",
        quantity: 50,
        createdBy: adminUser.id,
        occurredAt: pastDate,
      },
    });

    const res = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "EXP-DISP-TRY",
        items: [{ productId: productA.id, batchId: expiredBatch.id, quantity: 10 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/expired/i);

    // Verify stock was not deducted
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${expiredBatch.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(50);
  });

  it("strictly prevents dispatching quarantined or non-active stock", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    const futureDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const quarantinedBatch = await prisma.batch.create({
      data: {
        productId: productA.id,
        canonicalCode: "QUARANTINE-LOT-Q",
        expiryDate: futureDate,
        status: "QUARANTINED", // Not active
      },
    });

    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: quarantinedBatch.id,
        movementType: "RECEIPT",
        quantity: 80,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId: quarantinedBatch.id, quantity: 20 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not active|quarantine/i);
  });

  it("prevents negative stock when dispatch request exceeds available balance", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: activeBatchA.id,
        movementType: "RECEIPT",
        quantity: 25,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const res = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId: activeBatchA.id, quantity: 30 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/insufficient stock/i);
  });

  it("demonstrates concurrency safety under simultaneous dispatch requests", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    // Seed exactly 10 units
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: activeBatchA.id,
        movementType: "RECEIPT",
        quantity: 10,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    // Send two concurrent dispatches of 6 units each (total 12 requested, only 10 available)
    const req1 = request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "RACE-DISP-1",
        items: [{ productId: productA.id, batchId: activeBatchA.id, quantity: 6 }],
      });

    const req2 = request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "RACE-DISP-2",
        items: [{ productId: productA.id, batchId: activeBatchA.id, quantity: 6 }],
      });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one succeeds, one fails
    expect(statuses).toEqual([201, 400]);

    // Available stock must be exactly 10 - 6 = 4, NEVER negative
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(4);
  });

  it("completes two multi-item dispatches sharing batches in opposite item order without deadlock", async () => {
    // Sorted lock ordering regression: dispatch 1 lists [batchA, batchB]
    // while dispatch 2 lists the same batches swapped. Without deterministic
    // pre-locking each transaction could hold its first batch row and wait on
    // the other's, deadlocking the two transactions. With sorted pre-lock
    // they serialize and both succeed.
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    for (const batch of [activeBatchA, activeBatchB]) {
      await prisma.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          batchId: batch.id,
          movementType: "RECEIPT",
          quantity: 100,
          createdBy: adminUser.id,
          occurredAt: new Date(),
        },
      });
    }

    const req1 = request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "DEADLOCK-DISP-1",
        items: [
          { productId: productA.id, batchId: activeBatchA.id, quantity: 20 },
          { productId: productB.id, batchId: activeBatchB.id, quantity: 30 },
        ],
      });

    const req2 = request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "DEADLOCK-DISP-2",
        items: [
          { productId: productB.id, batchId: activeBatchB.id, quantity: 25 },
          { productId: productA.id, batchId: activeBatchA.id, quantity: 10 },
        ],
      });

    const [res1, res2] = await Promise.allSettled([req1, req2]);
    const status1 = res1.status === "fulfilled" ? res1.value.status : 500;
    const status2 = res2.status === "fulfilled" ? res2.value.status : 500;
    // Both dispatches must complete; a 500 here means a deadlock/serialization failure.
    expect(status1).toBe(201);
    expect(status2).toBe(201);

    // Ledger reconciles: 100 - 20 - 10 = 70 for batch A, 100 - 30 - 25 = 45 for batch B.
    const balA = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchA.id}`)
      .set("Cookie", adminCookie);
    const balB = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchB.id}`)
      .set("Cookie", adminCookie);
    expect(balA.body.data.availableQuantity).toBe(70);
    expect(balB.body.data.availableQuantity).toBe(45);

    // Exactly four DISPATCH movements were booked (2 per dispatch).
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id, movementType: "DISPATCH" },
    });
    expect(movements).toHaveLength(4);
  });

  it("enforces dispatch idempotency and rejects duplicates with 409", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: activeBatchA.id,
        movementType: "RECEIPT",
        quantity: 100,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const idempotencyKey = "7a4e9b1c-3d2f-4e5a-8b9c-0d1e2f3a4b5c";

    const payload = {
      warehouseId: warehouse.id,
      referenceNo: "IDEMP-DISP-01",
      idempotencyKey,
      items: [{ productId: productA.id, batchId: activeBatchA.id, quantity: 20 }],
    };

    const first = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", adminCookie)
      .send(payload);
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", adminCookie)
      .send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toMatch(/idempotency/i);

    // Only 20 units deducted, not 40
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${activeBatchA.id}`)
      .set("Cookie", adminCookie);
    expect(balRes.body.data.availableQuantity).toBe(80);
  });

  it("supports pagination and retrieval by ID", async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: activeBatchA.id,
        movementType: "RECEIPT",
        quantity: 50,
        createdBy: adminUser.id,
        occurredAt: new Date(),
      },
    });

    const created = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId: warehouse.id,
        referenceNo: "PAGE-DISP-001",
        items: [{ productId: productA.id, batchId: activeBatchA.id, quantity: 10 }],
      });
    expect(created.status).toBe(201);
    const dispatchId = created.body.data.id;

    // Get by ID
    const getRes = await request(app)
      .get(`/api/v1/dispatches/${dispatchId}`)
      .set("Cookie", operatorCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(dispatchId);
    expect(getRes.body.data.items[0].quantity).toBe(10);

    // List dispatches
    const listRes = await request(app)
      .get(`/api/v1/dispatches?warehouseId=${warehouse.id}`)
      .set("Cookie", operatorCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});
