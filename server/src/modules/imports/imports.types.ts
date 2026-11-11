export type ImportType = "PRODUCTS" | "BATCHES" | "BATCH_ALIASES" | "OPENING_STOCK";

export const IMPORT_TYPES: ImportType[] = ["PRODUCTS", "BATCHES", "BATCH_ALIASES", "OPENING_STOCK"];

export type ImportJobStatus =
  | "PENDING"
  | "VALIDATING"
  | "VALIDATED"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "COMMITTED"
  | "FAILED"
  | "ROLLED_BACK";

/** Warehouse-scoped imports need a warehouse (job-level or per row). */
export const WAREHOUSE_SCOPED_IMPORTS: ImportType[] = ["BATCH_ALIASES", "OPENING_STOCK"];

/** Hard limits (mirrored by multer limits and parse guards). */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_PREVIEW_SAMPLE_ROWS = 10;

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
  /** The offending raw row for context (kept for reporting; cells joined). */
  raw: string[];
}

export interface ImportRowWarning {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ImportExecutionResult {
  created: number;
  skipped: Array<{ rowNumber: number; reason: string }>;
  receiptId?: string;
  stockMovementsCreated?: number;
}

export interface ImportFileMeta {
  size: number;
  mime: string | null;
  sha256: string;
}

export interface ImportJobMetadata {
  importType: ImportType;
  headers: string[];
  rows: string[][];
  rowCount: number;
  file: ImportFileMeta;
  /** field -> header name chosen for mapping. */
  mapping?: Record<string, string>;
  rowErrors?: ImportRowError[];
  rowWarnings?: ImportRowWarning[];
  executionResult?: ImportExecutionResult;
  lastError?: string;
}

export interface ImportJobView {
  id: string;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  importType: ImportType;
  filename: string;
  originalName: string;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  committedRows: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ImportJobDetailView extends ImportJobView {
  headers: string[];
  rowCount: number;
  file: ImportFileMeta;
  mapping: Record<string, string> | null;
  rowErrors: ImportRowError[];
  rowWarnings: ImportRowWarning[];
  executionResult: ImportExecutionResult | null;
  lastError: string | null;
  /** First sample rows for preview (header-keyed objects). */
  sampleRows: Array<Record<string, string>>;
}
