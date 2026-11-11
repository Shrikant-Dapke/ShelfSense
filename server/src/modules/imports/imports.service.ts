import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { normalizeBatchCode } from "../batches/batches.utils.js";
import { receiptsService } from "../receipts/receipts.service.js";
import {
  assertFileAcceptable,
  fileChecksum,
  parseImportFile,
  type ParsedFile,
} from "./imports.parsers.js";
import {
  IMPORT_FIELD_SPECS,
  autoDetectMapping,
  buildColumnIndex,
  canonicalizeBatchCode,
  missingRequiredFields,
} from "./imports.mapping.js";
import { importsRepository, toImportJobDetailView } from "./imports.repository.js";
import {
  WAREHOUSE_SCOPED_IMPORTS,
  type ImportJobMetadata,
  type ImportRowError,
  type ImportRowWarning,
  type ImportType,
} from "./imports.types.js";
import type { ValidateImportInput } from "./imports.validation.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as any).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

const QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;
const DATE_FIELD_TYPES = new Set(["expiryDate", "manufacturingDate", "receiptDate"]);

/** Parses a quantity strictly: non-negative, at most 4 decimal places. */
function parseQuantity(raw: string, allowZero: boolean): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "must not be empty" };
  if (!QUANTITY_PATTERN.test(trimmed)) {
    return { error: "must be a number with at most 4 decimal places and no separators" };
  }
  const value = Number(trimmed);
  if (!allowZero && value <= 0) return { error: "must be greater than zero" };
  if (allowZero && value < 0) return { error: "must not be negative" };
  return { value };
}

/** Accepts ISO datetime or plain YYYY-MM-DD dates; returns ISO or an error. */
function parseDateField(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "must not be empty" };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { error: `"${trimmed}" is not a valid date` };
  }
  return { value: date.toISOString() };
}

/** Terminal (already executed / immutable) job statuses. */
const EXECUTED_STATUSES = new Set(["PROCESSING", "COMPLETED", "PARTIALLY_COMPLETED", "COMMITTED"]);

function metadataOf(job: { metadata: Prisma.JsonValue | null }): ImportJobMetadata {
  return (job.metadata ?? {}) as unknown as ImportJobMetadata;
}

