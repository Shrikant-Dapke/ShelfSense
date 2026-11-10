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
    data: { name: "Central Cold Store", code: "WH-COLD-1", location: "Dock A" },
  });

  productA = await prisma.product.create({
    data: { name: "Pasteurized Milk 1L", sku: "MILK-PAST-01", category: "Dairy", unit: "L" },
  });

  productB = await prisma.product.create({
    data: { name: "Greek Yogurt 500g", sku: "YOG-GRK-01", category: "Dairy", unit: "kg" },
  });
});

describe("Receipt Management Integration Tests", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/receipts");
    expect(res.status).toBe(401);
  });

  it("creates a single-item receipt, creating a new canonical batch and RECEIPT movement", async () => {
    const expiry = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        supplierName: "Apex Dairies Ltd",
        referenceNo: "PO-2026-001",
        items: [
          {
            productId: productA.id,
            canonicalCode: "BATCH-APEX-101",
            expiryDate: expiry,
            quantity: 150,
            unitCost: 1.85,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.supplierName).toBe("Apex Dairies Ltd");
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(150);
    expect(res.body.data.items[0].unitCost).toBe(1.85);
    expect(res.body.data.items[0].canonicalCode).toBe("BATCH-APEX-101");

    // Verify batch was created in database
    const batch = await prisma.batch.findUnique({
      where: {
        productId_canonicalCode: {
          productId: productA.id,
          canonicalCode: "BATCH-APEX-101",
        },
      },
    });
    expect(batch).not.toBeNull();
    expect(batch?.canonicalCode).toBe("BATCH-APEX-101");

    // Verify stock movement was created
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id, batchId: batch!.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe("RECEIPT");
    expect(Number(movements[0].quantity)).toBe(150);

    // Verify inventory balance reflects the received stock
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batch!.id}`)
      .set("Cookie", operatorCookie);
    expect(balRes.status).toBe(200);
    expect(balRes.body.data.availableQuantity).toBe(150);
  });

  it("creates a multi-item receipt atomically across multiple products", async () => {
    const expiryA = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const expiryB = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", operatorCookie) // OPERATOR allowed by RBAC
      .send({
        warehouseId: warehouse.id,
        supplierName: "MegaFoods Distro",
        referenceNo: "MF-INVOICE-889",
        items: [
          {
            productId: productA.id,
            canonicalCode: "LOT-A-99",
            expiryDate: expiryA,
            quantity: 200,
            unitCost: 1.75,
          },
          {
            productId: productB.id,
            canonicalCode: "LOT-B-88",
            expiryDate: expiryB,
            quantity: 75,
            unitCost: 3.2,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(2);

    // Verify both batches were created and movements booked
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id },
    });
    expect(movements).toHaveLength(2);
    const totalReceived = movements.reduce((sum, m) => sum + Number(m.quantity), 0);
    expect(totalReceived).toBe(275);
  });

  it("associates with existing batch when receiving additional stock for an existing canonical code", async () => {
    // Pre-create batch
    const expiry = new Date(Date.now() + 15 * 24 * 3600 * 1000);
    const existingBatch = await prisma.batch.create({
      data: {
        productId: productA.id,
        canonicalCode: "EXISTING-BATCH-01",
        expiryDate: expiry,
      },
    });

    const res = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        supplierName: "Supplier One",
        items: [
          {
            productId: productA.id,
            canonicalCode: "EXISTING-BATCH-01",
            expiryDate: expiry.toISOString(),
            quantity: 80,
            unitCost: 1.9,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].batchId).toBe(existingBatch.id);

    // No duplicate batch record should exist
    const count = await prisma.batch.count({
      where: { productId: productA.id, canonicalCode: "EXISTING-BATCH-01" },
    });
    expect(count).toBe(1);
  });

  it("enforces receipt-level idempotency and rejects duplicates with 409", async () => {
    const expiry = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const idempotencyKey = "25fa4d52-7b19-4a0b-9df2-a9b0c2a71d88";

    const payload = {
      warehouseId: warehouse.id,
      supplierName: "Idempotent Dairy",
      referenceNo: "IDEMP-001",
      idempotencyKey,
      items: [
        {
          productId: productA.id,
          canonicalCode: "LOT-IDEMP-01",
          expiryDate: expiry,
          quantity: 120,
          unitCost: 2.0,
        },
      ],
    };

    const first = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", adminCookie)
      .send(payload);
    expect(first.status).toBe(201);

    // Re-submission of exact same receipt
    const duplicate = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", adminCookie)
      .send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toMatch(/idempotency/i);

    // Verify only 1 movement was generated (120 units total)
    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(120);
  });

  it("rolls back the entire transaction if any item is invalid", async () => {
    const expiry = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        supplierName: "Faulty Supplier",
        items: [
          {
            productId: productA.id,
            canonicalCode: "VALID-ITEM-LOT",
            expiryDate: expiry,
            quantity: 50,
          },
          {
            productId: "00000000-0000-0000-0000-000000000000", // Nonexistent product
            canonicalCode: "INVALID-ITEM-LOT",
            expiryDate: expiry,
            quantity: 50,
          },
        ],
      });

    expect(res.status).toBe(400);

    // Verify no receipts or movements were saved
    const receiptsCount = await prisma.receipt.count();
    expect(receiptsCount).toBe(0);

    const movementsCount = await prisma.stockMovement.count();
    expect(movementsCount).toBe(0);

    const batch = await prisma.batch.findFirst({
      where: { canonicalCode: "VALID-ITEM-LOT" },
    });
    expect(batch).toBeNull();
  });

  it("supports receipt pagination, retrieval by ID, and warehouse filtering", async () => {
    const expiry = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

    const created = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", adminCookie)
      .send({
        warehouseId: warehouse.id,
        supplierName: "Direct Farm Supplies",
        referenceNo: "FILTER-REC-1",
        items: [
          {
            productId: productA.id,
            canonicalCode: "PAGE-LOT-1",
            expiryDate: expiry,
            quantity: 30,
          },
        ],
      });
    expect(created.status).toBe(201);
    const receiptId = created.body.data.id;

    // Get receipt by ID
    const getRes = await request(app)
      .get(`/api/v1/receipts/${receiptId}`)
      .set("Cookie", operatorCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(receiptId);
    expect(getRes.body.data.supplierName).toBe("Direct Farm Supplies");
    expect(getRes.body.data.items).toHaveLength(1);

    // List receipts with warehouse filter
    const listRes = await request(app)
      .get(`/api/v1/receipts?warehouseId=${warehouse.id}`)
      .set("Cookie", operatorCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});
