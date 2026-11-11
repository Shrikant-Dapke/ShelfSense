import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type {
  ImportJobDetailView,
  ImportJobMetadata,
  ImportJobStatus,
  ImportJobView,
  ImportType,
} from "./imports.types.js";
import { IMPORT_PREVIEW_SAMPLE_ROWS } from "./imports.types.js";
import type { ImportQuery } from "./imports.validation.js";

type ImportJobRow = Prisma.ImportJobGetPayload<{ include: { warehouse: true } }>;

function metadataOf(job: ImportJobRow): ImportJobMetadata {
  return (job.metadata ?? {}) as unknown as ImportJobMetadata;
}

export function toImportJobView(job: ImportJobRow): ImportJobView {
  const meta = metadataOf(job);
  return {
    id: job.id,
    warehouseId: job.warehouseId,
    warehouseName: job.warehouse?.name ?? null,
    warehouseCode: job.warehouse?.code ?? null,
    importType: meta.importType ?? (job.importType as ImportType),
    filename: job.filename,
    originalName: job.originalName,
    status: job.status as ImportJobStatus,
    totalRows: job.totalRows,
    validRows: job.validRows,
    errorRows: job.errorRows,
    committedRows: job.committedRows,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    createdBy: job.createdBy,
  };
}

export function toImportJobDetailView(job: ImportJobRow): ImportJobDetailView {
  const meta = metadataOf(job);
  const mapping = meta.mapping ?? null;
  return {
    ...toImportJobView(job),
    headers: meta.headers ?? [],
    rowCount: meta.rowCount ?? job.totalRows,
    file: meta.file ?? { size: 0, mime: null, sha256: "" },
    mapping,
    rowErrors: meta.rowErrors ?? [],
    rowWarnings: meta.rowWarnings ?? [],
    executionResult: meta.executionResult ?? null,
    lastError: meta.lastError ?? null,
    sampleRows: buildSampleRows(meta, mapping),
  };
}

function buildSampleRows(
  meta: ImportJobMetadata,
  mapping: Record<string, string> | null,
): Array<Record<string, string>> {
  const headers = meta.headers ?? [];
  return (meta.rows ?? []).slice(0, IMPORT_PREVIEW_SAMPLE_ROWS).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    // Also expose mapped field names for the mapping UI convenience.
    if (mapping) {
      for (const [field, header] of Object.entries(mapping)) {
        const i = headers.indexOf(header);
        if (i >= 0) row[field] = cells[i] ?? "";
      }
    }
    return row;
  });
}

export const importsRepository = {
  async createJob(data: {
    warehouseId: string | null;
    importType: ImportType;
    filename: string;
    originalName: string;
    totalRows: number;
    metadata: ImportJobMetadata;
    createdBy: string;
  }) {
    return prisma.importJob.create({
      data: {
        warehouseId: data.warehouseId,
        importType: data.importType,
        filename: data.filename,
        originalName: data.originalName,
        status: "PENDING",
        totalRows: data.totalRows,
        metadata: data.metadata as unknown as Prisma.InputJsonValue,
        createdBy: data.createdBy,
      },
      include: { warehouse: true },
    });
  },

  async getJobById(id: string): Promise<ImportJobRow | null> {
    return prisma.importJob.findUnique({ where: { id }, include: { warehouse: true } });
  },

  async updateJob(
    id: string,
    data: {
      status?: ImportJobStatus | Prisma.EnumImportStatusFieldUpdateOperationsInput["set"];
      validRows?: number;
      errorRows?: number;
      committedRows?: number;
      warehouseId?: string | null;
      metadata?: ImportJobMetadata;
    },
  ): Promise<ImportJobRow> {
    return prisma.importJob.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status as Prisma.EnumImportStatusFieldUpdateOperationsInput["set"] } : {}),
        ...(data.validRows !== undefined ? { validRows: data.validRows } : {}),
        ...(data.errorRows !== undefined ? { errorRows: data.errorRows } : {}),
        ...(data.committedRows !== undefined ? { committedRows: data.committedRows } : {}),
        ...(data.warehouseId !== undefined ? { warehouseId: data.warehouseId } : {}),
        ...(data.metadata
          ? { metadata: data.metadata as unknown as Prisma.InputJsonValue }
          : {}),
      },
      include: { warehouse: true },
    });
  },

  async getImportHistory(query: ImportQuery): Promise<{ items: ImportJobView[]; total: number }> {
    const where: Prisma.ImportJobWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.importType ? { importType: query.importType } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.importJob.findMany({
        where,
        include: { warehouse: true },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.importJob.count({ where }),
    ]);

    return { items: jobs.map(toImportJobView), total };
  },
};

export default importsRepository;
