import { apiFetch, apiUpload } from "@/lib/api-client";
import type { Product, Warehouse } from "@/lib/types";

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function toSearchParams(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ---------- Products ----------

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  sortBy?: "name" | "sku" | "category" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export async function listProducts(params: ProductListParams = {}): Promise<Paginated<Product>> {
  const res = await apiFetch<Product[]>(`/products${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function createProduct(input: {
  name: string;
  sku: string;
  category: string;
  unit: string;
  brand?: string;
}): Promise<Product> {
  const res = await apiFetch<Product>("/products", { method: "POST", body: input });
  return res.data;
}

// ---------- Warehouses ----------

export interface WarehouseListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: "true" | "false";
}

export async function listWarehouses(
  params: WarehouseListParams = {},
): Promise<Paginated<Warehouse>> {
  const res = await apiFetch<Warehouse[]>(`/warehouses${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function createWarehouse(input: {
  name: string;
  code: string;
  location?: string;
}): Promise<Warehouse> {
  const res = await apiFetch<Warehouse>("/warehouses", { method: "POST", body: input });
  return res.data;
}

// ---------- Receipts ----------

export interface ReceiptItemPayload {
  productId: string;
  batchId?: string;
  canonicalCode: string;
  manufacturingDate?: string;
  receiptDate?: string;
  expiryDate: string;
  supplierName?: string;
  quantity: number;
  unitCost?: number;
}

export interface CreateReceiptPayload {
  warehouseId: string;
  supplierName?: string;
  referenceNo?: string;
  receivedAt?: string;
  items: ReceiptItemPayload[];
  idempotencyKey?: string;
}

export interface ReceiptItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  manufacturingDate: string | null;
  receiptDate: string | null;
  expiryDate: string;
  supplierName: string | null;
  quantity: number;
  unitCost: number | null;
}

export interface ReceiptView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  supplierName: string | null;
  referenceNo: string | null;
  receivedAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: ReceiptItemView[];
}

export interface ReceiptListParams {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  supplierName?: string;
  sortBy?: "receivedAt" | "createdAt" | "supplierName" | "referenceNo";
  sortOrder?: "asc" | "desc";
}

export async function listReceipts(params: ReceiptListParams = {}): Promise<Paginated<ReceiptView>> {
  const res = await apiFetch<ReceiptView[]>(`/receipts${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getReceipt(id: string): Promise<ReceiptView> {
  const res = await apiFetch<ReceiptView>(`/receipts/${id}`);
  return res.data;
}

export async function createReceipt(payload: CreateReceiptPayload): Promise<ReceiptView> {
  const res = await apiFetch<ReceiptView>("/receipts", { method: "POST", body: payload });
  return res.data;
}

// ---------- Inventory / Stock ----------

export interface InventoryItemView {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productUnit: string;
  batchId: string;
  canonicalCode: string;
  manufacturingDate: string | null;
  receiptDate: string | null;
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  availableQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  lastMovementAt: string | null;
}

export interface InventoryListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string;
  category?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  lowStock?: "true" | "false";
  sortBy?: "productName" | "productSku" | "canonicalCode" | "expiryDate" | "availableQuantity" | "warehouseName";
  sortOrder?: "asc" | "desc";
}

export async function listInventory(params: InventoryListParams = {}): Promise<Paginated<InventoryItemView>> {
  const res = await apiFetch<InventoryItemView[]>(`/inventory${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export interface InventorySummary {
  totalItems: number;
  totalMovements: number;
  pendingCounts: number;
  expiredBatches: number;
}

export async function getInventorySummary(warehouseId?: string): Promise<InventorySummary> {
  const qs = warehouseId ? `?warehouseId=${warehouseId}` : "";
  const res = await apiFetch<InventorySummary>(`/inventory/summary${qs}`);
  return res.data;
}

/**
 * Governed ledger mutations (ADMIN/MANAGER on the server — the UI gates
 * them too). All business rules live in the inventory service; these are
 * plain calls to the existing endpoints, reused by the reconciliation UI
 * so corrections never bypass the ledger or the audit log.
 */
export interface TransferPayload {
  fromWarehouseId: string;
  toWarehouseId: string;
  batchId: string;
  quantity: number;
  referenceId?: string;
  idempotencyKey?: string;
}

export async function transferStock(
  payload: TransferPayload,
): Promise<{ transferOutId: string; transferInId: string }> {
  const res = await apiFetch<{ transferOutId: string; transferInId: string }>(
    "/inventory/transfer",
    { method: "POST", body: payload },
  );
  return res.data;
}

export interface AdjustmentPayload {
  warehouseId: string;
  batchId: string;
  /** Signed: positive adds stock, negative removes it. */
  quantity: number;
  reason: string;
  idempotencyKey?: string;
}

export interface StockMovementRow {
  id: string;
  warehouseId: string;
  batchId: string;
  movementType: MovementType;
  quantity: number;
  referenceId: string | null;
  occurredAt: string;
  createdBy: string;
  idempotencyKey: string | null;
  createdAt: string;
}

export async function adjustStock(payload: AdjustmentPayload): Promise<StockMovementRow> {
  const res = await apiFetch<StockMovementRow>("/inventory/adjust", {
    method: "POST",
    body: payload,
  });
  return res.data;
}

export type MovementType =
  | "RECEIPT"
  | "DISPATCH"
  | "WASTE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUSTMENT";

export interface MovementSummary {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  batchId: string;
  canonicalCode: string;
  productId: string;
  productName: string;
  productSku: string;
  movementType: MovementType;
  quantity: number;
  referenceId: string | null;
  occurredAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface MovementListParams {
  page?: number;
  pageSize?: number;
  sortBy?: "occurredAt" | "movementType" | "quantity" | "createdAt";
  sortOrder?: "asc" | "desc";
  warehouseId?: string;
  batchId?: string;
  productId?: string;
  movementType?: MovementType;
  fromDate?: string;
  toDate?: string;
}

export async function listMovements(
  params: MovementListParams = {},
): Promise<Paginated<MovementSummary>> {
  const res = await apiFetch<MovementSummary[]>(`/inventory/movements${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

// ---------- Dispatches ----------

export interface DispatchItemPayload {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface CreateDispatchPayload {
  warehouseId: string;
  referenceNo?: string;
  dispatchedAt?: string;
  items: DispatchItemPayload[];
  idempotencyKey?: string;
}

export interface DispatchItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: string;
  quantity: number;
}

export interface DispatchView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  referenceNo: string | null;
  dispatchedAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: DispatchItemView[];
}

export interface DispatchListParams {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  referenceNo?: string;
  sortBy?: "dispatchedAt" | "createdAt" | "referenceNo";
  sortOrder?: "asc" | "desc";
}

export async function listDispatches(params: DispatchListParams = {}): Promise<Paginated<DispatchView>> {
  const res = await apiFetch<DispatchView[]>(`/dispatches${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getDispatch(id: string): Promise<DispatchView> {
  const res = await apiFetch<DispatchView>(`/dispatches/${id}`);
  return res.data;
}

export async function createDispatch(payload: CreateDispatchPayload): Promise<DispatchView> {
  const res = await apiFetch<DispatchView>("/dispatches", { method: "POST", body: payload });
  return res.data;
}

export interface FefoAllocation {
  order: number;
  batchId: string;
  canonicalCode: string;
  batchStatus: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  receiptDate: string | null;
  availableQuantity: number;
  recommendedQuantity: number;
}

export interface FefoRecommendation {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  requestedQuantity: number;
  totalEligibleQuantity: number;
  allocatedQuantity: number;
  shortfall: number;
  allocations: FefoAllocation[];
}

export interface FefoRecommendationParams {
  warehouseId: string;
  productId: string;
  quantity: number;
}

/** Advisory only — never executes a dispatch; POST /dispatches is the sole execution authority. */
export async function getDispatchRecommendations(
  params: FefoRecommendationParams,
): Promise<FefoRecommendation> {
  const res = await apiFetch<FefoRecommendation>(
    `/dispatches/recommendations${toSearchParams(params)}`,
  );
  return res.data;
}

// ---------- Batches ----------

export type BatchStatus = "ACTIVE" | "QUARANTINED" | "RECALLED";

export interface BatchAliasView {
  id: string;
  batchId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  externalCode: string;
  normalizedCode: string;
  source: string;
  createdAt: string;
}

export interface BatchWarehouseStockView {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  availableQuantity: number;
}

export interface BatchView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productUnit: string;
  canonicalCode: string;
  manufacturingDate: string | null;
  receiptDate: string | null;
  expiryDate: string;
  daysToExpiry: number;
  expiryStatus: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  supplierName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalAvailableStock: number;
  warehouses: BatchWarehouseStockView[];
  aliases: BatchAliasView[];
}

export interface BatchListParams {
  page?: number;
  pageSize?: number;
  sortBy?: "canonicalCode" | "expiryDate" | "createdAt" | "status";
  sortOrder?: "asc" | "desc";
  productId?: string;
  status?: BatchStatus;
  warehouseId?: string;
  expiryStatus?: "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
  search?: string;
}

export async function listBatches(params: BatchListParams = {}): Promise<Paginated<BatchView>> {
  const res = await apiFetch<BatchView[]>(`/batches${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getBatch(id: string): Promise<BatchView> {
  const res = await apiFetch<BatchView>(`/batches/${id}`);
  return res.data;
}

export interface CreateBatchPayload {
  productId: string;
  canonicalCode: string;
  manufacturingDate?: string;
  receiptDate?: string;
  expiryDate: string;
  supplierName?: string;
  status?: BatchStatus;
}

export async function createBatch(payload: CreateBatchPayload): Promise<BatchView> {
  const res = await apiFetch<BatchView>("/batches", { method: "POST", body: payload });
  return res.data;
}

export interface UpdateBatchPayload {
  status?: BatchStatus;
  supplierName?: string;
  expiryDate?: string;
}

export async function updateBatch(id: string, payload: UpdateBatchPayload): Promise<BatchView> {
  const res = await apiFetch<BatchView>(`/batches/${id}`, { method: "PATCH", body: payload });
  return res.data;
}

export interface CreateBatchAliasPayload {
  warehouseId: string;
  externalCode: string;
  source?: string;
}

export async function createBatchAlias(
  batchId: string,
  payload: CreateBatchAliasPayload,
): Promise<BatchAliasView> {
  const res = await apiFetch<BatchAliasView>(`/batches/${batchId}/aliases`, {
    method: "POST",
    body: payload,
  });
  return res.data;
}

// ---------- Stock Counts ----------

export type StockCountStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface StockCountItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId: string;
  canonicalCode: string;
  expiryDate: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
}

export interface StockCountView {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: StockCountStatus;
  referenceNo: string | null;
  description: string | null;
  countedAt: string | null;
  countedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  postedByName: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: StockCountItemView[];
  totalExpectedQuantity: number;
  totalCountedQuantity: number;
  totalVariance: number;
}

export interface StockCountListParams {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "countedAt" | "status" | "referenceNo";
  sortOrder?: "asc" | "desc";
  warehouseId?: string;
  status?: StockCountStatus;
}

export async function listStockCounts(
  params: StockCountListParams = {},
): Promise<Paginated<StockCountView>> {
  const res = await apiFetch<StockCountView[]>(`/stock-counts${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getStockCount(id: string): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>(`/stock-counts/${id}`);
  return res.data;
}

export interface StockCountItemPayload {
  productId: string;
  batchId: string;
  countedQuantity: number;
}

export interface CreateStockCountPayload {
  warehouseId: string;
  referenceNo?: string;
  description?: string;
  countedAt?: string;
  items: StockCountItemPayload[];
}

export interface UpdateStockCountPayload {
  referenceNo?: string;
  description?: string;
  countedAt?: string;
  items?: StockCountItemPayload[];
}

export async function createStockCount(
  payload: CreateStockCountPayload,
): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>("/stock-counts", { method: "POST", body: payload });
  return res.data;
}

export async function updateStockCount(
  id: string,
  payload: UpdateStockCountPayload,
): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>(`/stock-counts/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return res.data;
}

export async function submitStockCount(id: string): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>(`/stock-counts/${id}/submit`, { method: "POST" });
  return res.data;
}

export async function approveStockCount(id: string): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>(`/stock-counts/${id}/approve`, { method: "POST" });
  return res.data;
}

export async function postStockCount(id: string): Promise<StockCountView> {
  const res = await apiFetch<StockCountView>(`/stock-counts/${id}/post`, { method: "POST" });
  return res.data;
}



// ---------- Imports (Phase F) ----------

export type ImportType = "PRODUCTS" | "BATCHES" | "BATCH_ALIASES" | "OPENING_STOCK";

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

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
  raw?: string[];
}

export interface ImportRowWarning {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ImportFileMeta {
  size: number;
  mime: string | null;
  sha256: string;
}

export interface ImportExecutionResult {
  created: number;
  skipped: Array<{ rowNumber: number; reason: string }>;
  receiptId?: string;
  stockMovementsCreated?: number;
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
  createdAt: string;
  updatedAt: string;
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
  sampleRows: Array<Record<string, string>>;
}

export interface ImportValidateResult {
  id: string;
  status: "VALIDATED" | "FAILED";
  importType: ImportType;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportRowError[];
  warnings: ImportRowWarning[];
  mapping: Record<string, string>;
}

export interface ImportListParams {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  status?: ImportJobStatus;
  importType?: ImportType;
}

export async function listImports(params: ImportListParams = {}): Promise<Paginated<ImportJobView>> {
  const res = await apiFetch<ImportJobView[]>(`/imports${toSearchParams(params)}`);
  return { items: res.data, meta: res.meta! };
}

export async function getImport(id: string): Promise<ImportJobDetailView> {
  const res = await apiFetch<ImportJobDetailView>(`/imports/${id}`);
  return res.data;
}

export async function getImportPreview(id: string): Promise<ImportJobDetailView> {
  const res = await apiFetch<ImportJobDetailView>(`/imports/${id}/preview`);
  return res.data;
}

export async function uploadImport(
  file: File,
  importType: ImportType,
  warehouseId?: string,
): Promise<ImportJobDetailView> {
  const formData = new FormData();
  formData.append("importType", importType);
  if (warehouseId) {
    formData.append("warehouseId", warehouseId);
  }
  formData.append("file", file);
  const res = await apiUpload<ImportJobDetailView>("/imports/upload", formData);
  return res.data;
}

export async function validateImport(
  id: string,
  payload: { columnMapping?: Record<string, string>; warehouseId?: string } = {},
): Promise<ImportValidateResult> {
  const res = await apiFetch<ImportValidateResult>(`/imports/${id}/validate`, {
    method: "POST",
    body: payload,
  });
  return res.data;
}

export async function executeImport(id: string): Promise<ImportJobDetailView> {
  const res = await apiFetch<ImportJobDetailView>(`/imports/${id}/execute`, { method: "POST" });
  return res.data;
}