export const importsService = {
  // ---------------------------------------------------------------- Upload

  async uploadImport(
    file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    fields: { importType: ImportType; warehouseId?: string },
    req: Request,
  ) {
    const userId = (req as any).user.id;

    // File-level validation (extension, MIME, size) before parsing.
    assertFileAcceptable({
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    let warehouseId: string | null = fields.warehouseId ?? null;
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse || !warehouse.isActive) {
        throw ApiError.notFound("Warehouse not found or inactive");
      }
    }
    if (WAREHOUSE_SCOPED_IMPORTS.includes(fields.importType) && !warehouseId) {
      throw ApiError.badRequest(
        `A warehouse is required for ${fields.importType} imports (select it on upload or provide a warehouse code column).`,
      );
    }

    const parsed: ParsedFile = await parseImportFile({
      originalname: file.originalname,
      buffer: file.buffer,
    });

    const metadata: ImportJobMetadata = {
      importType: fields.importType,
      headers: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      file: {
        size: file.size,
        mime: file.mimetype || null,
        sha256: fileChecksum(file.buffer),
      },
      mapping: autoDetectMapping(fields.importType, parsed.headers),
    };

    const job = await importsRepository.createJob({
      warehouseId,
      importType: fields.importType,
      filename: `import-${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, "_")}`,
      originalName: file.originalname,
      totalRows: parsed.rows.length,
      metadata,
      createdBy: userId,
    });

    await writeAudit({
      ...auditContext(req),
      action: "import.created",
      entityType: "import_job",
      entityId: job.id,
      metadata: {
        importType: fields.importType,
        originalName: file.originalname,
        rowCount: parsed.rows.length,
        sha256: metadata.file.sha256,
      },
    });

    return toImportJobDetailView(job);
  },

  // ---------------------------------------------------------------- Validate

  async validateImport(id: string, input: ValidateImportInput, req: Request) {
    const job = await importsRepository.getJobById(id);
    if (!job) throw ApiError.notFound("Import job not found");

    const meta = metadataOf(job);
    if (EXECUTED_STATUSES.has(job.status)) {
      throw ApiError.conflict("Import has already been executed and cannot be re-validated");
    }

    const importType = meta.importType;

    // Resolve warehouse (job-level or supplied at validation time).
    let warehouseId = job.warehouseId ?? input.warehouseId ?? null;
    if (WAREHOUSE_SCOPED_IMPORTS.includes(importType) && !warehouseId) {
      throw ApiError.badRequest(`A warehouse is required to validate ${importType} imports`);
    }
    if (warehouseId && warehouseId !== job.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse || !warehouse.isActive) {
        throw ApiError.notFound("Warehouse not found or inactive");
      }
    }

    // Resolve column mapping: explicit > stored > auto-detected.
    const mapping =
      input.columnMapping ?? meta.mapping ?? autoDetectMapping(importType, meta.headers);

    // Mapped headers must exist in the file.
    for (const [field, header] of Object.entries(mapping)) {
      if (!meta.headers.includes(header)) {
        throw ApiError.badRequest(
          `Column mapping for "${field}" points to header "${header}" which does not exist in the file`,
        );
      }
    }

    // All required fields must be mapped.
    const missing = missingRequiredFields(importType, mapping);
    if (missing.length > 0) {
      throw ApiError.badRequest(
        `Missing required column mapping for: ${missing.map((f) => f.label).join(", ")}`,
        missing.map((f) => ({ field: f.type, message: `${f.label} is not mapped to any column` })),
      );
    }

    const { errors, warnings, validCount } = await validateRows(
      importType,
      mapping,
      meta.rows,
      meta.headers,
      warehouseId,
    );

    const status = validCount > 0 ? "VALIDATED" : "FAILED";

    const updatedMetadata: ImportJobMetadata = {
      ...meta,
      mapping,
      rowErrors: errors,
      rowWarnings: warnings,
      lastError: undefined,
    };

    await importsRepository.updateJob(id, {
      status,
      validRows: validCount,
      errorRows: errors.length,
      metadata: updatedMetadata,
      ...(warehouseId ? { warehouseId } : {}),
    });

    await writeAudit({
      ...auditContext(req),
      action: "import.validated",
      entityType: "import_job",
      entityId: id,
      metadata: {
        importType,
        totalRows: meta.rowCount,
        validRows: validCount,
        errorRows: errors.length,
      },
    });

    return {
      id,
      status,
      importType,
      totalRows: meta.rowCount,
      validRows: validCount,
      errorRows: errors.length,
      errors,
      warnings,
      mapping,
    };
  },

  // ---------------------------------------------------------------- Preview

  async previewImport(id: string) {
    const job = await importsRepository.getJobById(id);
    if (!job) throw ApiError.notFound("Import job not found");
    return toImportJobDetailView(job);
  },

  async getImportById(id: string) {
    const job = await importsRepository.getJobById(id);
    if (!job) throw ApiError.notFound("Import job not found");
    return toImportJobDetailView(job);
  },

  async getImportHistory(query: Parameters<typeof importsRepository.getImportHistory>[0]) {
    return importsRepository.getImportHistory(query);
  },

  // ---------------------------------------------------------------- Execute

  /**
   * Executes a VALIDATED import. Guards make execution idempotent: only a job
   * in VALIDATED state can run, and the row set executed is the validated set.
   */
  async executeImport(id: string, req: Request) {
    const job = await importsRepository.getJobById(id);
    if (!job) throw ApiError.notFound("Import job not found");

    const meta = metadataOf(job);
    const importType = meta.importType;

    if (EXECUTED_STATUSES.has(job.status)) {
      throw ApiError.conflict("Import has already been executed");
    }
    if (job.status === "PENDING") {
      throw ApiError.badRequest("Import must be validated before execution");
    }
    if (job.status === "FAILED") {
      throw ApiError.badRequest("Import validation failed — fix the errors and re-validate");
    }
    if (job.status !== "VALIDATED") {
      throw ApiError.badRequest(`Import cannot be executed while status is ${job.status}`);
    }

    const validRowNumbers = validRowNumbersOf(meta);
    if (validRowNumbers.length === 0) {
      throw ApiError.badRequest("Import has no valid rows to execute");
    }

    try {
      let result;
      if (importType === "OPENING_STOCK") {
        result = await this.executeOpeningStock(job, meta, validRowNumbers, req);
      } else {
        result = await this.executeRecordImport(job, meta, validRowNumbers, req);
      }

      await writeAudit({
        ...auditContext(req),
        action: "import.executed",
        entityType: "import_job",
        entityId: id,
        metadata: {
          importType,
          created: result.executionResult.created,
          skipped: result.executionResult.skipped.length,
        },
      });

      return result.view;
    } catch (err: any) {
      // Persist a safe failure marker; never leak internals to the client.
      const safeMessage =
        err instanceof ApiError
          ? err.message
          : "Import execution failed and was rolled back; nothing was committed";
      await importsRepository
        .updateJob(id, {
          status: "FAILED",
          metadata: { ...meta, lastError: safeMessage },
        })
        .catch(() => undefined);
      if (err instanceof ApiError) throw err;
      throw err;
    }
  },

  /**
   * Record imports (PRODUCTS / BATCHES / BATCH_ALIASES) run inside a single
   * transaction: all-or-nothing. Rows that now conflict with concurrently
   * created records are skipped, never silently merged or overwritten.
   */
  async executeRecordImport(
    job: NonNullable<Awaited<ReturnType<typeof importsRepository.getJobById>>>,
    meta: ImportJobMetadata,
    validRowNumbers: number[],
    req: Request,
  ) {
    const importType = meta.importType;
    const mapping = meta.mapping!;
    const rowIndex = buildColumnIndex(meta.headers, mapping);
    const userId = (req as any).user.id;

    const created = await prisma.$transaction(async (tx) => {
      const skipped: Array<{ rowNumber: number; reason: string }> = [];
      let count = 0;

      for (const rowNumber of validRowNumbers) {
        const cells = meta.rows[rowNumber - 2] ?? [];
        const cell = (field: string) => (cells[rowIndex.get(field) ?? -1] ?? "").trim();

        if (importType === "PRODUCTS") {
          const sku = cell("sku");
          const existing = await tx.product.findUnique({ where: { sku } });
          if (existing) {
            skipped.push({ rowNumber, reason: `SKU "${sku}" already exists` });
            continue;
          }
          await tx.product.create({
            data: {
              name: cell("name"),
              sku,
              category: cell("category"),
              unit: cell("unit"),
              brand: cell("brand") || undefined,
            },
          });
          count++;
          continue;
        }

        if (importType === "BATCHES") {
          const product = await tx.product.findUnique({ where: { sku: cell("productSku") } });
          if (!product) {
            skipped.push({ rowNumber, reason: `Product "${cell("productSku")}" not found` });
            continue;
          }
          const existing = await tx.batch.findUnique({
            where: {
              productId_canonicalCode: {
                productId: product.id,
                canonicalCode: cell("canonicalCode"),
              },
            },
          });
          if (existing) {
            skipped.push({
              rowNumber,
              reason: `Batch "${cell("canonicalCode")}" already exists for this product`,
            });
            continue;
          }
          const expiry = parseDateField(cell("expiryDate"));
          if ("error" in expiry) {
            skipped.push({ rowNumber, reason: `Expiry date ${expiry.error}` });
            continue;
          }
          const mfg = cell("manufacturingDate");
          const mfgDate = mfg ? parseDateField(mfg) : null;
          if (mfgDate && "error" in mfgDate) {
            skipped.push({ rowNumber, reason: `Manufacturing date ${mfgDate.error}` });
            continue;
          }
          const rcd = cell("receiptDate");
          const rcdDate = rcd ? parseDateField(rcd) : null;
          if (rcdDate && "error" in rcdDate) {
            skipped.push({ rowNumber, reason: `Receipt date ${rcdDate.error}` });
            continue;
          }
          const statusRaw = cell("status").toUpperCase();
          await tx.batch.create({
            data: {
              productId: product.id,
              canonicalCode: cell("canonicalCode"),
              expiryDate: new Date(expiry.value),
              manufacturingDate: mfgDate && "value" in mfgDate ? new Date(mfgDate.value) : undefined,
              receiptDate: rcdDate && "value" in rcdDate ? new Date(rcdDate.value) : undefined,
              supplierName: cell("supplierName") || undefined,
              status: ["ACTIVE", "QUARANTINED", "RECALLED"].includes(statusRaw) ? statusRaw : "ACTIVE",
            },
          });
          count++;
          continue;
        }

        if (importType === "BATCH_ALIASES") {
          const product = await tx.product.findUnique({ where: { sku: cell("productSku") } });
          if (!product) {
            skipped.push({ rowNumber, reason: `Product "${cell("productSku")}" not found` });
            continue;
          }
          const batch = await tx.batch.findUnique({
            where: {
              productId_canonicalCode: {
                productId: product.id,
                canonicalCode: cell("canonicalCode"),
              },
            },
          });
          if (!batch) {
            skipped.push({
              rowNumber,
              reason: `Batch "${cell("canonicalCode")}" not found for product "${cell("productSku")}"`,
            });
            continue;
          }

          let warehouseId: string | undefined;
          const whCode = cell("warehouseCode");
          if (whCode) {
            const warehouse = await tx.warehouse.findUnique({ where: { code: whCode } });
            if (!warehouse) {
              skipped.push({ rowNumber, reason: `Warehouse "${whCode}" not found` });
              continue;
            }
            warehouseId = warehouse.id;
          } else {
            warehouseId = job.warehouseId ?? undefined;
          }
          if (!warehouseId) {
            skipped.push({ rowNumber, reason: "No warehouse resolved for row" });
            continue;
          }

          const externalCode = cell("externalCode");
          const normalizedCode = normalizeBatchCode(externalCode);
          if (!normalizedCode) {
            skipped.push({
              rowNumber,
              reason: `Alias "${externalCode}" normalizes to an empty code`,
            });
            continue;
          }
          const existingAlias = await tx.batchAlias.findUnique({
            where: {
              warehouseId_normalizedCode: { warehouseId, normalizedCode },
            },
            include: { batch: true },
          });
          if (existingAlias) {
            skipped.push({
              rowNumber,
              reason: `Alias "${externalCode}" in this warehouse is already assigned to batch "${existingAlias.batch.canonicalCode}"`,
            });
            continue;
          }
          await tx.batchAlias.create({
            data: {
              batchId: batch.id,
              warehouseId,
              externalCode,
              normalizedCode,
              source: cell("source") || "IMPORT",
            },
          });
          count++;
          continue;
        }
      }

      return { count, skipped };
    });

    const status = created.skipped.length === 0 ? "COMPLETED" : "PARTIALLY_COMPLETED";
    const metadata: ImportJobMetadata = {
      ...meta,
      executionResult: { created: created.count, skipped: created.skipped },
    };

    const updated = await importsRepository.updateJob(job.id, {
      status,
      committedRows: created.count,
      metadata,
    });

    return {
      view: toImportJobDetailView(updated),
      executionResult: metadata.executionResult!,
    };
  },

  /**
   * Opening-stock imports reuse the receipt workflow (atomic transaction,
   * batch row locks, immutable RECEIPT stock movements, idempotency keys).
   * The import job id doubles as the receipt idempotency key so repeated
   * execution can never create duplicate stock.
   */
  async executeOpeningStock(
    job: NonNullable<Awaited<ReturnType<typeof importsRepository.getJobById>>>,
    meta: ImportJobMetadata,
    validRowNumbers: number[],
    req: Request,
  ) {
    if (!job.warehouseId) {
      throw ApiError.badRequest("A warehouse is required to execute opening-stock imports");
    }

    const mapping = meta.mapping!;
    const rowIndex = buildColumnIndex(meta.headers, mapping);

    // Resolve products / existing batches fresh at execution time.
    const skus = new Set<string>();
    for (const rowNumber of validRowNumbers) {
      const cells = meta.rows[rowNumber - 2] ?? [];
      const sku = (cells[rowIndex.get("productSku") ?? -1] ?? "").trim();
      if (sku) skus.add(sku);
    }
    const products = await prisma.product.findMany({ where: { sku: { in: [...skus] } } });
    const productBySku = new Map(products.map((p) => [p.sku, p]));

    const batchKeys: Array<{ productId: string; canonicalCode: string }> = [];
    for (const rowNumber of validRowNumbers) {
      const cells = meta.rows[rowNumber - 2] ?? [];
      const sku = (cells[rowIndex.get("productSku") ?? -1] ?? "").trim();
      const product = productBySku.get(sku);
      const code = (cells[rowIndex.get("canonicalCode") ?? -1] ?? "").trim();
      if (product && code) {
        batchKeys.push({ productId: product.id, canonicalCode: code });
      }
    }
    const batches = await prisma.batch.findMany({
      where: { OR: batchKeys },
    });
    const batchByKey = new Map(
      batches.map((b) => [`${b.productId}|${canonicalizeBatchCode(b.canonicalCode)}`, b]),
    );

    type ReceiptItemInput = {
      productId: string;
      batchId?: string;
      canonicalCode: string;
      expiryDate: string;
      quantity: number;
      unitCost?: number;
      supplierName?: string;
      manufacturingDate?: string;
      receiptDate?: string;
    };

    const items: ReceiptItemInput[] = [];
    for (const rowNumber of validRowNumbers) {
      const cells = meta.rows[rowNumber - 2] ?? [];
      const cell = (field: string) => (cells[rowIndex.get(field) ?? -1] ?? "").trim();
      const product = productBySku.get(cell("productSku"));
      if (!product) continue; // defensive; validated earlier

      const expiry = parseDateField(cell("expiryDate"));
      if ("error" in expiry) continue;

      const quantity = parseQuantity(cell("quantity"), false);
      if ("error" in quantity) continue;

      const canonicalCode = cell("canonicalCode");
      const existingBatch = batchByKey.get(`${product.id}|${canonicalizeBatchCode(canonicalCode)}`);

      const mfg = cell("manufacturingDate");
      const mfgDate = mfg ? parseDateField(mfg) : null;
      const rcd = cell("receiptDate");
      const rcdDate = rcd ? parseDateField(rcd) : null;

      const unitCostRaw = cell("unitCost");
      const unitCost = unitCostRaw ? parseQuantity(unitCostRaw, true) : null;

      items.push({
        productId: product.id,
        batchId: existingBatch?.id,
        canonicalCode,
        expiryDate: expiry.value,
        quantity: quantity.value,
        unitCost: unitCost && "value" in unitCost ? unitCost.value : undefined,
        supplierName: cell("supplierName") || undefined,
        manufacturingDate: mfgDate && "value" in mfgDate ? mfgDate.value : undefined,
        receiptDate: rcdDate && "value" in rcdDate ? rcdDate.value : undefined,
      });
    }

    // Receipt creation is atomic (its own transaction, row locks, movements).
    // The import job id doubles as the receipt idempotency key (it is a UUID),
    // so re-executing the same job can never create duplicate stock.
    const receipt = await receiptsService.createReceipt(
      {
        warehouseId: job.warehouseId,
        receivedAt: new Date().toISOString(),
        items,
        idempotencyKey: job.id,
      },
      req,
    );
    if (!receipt) {
      throw ApiError.internal("Receipt could not be loaded after creation");
    }
    const movementsCreated = receipt.items.reduce(
      (sum: number, item: { id: string }) => sum + 1,
      0,
    );

    const metadata: ImportJobMetadata = {
      ...meta,
      executionResult: {
        created: items.length,
        skipped: [],
        receiptId: receipt.id,
        stockMovementsCreated: movementsCreated,
      },
    };

    const updated = await importsRepository.updateJob(job.id, {
      status: "COMPLETED",
      committedRows: items.length,
      metadata,
    });

    return {
      view: toImportJobDetailView(updated),
      executionResult: metadata.executionResult!,
    };
  },
};

