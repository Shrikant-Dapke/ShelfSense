import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { ApiError } from "../../utils/api-error.js";
import { IMPORT_FILE_MAX_BYTES, IMPORT_MAX_ROWS } from "./imports.types.js";

export type ImportFormat = "CSV" | "XLSX";

export const SUPPORTED_EXTENSIONS = [".csv", ".xlsx"];
export const SUPPORTED_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // browsers may fall back to this for xlsx
];

/** Validates extension/MIME/size before any parsing happens. */
export function assertFileAcceptable(file: {
  originalname: string;
  size: number;
  mimetype: string;
}): ImportFormat {
  const lowerName = file.originalname.toLowerCase();
  const extension = lowerName.slice(Math.max(0, lowerName.lastIndexOf(".")));

  if (extension === ".xls") {
    throw ApiError.badRequest(
      "Legacy .xls files are not supported. Please save the workbook as .xlsx or CSV.",
    );
  }

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw ApiError.badRequest("Unsupported file type. Only .csv and .xlsx files are accepted.");
  }

  if (!SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    throw ApiError.badRequest(`Unsupported MIME type "${file.mimetype}" for an import file.`);
  }

  if (file.size > IMPORT_FILE_MAX_BYTES) {
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      `File exceeds the ${Math.round(IMPORT_FILE_MAX_BYTES / (1024 * 1024))} MB import limit.`,
    );
  }

  if (file.size === 0) {
    throw ApiError.badRequest("Uploaded file is empty.");
  }

  return extension === ".csv" ? "CSV" : "XLSX";
}

/**
 * Converts a single worksheet cell into a plain string. Formula cells are NOT
 * evaluated — their cached result is used (or the cell is blank when no cached
 * value exists). Objects such as rich text and hyperlinks are flattened safely.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // Formula cell: use the cached result only — never execute anything.
  if (typeof value === "object" && "formula" in value) {
    const result = (value as { result?: unknown }).result;
    return cellToString((result ?? null) as ExcelJS.CellValue);
  }
  // Rich text / hyperlink / shared string objects.
  if (typeof value === "object") {
    if ("text" in value) {
      const text = (value as { text?: unknown }).text;
      return text === null || text === undefined ? "" : String(text);
    }
    if ("richText" in value && Array.isArray((value as { richText?: unknown[] }).richText)) {
      return ((value as { richText: Array<{ text?: string }> }).richText || [])
        .map((part) => part?.text ?? "")
        .join("");
    }
    if ("hyperlink" in value) {
      const text = (value as { text?: unknown }).text;
      return text === null || text === undefined ? "" : String(text);
    }
    if ("error" in value) {
      // Formula error cell (e.g. #REF!) — keep it visible as a marker string.
      return String((value as { error?: unknown }).error ?? "");
    }
  }
  return String(value);
}

function isRowEmpty(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/** Sane header fallback for unnamed columns. */
function headerName(raw: string | undefined, index: number): string {
  const name = (raw ?? "").trim();
  return name === "" ? `column_${index + 1}` : name;
}

export interface ParsedFile {
  format: ImportFormat;
  headers: string[];
  rows: string[][];
}

/**
 * Decides the format from an already-validated filename. Callers must run
 * `assertFileAcceptable` on the multer file first (extension/MIME/size).
 */
export function formatFromFilename(filename: string): ImportFormat {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".xls")) {
    throw ApiError.badRequest(
      "Legacy .xls files are not supported. Please save the workbook as .xlsx or CSV.",
    );
  }
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".xlsx")) return "XLSX";
  throw ApiError.badRequest("Unsupported file type. Only .csv and .xlsx files are accepted.");
}

/** Parses an accepted file into headers + data rows, enforcing the row limit. */
export async function parseImportFile(file: {
  originalname: string;
  buffer: Buffer;
}): Promise<ParsedFile> {
  const format = formatFromFilename(file.originalname);

  const parsed =
    format === "CSV" ? parseCsvFile(file.buffer) : await parseXlsxFile(file.buffer);

  if (parsed.rows.length > IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `Import files are limited to ${IMPORT_MAX_ROWS.toLocaleString()} data rows (received ${parsed.rows.length.toLocaleString()}).`,
    );
  }

  return parsed;
}

function parseCsvFile(buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf8");
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      skip_empty_lines: false, // we filter semantic empties ourselves
      relax_column_count: true,
      trim: false,
      // strict quoting: malformed files must fail loudly, never parse wrong
    }) as string[][];
  } catch (err: any) {
    throw ApiError.badRequest(
      `Unable to parse the CSV file: ${err?.message ?? "malformed content"}`,
    );
  }

  // csv-parse with skip_empty_lines=false returns empty arrays for blank lines.
  const nonEmpty = records.filter((r) => Array.isArray(r) && !isRowEmpty(r));
  if (nonEmpty.length === 0) {
    throw ApiError.badRequest("The CSV file contains no data rows.");
  }

  const headers = (nonEmpty[0] ?? []).map((h, i) => headerName(h, i));
  const rows = nonEmpty.slice(1).map((r) => r.map((c) => (c ?? "").toString()));

  return { format: "CSV", headers, rows };
}

async function parseXlsxFile(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err: any) {
    throw ApiError.badRequest(
      `Unable to parse the XLSX file: ${err?.message ?? "malformed content"}`,
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw ApiError.badRequest("The XLSX file contains no worksheets.");
  }

  const matrix: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    // exceljs row.values is 1-indexed with a null at index 0.
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(cellToString(values[i]));
    }
    if (!isRowEmpty(cells)) {
      matrix.push(cells);
    }
  });

  if (matrix.length === 0) {
    throw ApiError.badRequest("The XLSX file contains no data rows.");
  }

  const headers = matrix[0]!.map((h, i) => headerName(h, i));
  const rows = matrix.slice(1);

  return { format: "XLSX", headers, rows };
}

/** sha256 fingerprint stored as source metadata for traceability. */
export function fileChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
