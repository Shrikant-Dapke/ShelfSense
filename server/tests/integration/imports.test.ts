import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

let warehouse: { id: string; name: string; code: string };
let warehouse2: { id: string; name: string; code: string };
let productA: { id: string; name: string; sku: string };
let productB: { id: string; name: string; sku: string };

const CSV_TYPE = "text/csv";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function csv(rows: string[]): Buffer {
  return Buffer.from(rows.join("\r\n"), "utf8");
}

const FUTURE = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

async function uploadFile(
  cookie: string,
  filename: string,
  buffer: Buffer,
  fields: Record<string, string>,
  contentType?: string,
) {
  return request(app)
    .post("/api/v1/imports/upload")
    .set("Cookie", cookie)
    .field("importType", fields.importType)
    .field("warehouseId", fields.warehouseId ?? "")
    .attach("file", buffer, { filename, contentType: contentType ?? CSV_TYPE });
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
  await prisma.importJob.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  warehouse = await prisma.warehouse.create({
    data: { name: "Central Cold Store", code: "WH-COLD-1", location: "Dock A" },
  });
  warehouse2 = await prisma.warehouse.create({
    data: { name: "Annex Store", code: "WH-ANNEX-2", location: "Dock B" },
  });

  productA = await prisma.product.create({
    data: { name: "Pasteurized Milk 1L", sku: "MILK-PAST-01", category: "Dairy", unit: "L" },
  });
  productB = await prisma.product.create({
    data: { name: "Greek Yogurt 500g", sku: "YOG-GRK-01", category: "Dairy", unit: "kg" },
  });
});

async function uploadProductsCsv(cookie: string = adminCookie, rows?: string[]) {
  return uploadFile(
    cookie,
    "products.csv",
    csv(rows ?? ["Name,SKU,Category,Unit", "Oat Milk 1L,OAT-MILK-01,Dairy,L", "Soy Milk 1L,SOY-MILK-01,Dairy,L"]),
    { importType: "PRODUCTS" },
  );
}

describe("Imports — access control", () => {
  it("rejects unauthenticated access to all endpoints", async () => {
    const list = await request(app).get("/api/v1/imports");
    expect(list.status).toBe(401);

    const upload = await request(app).post("/api/v1/imports/upload");
    expect(upload.status).toBe(401);
  });

  it("forbids operators from uploading, validating, and executing (but allows reads)", async () => {
    const upload = await request(app)
      .post("/api/v1/imports/upload")
      .set("Cookie", operatorCookie)
      .field("importType", "PRODUCTS")
      .attach("file", csv("Name,SKU,Category,Unit\r\nX,Y,C,U\r\n".split("\r\n")), {
        filename: "p.csv",
      });
    expect(upload.status).toBe(403);

    const created = await prisma.importJob.create({
      data: {
        importType: "PRODUCTS",
        filename: "j.csv",
        originalName: "j.csv",
        status: "VALIDATED",
        totalRows: 1,
        validRows: 1,
        metadata: {
          importType: "PRODUCTS",
          headers: ["Name", "SKU", "Category", "Unit"],
          rows: [["X", "Y", "C", "U"]],
          rowCount: 1,
          file: { size: 1, mime: null, sha256: "x" },
          mapping: { name: "Name", sku: "SKU", category: "Category", unit: "Unit" },
        },
        createdBy: (await prisma.user.findFirst())!.id,
      },
    });

    const validate = await request(app)
      .post(`/api/v1/imports/${created.id}/validate`)
      .set("Cookie", operatorCookie)
      .send({});
    expect(validate.status).toBe(403);

    const execute = await request(app)
      .post(`/api/v1/imports/${created.id}/execute`)
      .set("Cookie", operatorCookie)
      .send({});
    expect(execute.status).toBe(403);

    const read = await request(app).get("/api/v1/imports").set("Cookie", operatorCookie);
    expect(read.status).toBe(200);
  });
});

