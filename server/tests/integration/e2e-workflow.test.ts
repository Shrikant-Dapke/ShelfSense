import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

/**
 * Milestone 2 end-to-end regression: one continuous journey through every
 * completed module against the real test database (no mocks). Final balances
 * must reconcile with the immutable movement ledger.
 */

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

const futureExpiry = () => new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

function csv(rows: string[]): Buffer {
  return Buffer.from(rows.join("\r\n"), "utf8");
}

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  managerCookie = await loginAs("manager");
  operatorCookie = await loginAs("operator");
});

beforeEach(async () => {
  // Keep test users; wipe operational data.
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
  await prisma.importJob.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
});

describe("Milestone 2 end-to-end workflow", () => {
  it("walks login/RBAC -> product+warehouse -> receipt -> alias -> inventory -> dispatch -> stock count post -> import -> ledger reconciliation", async () => {
    // ---------- 1. Login and role-based access ----------
    for (const cookie of [adminCookie, managerCookie, operatorCookie]) {
      const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
      expect(me.status).toBe(200);
    }

    // ---------- 2. Create product and warehouse (RBAC-checked) ----------
    const opWarehouse = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", operatorCookie)
      .send({ name: "Operator Store", code: "OP-WH" });
    expect(opWarehouse.status).toBe(403); // OPERATOR cannot create warehouses

    const whRes = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", adminCookie)
      .send({ name: "E2E Central", code: "E2E-WH-1", location: "Dock A" });
    expect(whRes.status).toBe(201);
    const warehouseId = whRes.body.data.id as string;

    const opProduct = await request(app)
      .post("/api/v1/products")
      .set("Cookie", operatorCookie)
      .send({ name: "Nope", sku: "NOPE-1", category: "X", unit: "L" });
    expect(opProduct.status).toBe(403); // OPERATOR cannot create products

    const prodRes = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send({ name: "E2E Juice 1L", sku: "E2E-JUICE-01", category: "Beverages", unit: "L" });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id as string;

    // ---------- 3. Receive inventory (manager) ----------
    const receiptRes = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId,
        supplierName: "E2E Beverages Ltd",
        referenceNo: "E2E-GRN-1",
        items: [
          { productId, canonicalCode: "E2E-LOT-1", expiryDate: futureExpiry(), quantity: 100, unitCost: 1.25 },
        ],
      });
    expect(receiptRes.status).toBe(201);
    const batchId = receiptRes.body.data.items[0].batchId as string;
    expect(batchId).toBeTruthy();

    // ---------- 4. Create and manage a batch alias (admin) ----------
    const aliasRes = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", adminCookie)
      .send({ warehouseId, externalCode: "SUPPLIER-CODE-77", source: "MANUAL" });
    expect(aliasRes.status).toBe(201);

    const aliasList = await request(app)
      .get(`/api/v1/batches/${batchId}`)
      .set("Cookie", operatorCookie);
    expect(aliasList.status).toBe(200);
    expect(aliasList.body.data.aliases).toHaveLength(1);
    expect(aliasList.body.data.aliases[0].externalCode).toBe("SUPPLIER-CODE-77");

    // ---------- 5. Inspect ledger-derived inventory ----------
    let invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}`)
      .set("Cookie", operatorCookie);
    expect(invRes.status).toBe(200);
    expect(invRes.body.data).toHaveLength(1);
    expect(invRes.body.data[0].availableQuantity).toBe(100);
    expect(invRes.body.data[0].canonicalCode).toBe("E2E-LOT-1");

    // ---------- 6. Dispatch stock (operator may dispatch) ----------
    const dispRes = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId,
        referenceNo: "E2E-OUT-1",
        items: [{ productId, batchId, canonicalCode: "E2E-LOT-1", quantity: 30 }],
      });
    expect(dispRes.status).toBe(201);

    invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}`)
      .set("Cookie", operatorCookie);
    expect(invRes.body.data[0].availableQuantity).toBe(70);

    // Over-dispatch must be refused and must not change the balance.
    const overRes = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId,
        referenceNo: "E2E-OUT-BAD",
        items: [{ productId, batchId, canonicalCode: "E2E-LOT-1", quantity: 999 }],
      });
    expect(overRes.status).toBe(400);
    invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}`)
      .set("Cookie", operatorCookie);
    expect(invRes.body.data[0].availableQuantity).toBe(70);

    // ---------- 7. Stock count lifecycle: draft -> submit -> approve -> post ----------
    const draftRes = await request(app)
      .post("/api/v1/stock-counts")
      .set("Cookie", operatorCookie)
      .send({
        warehouseId,
        items: [{ productId, batchId, countedQuantity: 65 }],
      });
    expect(draftRes.status).toBe(201);
    const countId = draftRes.body.data.id as string;
    expect(draftRes.body.data.status).toBe("PENDING");

    // Draft must not affect inventory yet.
    invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}`)
      .set("Cookie", operatorCookie);
    expect(invRes.body.data[0].availableQuantity).toBe(70);

    const submitRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/submit`)
      .set("Cookie", operatorCookie);
    expect(submitRes.status).toBe(200);

    const approveRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/approve`)
      .set("Cookie", adminCookie);
    expect(approveRes.status).toBe(200);

    // OPERATOR cannot post; ADMIN/MANAGER can.
    const opPost = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", operatorCookie);
    expect(opPost.status).toBe(403);

    const postRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(postRes.status).toBe(200);

    invRes = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}`)
      .set("Cookie", operatorCookie);
    expect(invRes.body.data[0].availableQuantity).toBe(65);

    // ---------- 8. Upload, validate, and execute an inventory import ----------
    const uploadRes = await request(app)
      .post("/api/v1/imports/upload")
      .set("Cookie", adminCookie)
      .field("importType", "OPENING_STOCK")
      .field("warehouseId", warehouseId)
      .attach(
        "file",
        csv([
          "Product SKU,Batch Code,Expiry Date,Quantity,Unit Cost,Supplier",
          `E2E-JUICE-01,E2E-LOT-2,${futureExpiry()},20,1.10,Apex Supplies`,
        ]),
        { filename: "opening-stock.csv", contentType: "text/csv" },
      );
    expect(uploadRes.status).toBe(201);
    const jobId = uploadRes.body.data.id as string;

    const validateRes = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validateRes.status).toBe(200);

    const execRes = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execRes.status).toBe(200);
    expect(execRes.body.data.status).toBe("COMPLETED");

    // ---------- 9/10. Dashboard and inventory summaries reconcile ----------
    const summaryRes = await request(app)
      .get(`/api/v1/inventory/summary?warehouseId=${warehouseId}`)
      .set("Cookie", adminCookie);
    expect(summaryRes.status).toBe(200);
    const summary = summaryRes.body.data;
    // RECEIPT(100) + DISPATCH(30) + ADJUSTMENT(-5) + import RECEIPT(20) = 4 movements.
    expect(summary.totalMovements).toBe(4);
    expect(summary.totalItems).toBe(2); // two batches with stock in this warehouse

    // Ledger-derived balances match the journey arithmetic.
    const bal1 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseId}/${batchId}`)
      .set("Cookie", adminCookie);
    expect(bal1.status).toBe(200);
    expect(bal1.body.data.availableQuantity).toBe(65); // 100 - 30 - 5

    const lot2 = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseId}&search=E2E-LOT-2`)
      .set("Cookie", adminCookie);
    expect(lot2.status).toBe(200);
    const lot2Row = lot2.body.data.find(
      (r: { canonicalCode: string }) => r.canonicalCode === "E2E-LOT-2",
    );
    expect(lot2Row).toBeTruthy();
    const bal2 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouseId}/${lot2Row.batchId}`)
      .set("Cookie", adminCookie);
    expect(bal2.body.data.availableQuantity).toBe(20); // from the import receipt

    // The movement ledger itself is the source of truth: replay it.
    const movRes = await request(app)
      .get(`/api/v1/inventory/movements?warehouseId=${warehouseId}&pageSize=100&sortBy=occurredAt&sortOrder=asc`)
      .set("Cookie", adminCookie);
    expect(movRes.status).toBe(200);
    const movements = movRes.body.data as Array<{
      batchId: string;
      movementType: string;
      quantity: number;
    }>;
    expect(movements).toHaveLength(4);

    const balancesByBatch = new Map<string, number>();
    for (const m of movements) {
      const delta =
        m.movementType === "RECEIPT" || m.movementType === "TRANSFER_IN"
          ? m.quantity
          : m.movementType === "ADJUSTMENT"
            ? m.quantity // stored signed
            : -m.quantity;
      balancesByBatch.set(m.batchId, (balancesByBatch.get(m.batchId) ?? 0) + delta);
    }
    expect(balancesByBatch.get(batchId)).toBe(65);
    expect(balancesByBatch.get(lot2Row.batchId)).toBe(20);
  });
});
