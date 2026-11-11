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

const futureExpiry = () => new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

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
  await prisma.importJob.deleteMany();
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
});

/** Books a receipt and returns the batch id. */
async function receiveStock(
  cookie: string,
  warehouseId: string,
  product: { id: string },
  batchCode: string,
  quantity: number,
): Promise<string> {
  const res = await request(app)
    .post("/api/v1/receipts")
    .set("Cookie", cookie)
    .send({
      warehouseId,
      items: [{ productId: product.id, canonicalCode: batchCode, expiryDate: futureExpiry(), quantity }],
    });
  if (res.status !== 201) {
    throw new Error(`receiveStock failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const batch = await prisma.batch.findUnique({
    where: { productId_canonicalCode: { productId: product.id, canonicalCode: batchCode } },
  });
  return batch!.id;
}

/** Runs the full draft -> submitted -> approved workflow and returns the count id. */
async function approveCount(
  cookie: string,
  countId: string,
): Promise<void> {
  const submit = await request(app).post(`/api/v1/stock-counts/${countId}/submit`).set("Cookie", cookie);
  expect(submit.status).toBe(200);
  const approve = await request(app).post(`/api/v1/stock-counts/${countId}/approve`).set("Cookie", cookie);
  expect(approve.status).toBe(200);
}

/** Creates a stock count and returns its id. */
async function createCount(
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await request(app).post("/api/v1/stock-counts").set("Cookie", cookie).send(payload);
  return { status: res.status, body: res.body };
}

describe("Stock Count Management Integration Tests", () => {
  // ---------- Access control & RBAC ----------

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/stock-counts");
    expect(res.status).toBe(401);
  });

  it("enforces RBAC: OPERATOR can count and submit but cannot approve or post", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-RBAC", 100);

    const createRes = await createCount(operatorCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 100 }],
    });
    expect(createRes.status).toBe(201);
    const countId = createRes.body.data.id as string;

    // Operator can read details and update the draft
    const detailRes = await request(app)
      .get(`/api/v1/stock-counts/${countId}`)
      .set("Cookie", operatorCookie);
    expect(detailRes.status).toBe(200);

    const patchRes = await request(app)
      .patch(`/api/v1/stock-counts/${countId}`)
      .set("Cookie", operatorCookie)
      .send({ items: [{ productId: productA.id, batchId, countedQuantity: 99 }] });
    expect(patchRes.status).toBe(200);

    // Operator can submit...
    const submitRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/submit`)
      .set("Cookie", operatorCookie);
    expect(submitRes.status).toBe(200);

    // ...but not approve or post
    const approveRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/approve`)
      .set("Cookie", operatorCookie);
    expect(approveRes.status).toBe(403);

    // Submit a second fresh count and try posting as operator
    const count2 = await createCount(operatorCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 100 }],
    });
    const count2Id = count2.body.data.id as string;
    await approveCount(managerCookie, count2Id);
    const postRes = await request(app)
      .post(`/api/v1/stock-counts/${count2Id}/post`)
      .set("Cookie", operatorCookie);
    expect(postRes.status).toBe(403);
  });

  // ---------- Creation ----------

  it("creates a stock count with ledger-derived expected quantities", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-CREATE", 150);

    const { status, body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      referenceNo: "COUNT-2026-001",
      description: "Monthly cycle count",
      items: [{ productId: productA.id, batchId, countedQuantity: 150 }],
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("PENDING");
    expect(body.data.referenceNo).toBe("COUNT-2026-001");
    expect(body.data.warehouseCode).toBe("WH-COLD-1");
    expect(body.data.items).toHaveLength(1);
    // Expected comes from the immutable ledger, not any stored quantity
    expect(body.data.items[0].expectedQuantity).toBe(150);
    expect(body.data.items[0].countedQuantity).toBe(150);
    expect(body.data.items[0].variance).toBe(0);
    expect(body.data.countedByName).toBe("Test Manager");

    const dbCount = await prisma.stockCount.findUnique({
      where: { id: body.data.id },
      include: { items: true },
    });
    expect(dbCount?.status).toBe("PENDING");
    expect(Number(dbCount?.items[0]?.expectedQuantity)).toBe(150);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "stock_count", entityId: body.data.id },
    });
    expect(audit?.action).toBe("stockcount.created");
  });

  it("creates a multi-item count across products and batches", async () => {
    const batchA = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-A", 100);
    const batchB = await receiveStock(managerCookie, warehouse.id, productB, "LOT-SC-B", 40);

    const { status, body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batchA, countedQuantity: 97 },
        { productId: productB.id, batchId: batchB, countedQuantity: 45 },
      ],
    });

    expect(status).toBe(201);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].expectedQuantity).toBe(100);
    expect(body.data.items[0].variance).toBe(-3);
    expect(body.data.items[1].expectedQuantity).toBe(40);
    expect(body.data.items[1].variance).toBe(5);
    expect(body.data.totalVariance).toBe(2);
  });

  it("derives expected quantities per warehouse, not globally", async () => {
    // Batch has 100 units in WH1 and 25 units in WH2
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-WH", 100);
    const receipt2 = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse2.id,
        items: [{ productId: productA.id, batchId, canonicalCode: "LOT-SC-WH", expiryDate: futureExpiry(), quantity: 25 }],
      });
    expect(receipt2.status).toBe(201);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse2.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 25 }],
    });
    expect(body.data.items[0].expectedQuantity).toBe(25);
  });

  it("rejects invalid counted quantities and unknown references", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-VAL", 10);

    // Negative quantity
    const negative = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: -5 }],
    });
    expect(negative.status).toBe(422);

    // More than 4 decimal places
    const imprecise = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 1.00001 }],
    });
    expect(imprecise.status).toBe(422);

    // Unknown batch
    const noBatch = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId: "00000000-0000-4000-8000-000000000000", countedQuantity: 1 }],
    });
    expect(noBatch.status).toBe(400);

    // Product/batch mismatch
    const mismatch = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productB.id, batchId, countedQuantity: 1 }],
    });
    expect(mismatch.status).toBe(400);

    // Unknown warehouse
    const noWarehouse = await createCount(managerCookie, {
      warehouseId: "00000000-0000-4000-8000-000000000000",
      items: [{ productId: productA.id, batchId, countedQuantity: 1 }],
    });
    expect(noWarehouse.status).toBe(404);
  });

  it("rejects duplicate batch entries within one count", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DUP", 10);

    const { status } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId, countedQuantity: 10 },
        { productId: productA.id, batchId, countedQuantity: 9 },
      ],
    });
    expect(status).toBe(422);
  });

  it("computes positive, negative, and zero variances with decimal precision", async () => {
    const batch1 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-V1", 100);
    const batch2 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-V2", 100);
    const batch3 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-V3", 12.3456);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batch1, countedQuantity: 120 }, // +20 surplus
        { productId: productA.id, batchId: batch2, countedQuantity: 80 }, // -20 shortage
        { productId: productA.id, batchId: batch3, countedQuantity: 12.3457 }, // +0.0001 precision
      ],
    });

    expect(body.data.items[0].variance).toBe(20);
    expect(body.data.items[1].variance).toBe(-20);
    expect(body.data.items[2].variance).toBe(0.0001);
    expect(body.data.totalVariance).toBe(0.0001);
  });

  // ---------- Drafts never touch inventory ----------

  it("does not affect inventory while the count is a draft", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DRAFT", 150);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 90 }],
    });

    // No adjustment movements exist
    const movements = await prisma.stockMovement.findMany({
      where: { batchId, movementType: "ADJUSTMENT" },
    });
    expect(movements).toHaveLength(0);

    // Balance still 150
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchId}`)
      .set("Cookie", operatorCookie);
    expect(balRes.body.data.availableQuantity).toBe(150);
    expect(body.data.status).toBe("PENDING");
  });

  // ---------- Editing ----------

  it("updates a draft count and recomputes expected quantities and variances", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-EDIT", 100);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 100 }],
    });
    const countId = body.data.id as string;

    const patchRes = await request(app)
      .patch(`/api/v1/stock-counts/${countId}`)
      .set("Cookie", managerCookie)
      .send({
        description: "Corrected after recount",
        items: [{ productId: productA.id, batchId, countedQuantity: 95 }],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.description).toBe("Corrected after recount");
    expect(patchRes.body.data.items[0].countedQuantity).toBe(95);
    expect(patchRes.body.data.items[0].variance).toBe(-5);

    const dbItems = await prisma.stockCountItem.findMany({ where: { stockCountId: countId } });
    expect(dbItems).toHaveLength(1);
    expect(Number(dbItems[0].countedQuantity)).toBe(95);
  });

  it("rejects editing an approved or posted count", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-LOCK", 100);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 100 }],
    });
    const countId = body.data.id as string;
    await approveCount(managerCookie, countId);

    const patchRes = await request(app)
      .patch(`/api/v1/stock-counts/${countId}`)
      .set("Cookie", managerCookie)
      .send({ items: [{ productId: productA.id, batchId, countedQuantity: 50 }] });
    expect(patchRes.status).toBe(409);
  });

  // ---------- Submit / Approve workflow ----------

  it("submits a draft for review and audits it; double submit conflicts", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-SUB", 10);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 10 }],
    });
    const countId = body.data.id as string;

    const submitRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/submit`)
      .set("Cookie", managerCookie);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe("SUBMITTED");

    const doubleSubmit = await request(app)
      .post(`/api/v1/stock-counts/${countId}/submit`)
      .set("Cookie", managerCookie);
    expect(doubleSubmit.status).toBe(409);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "stock_count", entityId: countId, action: "stockcount.submitted" },
    });
    expect(audit).not.toBeNull();
  });

  it("approves a submitted count recording approver and time; rejects invalid transitions", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-APP", 10);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 10 }],
    });
    const countId = body.data.id as string;

    // Cannot approve a draft
    const earlyApprove = await request(app)
      .post(`/api/v1/stock-counts/${countId}/approve`)
      .set("Cookie", managerCookie);
    expect(earlyApprove.status).toBe(400);

    await request(app).post(`/api/v1/stock-counts/${countId}/submit`).set("Cookie", managerCookie);

    const approveRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/approve`)
      .set("Cookie", adminCookie);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("APPROVED");
    expect(approveRes.body.data.approvedByName).toBe("Test Admin");
    expect(approveRes.body.data.approvedAt).not.toBeNull();

    const doubleApprove = await request(app)
      .post(`/api/v1/stock-counts/${countId}/approve`)
      .set("Cookie", adminCookie);
    expect(doubleApprove.status).toBe(409);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "stock_count", entityId: countId, action: "stockcount.approved" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects posting a count that is not approved", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-POSTREQ", 10);

    const draft = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 9 }],
    });
    const draftPost = await request(app)
      .post(`/api/v1/stock-counts/${draft.body.data.id}/post`)
      .set("Cookie", managerCookie);
    expect(draftPost.status).toBe(400);

    await request(app).post(`/api/v1/stock-counts/${draft.body.data.id}/submit`).set("Cookie", managerCookie);
    const submittedPost = await request(app)
      .post(`/api/v1/stock-counts/${draft.body.data.id}/post`)
      .set("Cookie", managerCookie);
    expect(submittedPost.status).toBe(400);
  });

  // ---------- Posting ----------

  it("posts an approved count creating signed ADJUSTMENT movements atomically", async () => {
    const batch1 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-P1", 100);
    const batch2 = await receiveStock(managerCookie, warehouse.id, productB, "LOT-SC-P2", 40);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batch1, countedQuantity: 85 }, // -15
        { productId: productB.id, batchId: batch2, countedQuantity: 40 }, // 0 variance
      ],
    });
    const countId = body.data.id as string;
    await approveCount(managerCookie, countId);

    const postRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(postRes.status).toBe(200);
    expect(postRes.body.data.status).toBe("APPROVED");
    expect(postRes.body.data.postedAt).not.toBeNull();
    expect(postRes.body.data.postedByName).toBe("Test Admin");

    // Only ONE adjustment movement: zero-variance item must be skipped
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: countId, movementType: "ADJUSTMENT" },
      orderBy: { createdAt: "asc" },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].batchId).toBe(batch1);
    expect(Number(movements[0].quantity)).toBe(-15);
    expect(movements[0].idempotencyKey).toBe(`${countId}_adj_${postRes.body.data.items[0].id}`);

    // Ledger balances now equal the counted quantities
    const bal1 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batch1}`)
      .set("Cookie", operatorCookie);
    expect(bal1.body.data.availableQuantity).toBe(85);

    const bal2 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batch2}`)
      .set("Cookie", operatorCookie);
    expect(bal2.body.data.availableQuantity).toBe(40);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "stock_count", entityId: countId, action: "stockcount.posted" },
    });
    expect(audit).not.toBeNull();
  });

  it("recalculates expected balances under row locks at posting time", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-RECALC", 150);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 140 }],
    });
    const countId = body.data.id as string;

    // Approve, then ledger moves on (+50 receipt) before posting
    await approveCount(managerCookie, countId);
    const extraReceipt = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId, canonicalCode: "LOT-SC-RECALC", expiryDate: futureExpiry(), quantity: 50 }],
      });
    expect(extraReceipt.status).toBe(201);

    const postRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(postRes.status).toBe(200);

    // Item expectation was recalculated to 200 under lock; variance -60
    const item = await prisma.stockCountItem.findFirst({ where: { stockCountId: countId } });
    expect(Number(item?.expectedQuantity)).toBe(200);
    expect(Number(item?.variance)).toBe(-60);

    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: countId, movementType: "ADJUSTMENT" },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-60);

    // Final balance equals the counted quantity: 150 + 50 - 60 = 140
    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchId}`)
      .set("Cookie", operatorCookie);
    expect(balRes.body.data.availableQuantity).toBe(140);
  });

  it("prevents duplicate posting", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DUPPOST", 100);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 90 }],
    });
    const countId = body.data.id as string;
    await approveCount(managerCookie, countId);

    const firstPost = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(firstPost.status).toBe(200);

    const secondPost = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(secondPost.status).toBe(409);

    // No duplicate movements were created
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: countId, movementType: "ADJUSTMENT" },
    });
    expect(movements).toHaveLength(1);
  });

  it("serializes concurrent posting attempts so stock adjusts exactly once", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-RACE", 100);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 70 }],
    });
    const countId = body.data.id as string;
    await approveCount(managerCookie, countId);

    const [res1, res2] = await Promise.allSettled([
      request(app).post(`/api/v1/stock-counts/${countId}/post`).set("Cookie", adminCookie),
      request(app).post(`/api/v1/stock-counts/${countId}/post`).set("Cookie", managerCookie),
    ]);

    const statuses = [res1, res2].map((r) => (r.status === "fulfilled" ? r.value.status : 500));
    // Exactly one request wins; the other must not silently succeed
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    // Exactly one adjustment movement and the final balance is correct
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: countId, movementType: "ADJUSTMENT" },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-30);

    const balRes = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batchId}`)
      .set("Cookie", operatorCookie);
    expect(balRes.body.data.availableQuantity).toBe(70);
  });

  it("posts two counts sharing batches in opposite item order concurrently without deadlock", async () => {
    // Deterministic lock ordering regression: count 1 lists [batch1, batch2]
    // while count 2 lists the same batches swapped. Without sorted pre-locking
    // each posting could hold its first batch row and wait on the other's,
    // deadlocking the two transactions. With sorted pre-lock they serialize
    // and both succeed.
    const batch1 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DL-1", 100);
    const batch2 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DL-2", 100);

    // Counted quantities equal the expected ledger balances, so whichever
    // count posts first leaves zero variance and the outcome is deterministic.
    const create1 = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batch1, countedQuantity: 100 },
        { productId: productA.id, batchId: batch2, countedQuantity: 100 },
      ],
    });
    expect(create1.status).toBe(201);
    const count1Id = create1.body.data.id as string;

    const create2 = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batch2, countedQuantity: 100 },
        { productId: productA.id, batchId: batch1, countedQuantity: 100 },
      ],
    });
    expect(create2.status).toBe(201);
    const count2Id = create2.body.data.id as string;

    await approveCount(managerCookie, count1Id);
    await approveCount(managerCookie, count2Id);

    const [res1, res2] = await Promise.allSettled([
      request(app).post(`/api/v1/stock-counts/${count1Id}/post`).set("Cookie", adminCookie),
      request(app).post(`/api/v1/stock-counts/${count2Id}/post`).set("Cookie", managerCookie),
    ]);

    const status1 = res1.status === "fulfilled" ? res1.value.status : 500;
    const status2 = res2.status === "fulfilled" ? res2.value.status : 500;
    // Both counts must post; a 500 here means a deadlock/serialization failure.
    expect(status1).toBe(200);
    expect(status2).toBe(200);

    // Ledger reconciles: both batches keep their received balance.
    const bal1 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batch1}`)
      .set("Cookie", operatorCookie);
    const bal2 = await request(app)
      .get(`/api/v1/inventory/balance/${warehouse.id}/${batch2}`)
      .set("Cookie", operatorCookie);
    expect(bal1.body.data.availableQuantity).toBe(100);
    expect(bal2.body.data.availableQuantity).toBe(100);

    // Zero-variance postings write no adjustment movements.
    const adjustments = await prisma.stockMovement.findMany({
      where: { movementType: "ADJUSTMENT", referenceId: { in: [count1Id, count2Id] } },
    });
    expect(adjustments).toHaveLength(0);
  });

  it("rolls back the entire posting when any movement fails", async () => {
    const batch1 = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-ATOM-1", 100);
    await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-ATOM-2", 50);

    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [
        { productId: productA.id, batchId: batch1, countedQuantity: 90 },
        {
          productId: productA.id,
          batchId: (
            await prisma.batch.findUnique({
              where: { productId_canonicalCode: { productId: productA.id, canonicalCode: "LOT-SC-ATOM-2" } },
            })
          )!.id,
          countedQuantity: 45,
        },
      ],
    });
    const countId = body.data.id as string;
    const items = await prisma.stockCountItem.findMany({
      where: { stockCountId: countId },
      orderBy: { createdAt: "asc" },
    });

    await approveCount(managerCookie, countId);

    // Sabotage: pre-occupy the idempotency key of the FIRST item's adjustment so
    // the transaction fails mid-way (after the batch row lock).
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        batchId: batch1,
        movementType: "ADJUSTMENT",
        quantity: 1,
        createdBy: adminUserId,
        idempotencyKey: `${countId}_adj_${items[0].id}`,
        occurredAt: new Date(),
      },
    });

    const postRes = await request(app)
      .post(`/api/v1/stock-counts/${countId}/post`)
      .set("Cookie", adminCookie);
    expect(postRes.status).toBe(409);

    // Atomic rollback: no partial adjustments for the second item, not posted
    const secondItemMovements = await prisma.stockMovement.findMany({
      where: { batchId: items[1].batchId, referenceId: countId },
    });
    expect(secondItemMovements).toHaveLength(0);

    const count = await prisma.stockCount.findUnique({ where: { id: countId } });
    expect(count?.postedAt).toBeNull();
  });

  // ---------- Retrieval, pagination ----------

  it("returns paginated stock count history with filters", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-LIST", 10);
    for (let i = 1; i <= 3; i++) {
      const { body } = await createCount(managerCookie, {
        warehouseId: warehouse.id,
        referenceNo: `COUNT-LIST-00${i}`,
        items: [{ productId: productA.id, batchId, countedQuantity: 10 }],
      });
      if (i === 2) {
        await request(app).post(`/api/v1/stock-counts/${body.data.id}/submit`).set("Cookie", managerCookie);
      }
    }

    // Count in another warehouse should be excluded by the filter
    const batchId2 = await receiveStock(managerCookie, warehouse2.id, productA, "LOT-SC-LIST", 10);
    await createCount(managerCookie, {
      warehouseId: warehouse2.id,
      items: [{ productId: productA.id, batchId: batchId2, countedQuantity: 10 }],
    });

    const res = await request(app)
      .get(`/api/v1/stock-counts?warehouseId=${warehouse.id}&pageSize=2&page=2`)
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.totalPages).toBe(2);
    expect(res.body.data).toHaveLength(1);

    const byStatus = await request(app)
      .get("/api/v1/stock-counts?status=SUBMITTED")
      .set("Cookie", operatorCookie);
    expect(byStatus.body.meta.total).toBe(1);
    expect(byStatus.body.data[0].status).toBe("SUBMITTED");
  });

  it("retrieves a count by ID with item-level variances; 404 and 400 for bad IDs", async () => {
    const batchId = await receiveStock(managerCookie, warehouse.id, productA, "LOT-SC-DET", 10);
    const { body } = await createCount(managerCookie, {
      warehouseId: warehouse.id,
      items: [{ productId: productA.id, batchId, countedQuantity: 7 }],
    });
    const countId = body.data.id as string;

    const res = await request(app).get(`/api/v1/stock-counts/${countId}`).set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].variance).toBe(-3);
    expect(res.body.data.totalVariance).toBe(-3);

    const missing = await request(app)
      .get("/api/v1/stock-counts/00000000-0000-4000-8000-000000000000")
      .set("Cookie", operatorCookie);
    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .get("/api/v1/stock-counts/not-a-uuid")
      .set("Cookie", operatorCookie);
    expect(malformed.status).toBe(400);
  });
});