describe("Imports — file acceptance", () => {
  it("rejects unsupported file types (.txt)", async () => {
    const res = await uploadFile(adminCookie, "notes.txt", Buffer.from("hello"), {
      importType: "PRODUCTS",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unsupported file type/i);
    expect(await prisma.importJob.count()).toBe(0);
  });

  it("rejects legacy .xls files with guidance", async () => {
    const res = await uploadFile(
      adminCookie,
      "old-sheet.xls",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
      { importType: "PRODUCTS" },
      "application/vnd.ms-excel",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/\.xls/i);
    expect(await prisma.importJob.count()).toBe(0);
  });

  it("rejects uploads over the 5 MB limit with 413", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
    const res = await uploadFile(adminCookie, "big.csv", big, { importType: "PRODUCTS" });
    expect(res.status).toBe(413);
  });

  it("rejects uploads without a file", async () => {
    const res = await request(app)
      .post("/api/v1/imports/upload")
      .set("Cookie", adminCookie)
      .field("importType", "PRODUCTS");
    expect(res.status).toBe(400);
  });

  it("rejects invalid importType values", async () => {
    const res = await uploadFile(adminCookie, "products.csv", csv(["Name,SKU"]), {
      importType: "USERS",
    });
    expect(res.status).toBe(422);
  });

  it("rejects malformed CSV files", async () => {
    const malformed = csv(["Name,SKU", '"Oat Milk,1', "Oat,2"]);
    const res = await uploadFile(adminCookie, "broken.csv", malformed, {
      importType: "PRODUCTS",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/parse/i);
  });

  it("rejects files with more than 5000 data rows", async () => {
    const rows = ["Name,SKU,Category,Unit"];
    for (let i = 0; i < 5001; i++) {
      rows.push(`Item ${i},SKU-${i},Cat,U`);
    }
    const res = await uploadFile(adminCookie, "many.csv", csv(rows), {
      importType: "PRODUCTS",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/5,000/);
  });

  it("uses the cached result of formula cells and never executes formulas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    ws.addRow(["Name", "SKU", "Category", "Unit"]);
    // Formula cell with a cached result — must be read as "OAT-999".
    ws.addRow([
      "Formula Milk",
      { formula: 'CONCATENATE("OAT-", "999")', result: "OAT-999" },
      "Dairy",
      "L",
    ]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await uploadFile(adminCookie, "formulas.xlsx", buffer, { importType: "PRODUCTS" }, XLSX_TYPE);
    expect(res.status).toBe(201);
    expect(res.body.data.headers).toEqual(["Name", "SKU", "Category", "Unit"]);
    expect(res.body.data.sampleRows[0]).toMatchObject({
      SKU: "OAT-999",
      Name: "Formula Milk",
    });
  });
});

describe("Imports — PRODUCTS", () => {
  it("completes a happy-path product import with audit rows", async () => {
    const upload = await uploadProductsCsv();
    expect(upload.status).toBe(201);
    const jobId = upload.body.data.id as string;
    expect(upload.body.data.status).toBe("PENDING");
    expect(upload.body.data.mapping).toMatchObject({ sku: "SKU", name: "Name" });

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.status).toBe(200);
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.validRows).toBe(2);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(200);
    expect(execute.body.data.status).toBe("COMPLETED");
    expect(execute.body.data.committedRows).toBe(2);
    expect(execute.body.data.executionResult.created).toBe(2);

    const oat = await prisma.product.findUnique({ where: { sku: "OAT-MILK-01" } });
    const soy = await prisma.product.findUnique({ where: { sku: "SOY-MILK-01" } });
    expect(oat).not.toBeNull();
    expect(soy).not.toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "import_job", entityId: jobId },
    });
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toEqual(["import.created", "import.executed", "import.validated"]);
  });

  it("reports row-level errors for missing fields and duplicate SKUs (in-file and in-DB)", async () => {
    const rows = [
      "Name,SKU,Category,Unit",
      "Broken Item,,Dairy,L", // missing SKU
      "Dupe In File,DUP-01,Dairy,L",
      "Dupe In File,DUP-01,Dairy,L", // duplicate within file
      `Existing Product,MILK-PAST-01,Dairy,L`, // duplicate in database
      "Valid Item,VALID-01,Dairy,L",
    ];
    const upload = await uploadProductsCsv(adminCookie, rows);
    const jobId = upload.body.data.id as string;

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.status).toBe(200);
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.validRows).toBe(2);
    expect(validate.body.data.errorRows).toBe(3);

    const rowErrors = validate.body.data.errors as Array<{ rowNumber: number; message: string }>;
    expect(rowErrors.some((e) => e.rowNumber === 2 && /SKU/i.test(e.message))).toBe(true);
    expect(rowErrors.some((e) => e.rowNumber === 4 && /duplicate/i.test(e.message))).toBe(true);
    expect(rowErrors.some((e) => e.rowNumber === 5 && /already exists/i.test(e.message))).toBe(true);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(200);
    expect(execute.body.data.committedRows).toBe(2);
    // Only rows that passed validation were committed; error rows were never
    // discarded silently — they are reported and excluded from execution.
    expect((await prisma.product.findMany({ where: { sku: "VALID-01" } })).length).toBe(1);
    // First occurrence of an in-file duplicate is valid and gets created.
    expect((await prisma.product.findMany({ where: { sku: "DUP-01" } })).length).toBe(1);
  });

  it("fails validation (FAILED) when no rows are valid and refuses execution", async () => {
    const upload = await uploadProductsCsv(adminCookie, [
      "Name,SKU,Category,Unit",
      ",MISSING-NAME,Cat,U",
      "No SKU,,Cat,U",
    ]);
    const jobId = upload.body.data.id as string;

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("FAILED");
    expect(validate.body.data.validRows).toBe(0);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(400);
    expect(execute.body.error.message).toMatch(/fix the errors/i);
  });

  it("rejects execution before validation (PENDING)", async () => {
    const upload = await uploadProductsCsv();
    const jobId = upload.body.data.id as string;

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(400);
    expect(execute.body.error.message).toMatch(/validated/i);
  });

  it("prevents duplicate execution with 409", async () => {
    const upload = await uploadProductsCsv();
    const jobId = upload.body.data.id as string;
    await request(app).post(`/api/v1/imports/${jobId}/validate`).set("Cookie", adminCookie).send({});
    await request(app).post(`/api/v1/imports/${jobId}/execute`).set("Cookie", adminCookie).send({});

    const again = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(again.status).toBe(409);
    expect(await prisma.product.count({ where: { sku: { in: ["OAT-MILK-01", "SOY-MILK-01"] } } })).toBe(2);
  });

  it("fails at execute time when rows conflict, marking PARTIALLY_COMPLETED", async () => {
    // Two rows whose batches will exist by execution time but not validation time.
    const upload = await uploadFile(
      adminCookie,
      "batches.csv",
      csv([
        "Product SKU,Batch Code,Expiry Date",
        `MILK-PAST-01,LOT-X,${FUTURE}`,
        `MILK-PAST-01,LOT-Y,${FUTURE}`,
      ]),
      { importType: "BATCHES" },
    );
    const jobId = upload.body.data.id as string;
    await request(app).post(`/api/v1/imports/${jobId}/validate`).set("Cookie", adminCookie).send({});

    // A competing batch is created between validation and execution.
    await prisma.batch.create({
      data: { productId: productA.id, canonicalCode: "LOT-X", expiryDate: new Date(FUTURE) },
    });

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(200);
    expect(execute.body.data.status).toBe("PARTIALLY_COMPLETED");
    expect(execute.body.data.committedRows).toBe(1);
    expect(execute.body.data.executionResult.skipped).toHaveLength(1);
    expect(execute.body.data.executionResult.skipped[0].reason).toMatch(/already exists/i);
  });
});