/** Row numbers (1-based; header = row 1) that passed validation. */
function validRowNumbersOf(meta: ImportJobMetadata): number[] {
  const errorNumbers = new Set((meta.rowErrors ?? []).map((e) => e.rowNumber));
  const valid: number[] = [];
  for (let rowNumber = 2; rowNumber <= (meta.rowCount ?? 0) + 1; rowNumber++) {
    if (!errorNumbers.has(rowNumber)) valid.push(rowNumber);
  }
  return valid;
}

interface ValidatedRows {
  errors: ImportRowError[];
  warnings: ImportRowWarning[];
  validCount: number;
}

async function validateRows(
  importType: ImportType,
  mapping: Record<string, string>,
  rows: string[][],
  headers: string[],
  jobWarehouseId: string | null,
): Promise<ValidatedRows> {
  const rowIndex = buildColumnIndex(headers, mapping);
  const errors: ImportRowError[] = [];
  const warnings: ImportRowWarning[] = [];

  const cell = (cells: string[], field: string) =>
    (cells[rowIndex.get(field) ?? -1] ?? "").trim();

  // ---- Preload reference data -------------------------------------------
  const skus = new Set<string>();
  for (const cells of rows) {
    for (const field of ["sku", "productSku"]) {
      if (rowIndex.has(field)) {
        const v = cell(cells, field);
        if (v) skus.add(v);
      }
    }
  }
  const products =
    rowIndex.has("sku") || rowIndex.has("productSku")
      ? await prisma.product.findMany({ where: { sku: { in: [...skus] } } })
      : [];
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const warehouseCodes = new Set<string>();
  if (importType === "BATCH_ALIASES" && rowIndex.has("warehouseCode")) {
    for (const cells of rows) {
      const v = cell(cells, "warehouseCode");
      if (v) warehouseCodes.add(v);
    }
  }
  const warehouses =
    warehouseCodes.size > 0
      ? await prisma.warehouse.findMany({ where: { code: { in: [...warehouseCodes] } } })
      : [];
  const warehouseByCode = new Map(warehouses.map((w) => [w.code, w]));

  // Batches referenced by (productId, canonicalCode): fetch by code list,
  // then match on the (productId, normalized code) pair in memory.
  const batchCodes = new Set<string>();
  for (const cells of rows) {
    const skuCell = cell(cells, "productSku");
    const codeCell = cell(cells, "canonicalCode");
    if (skuCell && codeCell && productBySku.has(skuCell)) {
      batchCodes.add(canonicalizeBatchCode(codeCell));
    }
  }
  const referencedBatches =
    batchCodes.size > 0
      ? await prisma.batch.findMany({
          where: { canonicalCode: { in: [...batchCodes] } },
        })
      : [];
  const batchByKey = new Map(
    referencedBatches.map((b) => [`${b.productId}|${canonicalizeBatchCode(b.canonicalCode)}`, b]),
  );

  // Aliases referenced per warehouse: fetch by normalized-code list, then
  // match on (warehouseId, normalizedCode) pairs in memory.
  const aliasCodes = new Set<string>();
  for (const cells of rows) {
    if (!rowIndex.has("externalCode")) continue;
    const code = canonicalizeBatchCode(cell(cells, "externalCode"));
    if (code) aliasCodes.add(code);
  }
  const referencedAliases =
    aliasCodes.size > 0
      ? await prisma.batchAlias.findMany({
          where: { normalizedCode: { in: [...aliasCodes] } },
          include: { batch: true },
        })
      : [];
  const aliasByKey = new Map(
    referencedAliases.map((a) => [`${a.warehouseId}|${a.normalizedCode}`, a]),
  );

  // ---- Per-row validation ------------------------------------------------
  const seen = {
    skus: new Set<string>(),
    batches: new Set<string>(),
    aliases: new Set<string>(),
    openingBatches: new Set<string>(),
  };

  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const rowErrors: ImportRowError[] = [];
    const raw = cells;

    const addError = (field: string | undefined, message: string) => {
      rowErrors.push({ rowNumber, field, message, raw });
    };

    for (const spec of IMPORT_FIELD_SPECS[importType]) {
      const value = cell(cells, spec.type);
      if (spec.required && value === "") {
        addError(spec.type, `Missing required field "${spec.label}"`);
        continue;
      }
      if (value === "") continue;

      if (DATE_FIELD_TYPES.has(spec.type)) {
        const parsed = parseDateField(value);
        if ("error" in parsed) {
          addError(spec.type, `${spec.label}: ${parsed.error}`);
        } else if (spec.type === "expiryDate") {
          if (new Date(parsed.value).getTime() <= Date.now()) {
            warnings.push({
              rowNumber,
              field: spec.type,
              message: "Expiry date is in the past — the batch will be created expired",
            });
          }
        }
        continue;
      }

      if (spec.type === "quantity") {
        const parsed = parseQuantity(value, false);
        if ("error" in parsed) {
          addError(spec.type, `Quantity ${parsed.error}`);
        }
        continue;
      }

      if (spec.type === "unitCost") {
        const parsed = parseQuantity(value, true);
        if ("error" in parsed) {
          addError(spec.type, `Unit cost ${parsed.error}`);
        }
        continue;
      }

      if (spec.type === "status" && importType === "BATCHES") {
        if (!["ACTIVE", "QUARANTINED", "RECALLED"].includes(value.toUpperCase())) {
          addError(spec.type, `Status must be ACTIVE, QUARANTINED, or RECALLED (got "${value}")`);
        }
        continue;
      }

      if (spec.type === "externalCode") {
        const normalized = normalizeBatchCode(value);
        if (!normalized) {
          addError(spec.type, `Alias "${value}" contains no alphanumeric characters`);
        } else if (normalized !== value.toUpperCase().trim()) {
          warnings.push({
            rowNumber,
            field: spec.type,
            message: `Alias will be normalized from "${value}" to "${normalized}"`,
          });
        }
        continue;
      }
    }

    // ---- In-file and database duplicate detection ------------------------
    if (importType === "PRODUCTS") {
      const sku = cell(cells, "sku");
      if (sku) {
        if (seen.skus.has(sku)) {
          addError("sku", `Duplicate SKU "${sku}" within the import file`);
        }
        seen.skus.add(sku);
        if (rowErrors.length === 0 && productBySku.has(sku)) {
          addError("sku", `SKU "${sku}" already exists in the system`);
        }
      }
    }

    if (importType === "BATCHES") {
      const sku = cell(cells, "productSku");
      const code = cell(cells, "canonicalCode");
      const product = productBySku.get(sku);
      if (!product && sku && rowErrors.length === 0) {
        addError("productSku", `Product with SKU "${sku}" does not exist`);
      }
      if (sku && code) {
        const key = `${sku}|${canonicalizeBatchCode(code)}`;
        if (seen.batches.has(key)) {
          addError("canonicalCode", `Duplicate batch "${code}" for product "${sku}" within the import file`);
        }
        seen.batches.add(key);
        if (product && rowErrors.length === 0) {
          const dbKey = `${product.id}|${canonicalizeBatchCode(code)}`;
          if (batchByKey.has(dbKey)) {
            addError("canonicalCode", `Batch "${code}" already exists for product "${sku}"`);
          }
        }
      }
    }

    if (importType === "BATCH_ALIASES") {
      const sku = cell(cells, "productSku");
      const code = cell(cells, "canonicalCode");
      const externalCode = cell(cells, "externalCode");
      const whCode = cell(cells, "warehouseCode");
      const product = productBySku.get(sku);

      if (!product && sku && rowErrors.length === 0) {
        addError("productSku", `Product with SKU "${sku}" does not exist`);
      }
      if (product && code && rowErrors.length === 0) {
        const batch = batchByKey.get(`${product.id}|${canonicalizeBatchCode(code)}`);
        if (!batch) {
          addError("canonicalCode", `Batch "${code}" not found for product "${sku}"`);
        }
      }
      const resolvedWhId = whCode
        ? (warehouseByCode.get(whCode)?.id ?? null)
        : jobWarehouseId || null;
      if (!resolvedWhId) {
        if (whCode) {
          addError("warehouseCode", `Warehouse "${whCode}" not found`);
        } else {
          addError(
            "warehouseCode",
            "No warehouse code in the row and the import has no default warehouse",
          );
        }
      }
      const normalized = normalizeBatchCode(externalCode);
      if (externalCode && normalized && resolvedWhId) {
        const key = `${resolvedWhId}|${normalized}`;
        if (seen.aliases.has(key)) {
          addError("externalCode", `Duplicate alias "${externalCode}" for this warehouse within the import file`);
        }
        seen.aliases.add(key);
        if (rowErrors.length === 0) {
          const existing = aliasByKey.get(key);
          if (existing) {
            addError(
              "externalCode",
              `Alias "${externalCode}" in this warehouse is already assigned to batch "${existing.batch.canonicalCode}" — conflicting assignments are never merged automatically`,
            );
          }
        }
      }
    }

    if (importType === "OPENING_STOCK") {
      const sku = cell(cells, "productSku");
      const code = cell(cells, "canonicalCode");
      const product = productBySku.get(sku);
      if (!product && sku && rowErrors.length === 0) {
        addError("productSku", `Product with SKU "${sku}" does not exist`);
      }
      if (sku && code) {
        const key = `${sku}|${canonicalizeBatchCode(code)}`;
        if (seen.openingBatches.has(key)) {
          addError("canonicalCode", `Duplicate batch "${code}" for product "${sku}" within the import file`);
        }
        seen.openingBatches.add(key);
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    }
  });

  const errorNumbers = new Set(errors.map((e) => e.rowNumber));
  const validCount = rows.length - errorNumbers.size;

  return { errors, warnings, validCount };
}
