import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

let warehouse: { id: string; name: string; code: string };
let warehouse2: { id: string; name: string; code: string };
let productA: { id: string; name: string; sku: string };
let productB: { id: string; name: string; sku: string };

const futureExpiry = () => new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
const pastExpiry = () => new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

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

/** Creates a batch through the API and returns its id. */
async function createBatch(
  cookie: string,
  overrides: Partial<Record<string, unknown>> = {},
  product = productA,
): Promise<string> {
  const res = await request(app)
    .post("/api/v1/batches")
    .set("Cookie", cookie)
    .send({
      productId: product.id,
      canonicalCode: "LOT-MILK-001",
      expiryDate: futureExpiry(),
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(`createBatch helper failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.id as string;
}

describe("Batch Management Integration Tests", () => {
  // ---------- Access control ----------

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/batches");
    expect(res.status).toBe(401);
  });

  it("enforces RBAC: OPERATOR can read but not create, update, or add aliases", async () => {
    const listRes = await request(app).get("/api/v1/batches").set("Cookie", operatorCookie);
    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", operatorCookie)
      .send({
        productId: productA.id,
        canonicalCode: "LOT-RBAC-1",
        expiryDate: futureExpiry(),
      });
    expect(createRes.status).toBe(403);

    const batchId = await createBatch(managerCookie);
    const updateRes = await request(app)
      .patch(`/api/v1/batches/${batchId}`)
      .set("Cookie", operatorCookie)
      .send({ status: "QUARANTINED" });
    expect(updateRes.status).toBe(403);

    const aliasRes = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", operatorCookie)
      .send({ warehouseId: warehouse.id, externalCode: "EXT-RBAC-1" });
    expect(aliasRes.status).toBe(403);
  });

  it("enforces RBAC: MANAGER can create, update, and add aliases", async () => {
    const batchId = await createBatch(managerCookie);
    expect(batchId).toBeDefined();

    const aliasRes = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "SUP-LOT-001" });
    expect(aliasRes.status).toBe(201);
  });

  // ---------- Validation ----------

  it("rejects invalid create payloads", async () => {
    // Missing required fields
    const missing = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({ productId: productA.id });
    expect(missing.status).toBe(422);

    // Invalid product UUID
    const badUuid = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({
        productId: "not-a-uuid",
        canonicalCode: "LOT-X",
        expiryDate: futureExpiry(),
      });
    expect(badUuid.status).toBe(422);

    // Non-ISO expiry date
    const badDate = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({
        productId: productA.id,
        canonicalCode: "LOT-X",
        expiryDate: "next tuesday",
      });
    expect(badDate.status).toBe(422);

    // Invalid status value
    const badStatus = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({
        productId: productA.id,
        canonicalCode: "LOT-X",
        expiryDate: futureExpiry(),
        status: "SUSPENDED",
      });
    expect(badStatus.status).toBe(422);
  });

  it("returns 400 for malformed batch IDs", async () => {
    const res = await request(app).get("/api/v1/batches/not-a-uuid").set("Cookie", operatorCookie);
    expect(res.status).toBe(400);
  });

  // ---------- Canonical batch creation ----------

  it("creates a canonical batch and persists it", async () => {
    const res = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", adminCookie)
      .send({
        productId: productA.id,
        canonicalCode: "LOT-APEX-2026-0417",
        manufacturingDate: new Date("2026-04-10T00:00:00.000Z").toISOString(),
        expiryDate: futureExpiry(),
        supplierName: "Apex Dairies Ltd",
        status: "ACTIVE",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.canonicalCode).toBe("LOT-APEX-2026-0417");
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.supplierName).toBe("Apex Dairies Ltd");
    expect(res.body.data.productName).toBe("Pasteurized Milk 1L");

    const batch = await prisma.batch.findUnique({
      where: {
        productId_canonicalCode: {
          productId: productA.id,
          canonicalCode: "LOT-APEX-2026-0417",
        },
      },
    });
    expect(batch).not.toBeNull();

    // Creation is audited
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "batch", entityId: res.body.data.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.action).toBe("batch.created");
  });

  it("rejects a duplicate canonical code for the same product with 409", async () => {
    await createBatch(managerCookie, { canonicalCode: "LOT-DUP-001" });

    const res = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({
        productId: productA.id,
        canonicalCode: "LOT-DUP-001",
        expiryDate: futureExpiry(),
      });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("allows the same canonical code for a different product", async () => {
    await createBatch(managerCookie, { canonicalCode: "LOT-SHARED-001" });
    const res = await request(app)
      .post("/api/v1/batches")
      .set("Cookie", managerCookie)
      .send({
        productId: productB.id,
        canonicalCode: "LOT-SHARED-001",
        expiryDate: futureExpiry(),
      });
    expect(res.status).toBe(201);
  });

  // ---------- Retrieval & ledger-derived stock ----------

  it("retrieves a batch by ID with a ledger-derived stock balance", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-LEDGER-001" });

    // Book a receipt of 120 units into the warehouse
    const receiptRes = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId, canonicalCode: "LOT-LEDGER-001", expiryDate: futureExpiry(), quantity: 120 }],
      });
    expect(receiptRes.status).toBe(201);

    // Dispatch 20 units out
    const dispatchRes = await request(app)
      .post("/api/v1/dispatches")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId, quantity: 20 }],
      });
    expect(dispatchRes.status).toBe(201);

    const res = await request(app)
      .get(`/api/v1/batches/${batchId}`)
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.canonicalCode).toBe("LOT-LEDGER-001");
    // Balance comes from the immutable StockMovement ledger: 120 received - 20 dispatched
    expect(res.body.data.totalAvailableStock).toBe(100);
    expect(res.body.data.warehouses).toHaveLength(1);
    expect(res.body.data.warehouses[0].warehouseId).toBe(warehouse.id);
    expect(res.body.data.warehouses[0].availableQuantity).toBe(100);
    expect(res.body.data.daysToExpiry).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown batch", async () => {
    const res = await request(app)
      .get("/api/v1/batches/00000000-0000-4000-8000-000000000000")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(404);
  });

  // ---------- Listing, filtering, pagination, search ----------

  it("returns a paginated batch listing", async () => {
    for (let i = 1; i <= 5; i++) {
      await createBatch(managerCookie, { canonicalCode: `LOT-PAGE-00${i}` });
    }

    const res = await request(app)
      .get("/api/v1/batches?page=2&pageSize=2")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
    expect(res.body.meta.totalPages).toBe(3);
    expect(res.body.meta.page).toBe(2);
  });

  it("filters batches by product", async () => {
    await createBatch(managerCookie, { canonicalCode: "LOT-PA-001" });
    await createBatch(managerCookie, { canonicalCode: "LOT-PB-001" }, productB);

    const res = await request(app)
      .get(`/api/v1/batches?productId=${productB.id}`)
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].canonicalCode).toBe("LOT-PB-001");
    expect(res.body.data[0].productName).toBe("Greek Yogurt 500g");
  });

  it("filters batches by warehouse (movements or aliases)", async () => {
    // Batch with a stock movement in warehouse 1
    const movementBatchId = await createBatch(managerCookie, { canonicalCode: "LOT-WH-MOVE" });
    const receiptRes = await request(app)
      .post("/api/v1/receipts")
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        items: [{ productId: productA.id, batchId: movementBatchId, canonicalCode: "LOT-WH-MOVE", expiryDate: futureExpiry(), quantity: 10 }],
      });
    expect(receiptRes.status).toBe(201);

    // Batch with only an alias in warehouse 1
    const aliasBatchId = await createBatch(managerCookie, { canonicalCode: "LOT-WH-ALIAS" });
    const aliasRes = await request(app)
      .post(`/api/v1/batches/${aliasBatchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "SUP-WH-ALIAS" });
    expect(aliasRes.status).toBe(201);

    // Batch with neither
    await createBatch(managerCookie, { canonicalCode: "LOT-WH-NONE" });

    const res = await request(app)
      .get(`/api/v1/batches?warehouseId=${warehouse.id}`)
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const codes = res.body.data.map((b: { canonicalCode: string }) => b.canonicalCode);
    expect(codes).toContain("LOT-WH-MOVE");
    expect(codes).toContain("LOT-WH-ALIAS");
    expect(codes).not.toContain("LOT-WH-NONE");
  });

  it("filters batches by status", async () => {
    await createBatch(managerCookie, { canonicalCode: "LOT-ST-ACTIVE", status: "ACTIVE" });
    await createBatch(managerCookie, { canonicalCode: "LOT-ST-QUAR", status: "QUARANTINED" });

    const res = await request(app)
      .get("/api/v1/batches?status=QUARANTINED")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].canonicalCode).toBe("LOT-ST-QUAR");
  });

  it("filters batches by expiry status", async () => {
    await createBatch(managerCookie, { canonicalCode: "LOT-EXP-FUTURE" });
    await createBatch(managerCookie, { canonicalCode: "LOT-EXP-PAST", expiryDate: pastExpiry() });

    const res = await request(app)
      .get("/api/v1/batches?expiryStatus=EXPIRED")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].canonicalCode).toBe("LOT-EXP-PAST");
    expect(res.body.data[0].expiryStatus).toBe("EXPIRED");
    expect(res.body.data[0].daysToExpiry).toBeLessThanOrEqual(0);
  });

  it("searches batches by canonical code, product name, and alias code", async () => {
    const aliasBatchId = await createBatch(managerCookie, { canonicalCode: "LOT-SEARCH-ME" });
    await createBatch(managerCookie, { canonicalCode: "LOT-OTHER-1" }, productB);
    await request(app)
      .post(`/api/v1/batches/${aliasBatchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "SUPPLIER-CODE-777" });

    // By canonical code
    const byCode = await request(app)
      .get("/api/v1/batches?search=SEARCH-ME")
      .set("Cookie", operatorCookie);
    expect(byCode.status).toBe(200);
    expect(byCode.body.meta.total).toBe(1);

    // By product name (case-insensitive)
    const byProduct = await request(app)
      .get("/api/v1/batches?search=greek yogurt")
      .set("Cookie", operatorCookie);
    expect(byProduct.status).toBe(200);
    expect(byProduct.body.meta.total).toBe(1);
    expect(byProduct.body.data[0].canonicalCode).toBe("LOT-OTHER-1");

    // By alias external code
    const byAlias = await request(app)
      .get("/api/v1/batches?search=SUPPLIER-CODE-777")
      .set("Cookie", operatorCookie);
    expect(byAlias.status).toBe(200);
    expect(byAlias.body.meta.total).toBe(1);
    expect(byAlias.body.data[0].canonicalCode).toBe("LOT-SEARCH-ME");
  });

  // ---------- Batch status updates ----------

  it("updates batch status and audits the change", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-STATUS-001" });

    const res = await request(app)
      .patch(`/api/v1/batches/${batchId}`)
      .set("Cookie", adminCookie)
      .send({ status: "QUARANTINED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("QUARANTINED");

    const updated = await prisma.batch.findUnique({ where: { id: batchId } });
    expect(updated?.status).toBe("QUARANTINED");

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "batch", entityId: batchId },
    });
    const updateAudit = audits.find((a) => a.action === "batch.updated");
    expect(updateAudit).not.toBeNull();
    const meta = updateAudit?.metadata as { previousStatus: string; newStatus: string };
    expect(meta.previousStatus).toBe("ACTIVE");
    expect(meta.newStatus).toBe("QUARANTINED");
  });

  it("rejects invalid status updates", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-STATUS-002" });

    const res = await request(app)
      .patch(`/api/v1/batches/${batchId}`)
      .set("Cookie", managerCookie)
      .send({ status: "ARCHIVED" });
    expect(res.status).toBe(422);
  });

  it("returns 404 when updating an unknown batch", async () => {
    const res = await request(app)
      .patch("/api/v1/batches/00000000-0000-4000-8000-000000000000")
      .set("Cookie", managerCookie)
      .send({ status: "RECALLED" });
    expect(res.status).toBe(404);
  });

  // ---------- Alias management ----------

  it("creates a warehouse alias preserving the original external code", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-ALIAS-001" });

    const res = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({
        warehouseId: warehouse.id,
        externalCode: "  lot 2026/01  ",
        source: "IMPORT",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.externalCode).toBe("lot 2026/01"); // original preserved (surrounding whitespace trimmed by policy)
    expect(res.body.data.normalizedCode).toBe("LOT-2026-01"); // deterministic normalization
    expect(res.body.data.source).toBe("IMPORT");
    expect(res.body.data.warehouseCode).toBe("WH-COLD-1");

    const alias = await prisma.batchAlias.findUnique({
      where: {
        warehouseId_normalizedCode: { warehouseId: warehouse.id, normalizedCode: "LOT-2026-01" },
      },
    });
    expect(alias).not.toBeNull();
    expect(alias?.batchId).toBe(batchId);
  });

  it("rejects an alias whose normalized form collides within the same warehouse", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-ALIAS-002" });

    await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "LOT-2026-05" });

    // Same normalized code, different raw formatting / different batch
    const res = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "lot 2026/05" });
    expect(res.status).toBe(409);

    // Exact duplicate for the same batch also conflicts
    const dupRes = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "LOT-2026-05" });
    expect(dupRes.status).toBe(409);
  });

  it("allows the same external code in different warehouses", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-ALIAS-003" });

    const wh1 = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "LOT-SHARED-99" });
    expect(wh1.status).toBe(201);

    const wh2 = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse2.id, externalCode: "LOT-SHARED-99" });
    expect(wh2.status).toBe(201);
  });

  it("rejects an alias already assigned to a different canonical batch", async () => {
    const batchA = await createBatch(managerCookie, { canonicalCode: "LOT-CONFLICT-A" });
    const batchB = await createBatch(managerCookie, { canonicalCode: "LOT-CONFLICT-B" });

    await request(app)
      .post(`/api/v1/batches/${batchA}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "VENDOR-CODE-1" });

    const res = await request(app)
      .post(`/api/v1/batches/${batchB}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "vendor code 1" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("LOT-CONFLICT-A");
    // The conflicting assignment must not silently merge or reassign
    const alias = await prisma.batchAlias.findUnique({
      where: {
        warehouseId_normalizedCode: { warehouseId: warehouse.id, normalizedCode: "VENDOR-CODE-1" },
      },
    });
    expect(alias?.batchId).toBe(batchA);
  });

  it("rejects aliases with validation or lookup errors", async () => {
    const batchId = await createBatch(managerCookie, { canonicalCode: "LOT-ALIAS-ERR" });

    // Unknown batch
    const noBatch = await request(app)
      .post("/api/v1/batches/00000000-0000-4000-8000-000000000000/aliases")
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "X-1" });
    expect(noBatch.status).toBe(404);

    // Unknown / inactive warehouse
    const noWarehouse = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: "00000000-0000-4000-8000-000000000000", externalCode: "X-1" });
    expect(noWarehouse.status).toBe(404);

    // Empty external code
    const emptyCode = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "   " });
    expect(emptyCode.status).toBe(422);

    // Only punctuation (no alphanumeric characters)
    const punctCode = await request(app)
      .post(`/api/v1/batches/${batchId}/aliases`)
      .set("Cookie", managerCookie)
      .send({ warehouseId: warehouse.id, externalCode: "!@#$%" });
    expect(punctCode.status).toBe(400);
  });
});