describe("Imports — BATCHES", () => {
  it("imports batches and errors on unknown products and duplicates", async () => {
    const rows = [
      "Product SKU,Batch Code,Expiry Date,Supplier",
      `MILK-PAST-01,LOT-A,${FUTURE},Apex Dairies`,
      `UNKNOWN-SKU,LOT-B,${FUTURE},X`,
      `MILK-PAST-01,LOT-A,${FUTURE},Apex Dairies`, // in-file duplicate
    ];
    const upload = await uploadFile(adminCookie, "batches.csv", csv(rows), { importType: "BATCHES" });
    const jobId = upload.body.data.id as string;
    expect(upload.status).toBe(201);

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.validRows).toBe(1);
    expect(validate.body.data.errors).toHaveLength(2);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.body.data.status).toBe("COMPLETED");

    const batch = await prisma.batch.findUnique({
      where: { productId_canonicalCode: { productId: productA.id, canonicalCode: "LOT-A" } },
    });
    expect(batch).not.toBeNull();
    expect(batch?.supplierName).toBe("Apex Dairies");
  });

  it("rejects invalid batch status values at validation", async () => {
    const upload = await uploadFile(
      adminCookie,
      "batches.csv",
      csv(["Product SKU,Batch Code,Expiry Date,Status", `MILK-PAST-01,LOT-Z,${FUTURE},DESTROYED`]),
      { importType: "BATCHES" },
    );
    const jobId = upload.body.data.id as string;
    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect((validate.body.data.errors as Array<{ message: string }>).some((e) =>
      /ACTIVE, QUARANTINED, or RECALLED/i.test(e.message),
    )).toBe(true);
  });
});

