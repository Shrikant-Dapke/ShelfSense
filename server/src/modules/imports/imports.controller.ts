import type { RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../../utils/api-error.js";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { importsService } from "./imports.service.js";
import { IMPORT_FILE_MAX_BYTES } from "./imports.types.js";
import { validateImportSchema } from "./imports.validation.js";
import type { ImportType } from "./imports.types.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid import job ID format");
  }
  return id;
}

// Multer keeps the upload in memory only (never an untracked temp file); the
// buffer is hashed and its rows stored as job metadata, then it is released.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_FILE_MAX_BYTES,
    files: 1,
  },
});

function multerError(err: unknown): Error {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new ApiError(
        413,
        "FILE_TOO_LARGE",
        `File exceeds the ${Math.round(IMPORT_FILE_MAX_BYTES / (1024 * 1024))} MB import limit.`,
      );
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return ApiError.badRequest(
        'Unexpected upload field. The file must be posted as "file".',
      );
    }
    return ApiError.badRequest(`Upload rejected: ${err.code}`);
  }
  return (err as Error) ?? ApiError.internal();
}

/** Wraps multer so its errors surface through the normal error middleware. */
const multerUpload: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return next(multerError(err));
    next();
  });
};

const uploadFieldsSchema = z.object({
  importType: z.enum(["PRODUCTS", "BATCHES", "BATCH_ALIASES", "OPENING_STOCK"]),
  warehouseId: z
    .string()
    .uuid("Invalid warehouse ID")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

function parseUploadFields(req: Parameters<RequestHandler>[0]): {
  importType: ImportType;
  warehouseId?: string;
} {
  const parsed = uploadFieldsSchema.safeParse({
    importType: req.body?.importType,
    warehouseId: req.body?.warehouseId,
  });
  if (!parsed.success) {
    throw ApiError.validation(
      "Invalid upload parameters",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "importType",
        message: issue.message,
      })),
    );
  }
  return {
    importType: parsed.data.importType as ImportType,
    warehouseId: parsed.data.warehouseId,
  };
}

function requireFile(
  req: Parameters<RequestHandler>[0],
): { originalname: string; buffer: Buffer; size: number; mimetype: string } {
  const file = (req as { file?: Express.Multer.File }).file;
  if (!file) {
    throw ApiError.badRequest('No file uploaded. Attach a CSV/XLSX file to the "file" field.');
  }
  return file;
}

export const uploadImport: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const file = requireFile(req);
      const fields = parseUploadFields(req);
      const job = await importsService.uploadImport(
        {
          originalname: file.originalname,
          buffer: file.buffer,
          size: file.size,
          mimetype: file.mimetype,
        },
        fields,
        req,
      );
      sendSuccess(res, job, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const listImports: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await importsService.getImportHistory(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getImport: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const job = await importsService.getImportById(id);
      sendSuccess(res, job);
    } catch (err) {
      next(err);
    }
  })();
};

export const previewImport: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const preview = await importsService.previewImport(id);
      sendSuccess(res, preview);
    } catch (err) {
      next(err);
    }
  })();
};

export const validateImport: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const parsed = validateImportSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw ApiError.validation(
          "Invalid validation request",
          parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            message: issue.message,
          })),
        );
      }
      const result = await importsService.validateImport(id, parsed.data, req);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  })();
};

export const executeImport: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const result = await importsService.executeImport(id, req);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  })();
};

export { multerUpload };