describe("Imports — BATCH_ALIASES", () => {
  let batch: { id: string };

  beforeEach(async () => {
    batch = await prisma.batch.create({
      data: { productId: productA.id, canonicalCode: "LOT-A", expiryDate: new Date(FUTURE) },
    });
  });

  it("uploads aliases with normalization warnings and preserves the original code", async () => {
    const upload = await uploadFile(
      adminCookie,
      "aliases.csv",
      csv([
        "Product SKU,Batch Code,External Code,Warehouse,Source",
        `MILK-PAST-01,LOT-A,lot 2026/01,WH-COLD-1,SUPPLIER-PORTAL`,
      ]),
      { importType: "BATCH_ALIASES", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.warnings).toHaveLength(1);
    expect(validate.body.data.warnings[0].message).toMatch(
      /normalized from "lot 2026\/01" to "LOT-2026-01"/,
    );

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.body.data.status).toBe("COMPLETED");

    const alias = await prisma.batchAlias.findUnique({
      where: { warehouseId_normalizedCode: { warehouseId: warehouse.id, normalizedCode: "LOT-2026-01" } },
    });
    expect(alias).not.toBeNull();
    expect(alias?.externalCode).toBe("lot 2026/01"); // original preserved
    expect(alias?.source).toBe("SUPPLIER-PORTAL");
    expect(alias?.batchId).toBe(batch.id);
  });

  it("errors when an alias conflicts with an existing assignment and never reassigns it", async () => {
    await prisma.batchAlias.create({
      data: {
        batchId: batch.id,
        warehouseId: warehouse.id,
        externalCode: "LOT-2026-01",
        normalizedCode: "LOT-2026-01",
        source: "MANUAL",
      },
    });
    // A different batch that a malicious/confused file tries to hijack the alias to.
    const otherBatch = await prisma.batch.create({
      data: { productId: productB.id, canonicalCode: "LOT-B", expiryDate: new Date(FUTURE) },
    });

    const upload = await uploadFile(
      adminCookie,
      "aliases.csv",
      csv([
        "Product SKU,Batch Code,External Code,Warehouse",
        `YOG-GRK-01,LOT-B,lot/2026-01,WH-COLD-1`,
      ]),
      { importType: "BATCH_ALIASES", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("FAILED");
    expect(validate.body.data.errors[0].message).toMatch(/already assigned to batch "LOT-A"/);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(400);

    // The existing alias still points at its original batch.
    const alias = await prisma.batchAlias.findUnique({
      where: { warehouseId_normalizedCode: { warehouseId: warehouse.id, normalizedCode: "LOT-2026-01" } },
    });
    expect(alias?.batchId).toBe(batch.id);
    expect(alias?.batchId).not.toBe(otherBatch.id);
  });

  it("allows the same alias code in different warehouses", async () => {
    const upload = await uploadFile(
      adminCookie,
      "aliases.csv",
      csv([
        "Product SKU,Batch Code,External Code,Warehouse",
        `MILK-PAST-01,LOT-A,SUP-LOT-9,WH-COLD-1`,
        `MILK-PAST-01,LOT-A,SUP-LOT-9,WH-ANNEX-2`,
      ]),
      { importType: "BATCH_ALIASES", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.errorRows).toBe(0);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.body.data.committedRows).toBe(2);
    expect(await prisma.batchAlias.count({ where: { normalizedCode: "SUP-LOT-9" } })).toBe(2);
  });

  it("requires a warehouse for alias imports at upload time", async () => {
    const res = await uploadFile(
      adminCookie,
      "aliases.csv",
      csv(["Product SKU,Batch Code,External Code", "MILK-PAST-01,LOT-A,X"]),
      { importType: "BATCH_ALIASES" },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/warehouse is required/i);
  });

  it("errors when a row's warehouse code is unknown", async () => {
    const upload = await uploadFile(
      adminCookie,
      "aliases.csv",
      csv([
        "Product SKU,Batch Code,External Code,Warehouse",
        `MILK-PAST-01,LOT-A,NEW-ALIAS-1,WH-GHOST`,
      ]),
      { importType: "BATCH_ALIASES", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.errors[0].message).toMatch(/WH-GHOST/);
  });
});

describe("Imports — OPENING_STOCK", () => {
  it("creates stock exclusively through the receipts ledger workflow", async () => {
    const upload = await uploadFile(
      adminCookie,
      "opening-stock.csv",
      csv([
        "Product SKU,Batch Code,Expiry Date,Quantity,Unit Cost,Supplier",
        `MILK-PAST-01,LOT-OS-1,${FUTURE},12.3457,1.2500,Apex Dairies`,
        `YOG-GRK-01,LOT-OS-2,${FUTURE},80,0.9500,Apex Dairies`,
      ]),
      { importType: "OPENING_STOCK", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    expect(upload.status).toBe(201);

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.validRows).toBe(2);

    const execute = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(execute.status).toBe(200);
    expect(execute.body.data.status).toBe("COMPLETED");
    expect(execute.body.data.committedRows).toBe(2);
    expect(execute.body.data.executionResult.receiptId).toBeDefined();
    expect(execute.body.data.executionResult.stockMovementsCreated).toBe(2);

    // A receipt was created and every unit of stock is an immutable RECEIPT movement.
    const receipt = await prisma.receipt.findUnique({
      where: { id: execute.body.data.executionResult.receiptId },
      include: { items: true },
    });
    expect(receipt).not.toBeNull();
    expect(receipt!.idempotencyKey).toBe(jobId);
    expect(receipt!.items).toHaveLength(2);

    const movements = await prisma.stockMovement.findMany({
      where: { warehouseId: warehouse.id, movementType: "RECEIPT" },
    });
    expect(movements).toHaveLength(2);

    // Decimal precision: 12.3457 must be preserved exactly (NUMERIC(19,4)).
    const batch1 = await prisma.batch.findUnique({
      where: { productId_canonicalCode: { productId: productA.id, canonicalCode: "LOT-OS-1" } },
    });
    const movement = movements.find((m) => m.batchId === batch1!.id)!;
    expect(movement.quantity.toString()).toBe("12.3457");
    expect(movement.idempotencyKey).toBe(`${jobId}_item_0`);

    // Ledger balance equals the imported quantity — no direct balance writes.
    const total = movements
      .filter((m) => m.batchId === batch1!.id)
      .reduce((sum, m) => sum + Number(m.quantity), 0);
    expect(total).toBe(12.3457);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "import_job", entityId: jobId },
    });
    expect(audits.map((a) => a.action)).toContain("import.executed");
  });

  it("prevents duplicate opening-stock execution from duplicating stock", async () => {
    const upload = await uploadFile(
      adminCookie,
      "opening-stock.csv",
      csv([
        "Product SKU,Batch Code,Expiry Date,Quantity",
        `MILK-PAST-01,LOT-OS-1,${FUTURE},50`,
      ]),
      { importType: "OPENING_STOCK", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    await request(app).post(`/api/v1/imports/${jobId}/validate`).set("Cookie", adminCookie).send({});
    const first = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/imports/${jobId}/execute`)
      .set("Cookie", adminCookie)
      .send({});
    expect(second.status).toBe(409);

    expect(await prisma.stockMovement.count({ where: { warehouseId: warehouse.id } })).toBe(1);
    expect(await prisma.receipt.count({ where: { idempotencyKey: jobId } })).toBe(1);
  });

  it("rejects non-positive and over-precise quantities at validation", async () => {
    const upload = await uploadFile(
      adminCookie,
      "opening-stock.csv",
      csv([
        "Product SKU,Batch Code,Expiry Date,Quantity",
        `MILK-PAST-01,LOT-NEG,${FUTURE},-5`,
        `MILK-PAST-01,LOT-EXACT,${FUTURE},1.23456`,
      ]),
      { importType: "OPENING_STOCK", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.validRows).toBe(0);
    const messages = (validate.body.data.errors as Array<{ message: string }>).map((e) => e.message);
    expect(messages.some((m) => /number with at most 4 decimal places/.test(m))).toBe(true);
    expect(messages.some((m) => /number with at most 4 decimal places/.test(m))).toBe(true);
  });

  it("warns when opening stock references an expiry date in the past", async () => {
    const upload = await uploadFile(
      adminCookie,
      "opening-stock.csv",
      csv([
        "Product SKU,Batch Code,Expiry Date,Quantity",
        `MILK-PAST-01,LOT-PAST,${PAST},10`,
      ]),
      { importType: "OPENING_STOCK", warehouseId: warehouse.id },
    );
    const jobId = upload.body.data.id as string;
    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({});
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.warnings[0].message).toMatch(/expiry date is in the past/i);
  });
});

describe("Imports — history, preview, details", () => {
  it("paginates history and filters by import type and status", async () => {
    await uploadProductsCsv();
    await uploadFile(
      adminCookie,
      "stock.csv",
      csv(["Product SKU,Batch Code,Expiry Date,Quantity", `MILK-PAST-01,LOT-H,${FUTURE},5`]),
      { importType: "OPENING_STOCK", warehouseId: warehouse.id },
    );

    const all = await request(app).get("/api/v1/imports").set("Cookie", adminCookie);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta.total).toBe(2);

    const filtered = await request(app)
      .get("/api/v1/imports?importType=OPENING_STOCK")
      .set("Cookie", adminCookie);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].importType).toBe("OPENING_STOCK");
    expect(filtered.body.data[0].warehouseCode).toBe("WH-COLD-1");

    const paged = await request(app)
      .get("/api/v1/imports?page=2&pageSize=1")
      .set("Cookie", adminCookie);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.page).toBe(2);
  });

  it("previews headers, mapping, and sample rows", async () => {
    const upload = await uploadProductsCsv();
    const jobId = upload.body.data.id as string;

    const preview = await request(app)
      .get(`/api/v1/imports/${jobId}/preview`)
      .set("Cookie", adminCookie);
    expect(preview.status).toBe(200);
    expect(preview.body.data.headers).toEqual(["Name", "SKU", "Category", "Unit"]);
    expect(preview.body.data.mapping.sku).toBe("SKU");
    expect(preview.body.data.sampleRows).toHaveLength(2);
    expect(preview.body.data.sampleRows[0].SKU).toBe("OAT-MILK-01");
    expect(preview.body.data.file.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns 404 for unknown import ids and 400 for malformed ids", async () => {
    const missing = await request(app)
      .get(`/api/v1/imports/${crypto.randomUUID()}`)
      .set("Cookie", adminCookie);
    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .get("/api/v1/imports/not-a-uuid")
      .set("Cookie", adminCookie);
    expect(malformed.status).toBe(400);
  });

  it("supports explicit column mapping at validate time", async () => {
    const upload = await uploadFile(
      adminCookie,
      "odd-headers.csv",
      csv(["Product Title,Identifier,Cat,Measure", "Oat Milk 2L,OAT-2L,Dairy,L"]),
      { importType: "PRODUCTS" },
    );
    const jobId = upload.body.data.id as string;

    const validate = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({
        columnMapping: {
          name: "Product Title",
          sku: "Identifier",
          category: "Cat",
          unit: "Measure",
        },
      });
    expect(validate.status).toBe(200);
    expect(validate.body.data.status).toBe("VALIDATED");
    expect(validate.body.data.mapping.name).toBe("Product Title");
  });

  it("rejects mappings that point to missing headers or omit required fields", async () => {
    const upload = await uploadProductsCsv();
    const jobId = upload.body.data.id as string;

    const badHeader = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({
        columnMapping: {
          name: "Name",
          sku: "Nope",
          category: "Category",
          unit: "Unit",
        },
      });
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error.message).toMatch(/does not exist in the file/i);

    const missingField = await request(app)
      .post(`/api/v1/imports/${jobId}/validate`)
      .set("Cookie", adminCookie)
      .send({ columnMapping: { name: "Name", sku: "SKU" } });
    expect(missingField.status).toBe(400);
    expect(missingField.body.error.message).toMatch(/missing required column mapping/i);
  });
});
