"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  executeImport,
  getImport,
  listImports,
  listWarehouses,
  uploadImport,
  validateImport,
  type ImportJobDetailView,
  type ImportJobStatus,
  type ImportListParams,
  type ImportType,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  FileUp,
  TriangleAlert,
  CheckCircle2,
  Loader2,
  Upload,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<ImportJobStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  VALIDATING: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  VALIDATED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  PROCESSING: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  PARTIALLY_COMPLETED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  COMMITTED: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  ROLLED_BACK: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

const IMPORT_TYPE_LABEL: Record<ImportType, string> = {
  PRODUCTS: "Products",
  BATCHES: "Batches",
  BATCH_ALIASES: "Batch Aliases",
  OPENING_STOCK: "Opening Stock",
};

const IMPORT_TYPES: ImportType[] = ["PRODUCTS", "BATCHES", "BATCH_ALIASES", "OPENING_STOCK"];

/** Import types that require a warehouse. */
const WAREHOUSE_SCOPED: ImportType[] = ["BATCH_ALIASES", "OPENING_STOCK"];

const EXECUTED_STATUSES = new Set<ImportJobStatus>([
  "PROCESSING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "COMMITTED",
]);

// ---------- Upload + Review Dialog ----------

function UploadImportDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>("PRODUCTS");
  const [warehouseId, setWarehouseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJobDetailView | null>(null);
  const [validation, setValidation] = useState<{
    validRows: number;
    errorRows: number;
    status: string;
  } | null>(null);

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100, isActive: "true" }),
    enabled: open,
  });

  const reset = () => {
    setImportType("PRODUCTS");
    setWarehouseId("");
    setFile(null);
    setJob(null);
    setValidation(null);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["imports"] });
    queryClient.invalidateQueries({ queryKey: ["import", job?.id] });
  };

  const uploadMutation = useMutation({
    mutationFn: () => uploadImport(file!, importType, warehouseId || undefined),
    onSuccess: (created) => {
      setJob(created);
      toast.success(`File parsed: ${created.rowCount} data rows detected`);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to upload file");
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => validateImport(job!.id),
    onSuccess: (result) => {
      setValidation({ validRows: result.validRows, errorRows: result.errorRows, status: result.status });
      invalidate();
      if (result.status === "VALIDATED") {
        toast.success(`${result.validRows} valid rows ready to execute`);
      } else {
        toast.error(`All ${result.errorRows} rows failed validation`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Validation failed");
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => executeImport(job!.id),
    onSuccess: (result) => {
      toast.success(
        result.status === "COMPLETED"
          ? "Import executed successfully"
          : `Import finished with status ${result.status}`,
      );
      invalidate();
      setOpen(false);
      reset();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Execution failed");
    },
  });

  const needsWarehouse = WAREHOUSE_SCOPED.includes(importType);
  const canUpload = file !== null && (!needsWarehouse || warehouseId !== "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Upload className="h-4 w-4 mr-2" />
          New Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            New Import
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file (.xls is not supported). Files up to 5 MB / 5,000 data rows.
            Nothing is committed until you explicitly execute a validated import.
          </DialogDescription>
        </DialogHeader>

        {!job ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canUpload) uploadMutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Import Type</Label>
                <Select value={importType} onValueChange={(v) => setImportType(v as ImportType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {IMPORT_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Warehouse {needsWarehouse ? <span className="text-rose-500">*</span> : "(optional)"}
                </Label>
                <Select
                  value={warehouseId}
                  onValueChange={setWarehouseId}
                  disabled={!needsWarehouse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={needsWarehouse ? "Select warehouse" : "Not required"} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehousesData?.items.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">File</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-slate-400">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canUpload || uploadMutation.isPending}
                className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
              >
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload &amp; Parse
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {job.originalName} · {IMPORT_TYPE_LABEL[job.importType]}
                </p>
                <Badge variant="outline" className={STATUS_BADGE[job.status]}>
                  {job.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                {job.rowCount} data rows · sha256 {job.file.sha256.slice(0, 12)}…
              </p>
            </div>

            {/* Detected column mapping */}
            {job.mapping && Object.keys(job.mapping).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Detected Columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(job.mapping).map(([field, header]) => (
                    <Badge key={field} variant="secondary" className="text-xs font-normal">
                      {header} <span className="text-slate-400">→</span> {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sample rows */}
            {job.sampleRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Preview (first {job.sampleRows.length} rows)</p>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {job.headers.slice(0, 6).map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {job.sampleRows.map((row, i) => (
                        <TableRow key={i}>
                          {job.headers.slice(0, 6).map((h) => (
                            <TableCell key={h} className="whitespace-nowrap max-w-[220px] truncate">
                              {row[h] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Validation results */}
            {validation && (
              <div
                className={`rounded-lg border p-3 text-sm space-y-1 ${
                  validation.status === "VALIDATED"
                    ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900"
                    : "border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900"
                }`}
              >
                <p className="font-medium flex items-center gap-1.5">
                  {validation.status === "VALIDATED" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {validation.validRows} valid rows · {validation.errorRows} error rows
                    </>
                  ) : (
                    <>
                      <TriangleAlert className="h-4 w-4 text-rose-600" />
                      All {validation.errorRows} rows failed validation
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {validation.status === "VALIDATED"
                    ? "Review carefully — execution writes to the database and cannot be repeated."
                    : "Fix the file and upload it again."}
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              {validation === null && (
                <Button
                  onClick={() => validateMutation.mutate()}
                  disabled={validateMutation.isPending}
                  className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
                >
                  {validateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Validate Rows
                </Button>
              )}
              {validation?.status === "VALIDATED" && (
                <Button
                  onClick={() => executeMutation.mutate()}
                  disabled={executeMutation.isPending}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  {executeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Execute Import ({validation.validRows} rows)
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Details Dialog ----------

function ImportDetailsDialog({ importId }: { importId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: job, isLoading, isError } = useQuery({
    queryKey: ["import", importId],
    queryFn: () => getImport(importId),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["import", importId] });
    queryClient.invalidateQueries({ queryKey: ["imports"] });
  };

  const validateMutation = useMutation({
    mutationFn: () => validateImport(importId),
    onSuccess: (result) => {
      toast.success(
        result.status === "VALIDATED"
          ? `${result.validRows} valid rows ready to execute`
          : `All ${result.errorRows} rows failed validation`,
      );
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Validation failed");
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => executeImport(importId),
    onSuccess: (result) => {
      toast.success(
        result.status === "COMPLETED"
          ? "Import executed successfully"
          : `Import finished with status ${result.status}`,
      );
      invalidate();
      setConfirming(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Execution failed");
    },
  });

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canValidate = canManage && job && !EXECUTED_STATUSES.has(job.status);
  const canExecute = canManage && job?.status === "VALIDATED";

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setConfirming(false); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600 hover:text-slate-900">
          <Eye className="h-4 w-4 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import Details
          </DialogTitle>
          <DialogDescription>
            Full record of the parsed file, validation outcome, and execution summary.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !job ? (
          <div className="flex items-center gap-2 text-sm text-rose-600">
            <CircleAlert className="h-4 w-4" />
            Failed to load import details.
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div>
                <p className="text-xs text-slate-400">File</p>
                <p className="font-medium">{job.originalName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Type</p>
                <p className="font-medium">{IMPORT_TYPE_LABEL[job.importType]}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Warehouse</p>
                <p className="font-medium">{job.warehouseName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <Badge variant="outline" className={STATUS_BADGE[job.status]}>
                  {job.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">Rows</p>
                <p className="font-medium">
                  {job.rowCount} total · {job.validRows} valid · {job.errorRows} errors ·{" "}
                  {job.committedRows} committed
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Checksum (sha256)</p>
                <p className="font-mono text-xs break-all">{job.file.sha256}</p>
              </div>
            </div>

            {job.mapping && Object.keys(job.mapping).length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium">Column Mapping</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(job.mapping).map(([field, header]) => (
                    <Badge key={field} variant="secondary" className="text-xs font-normal">
                      {header} <span className="text-slate-400">→</span> {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {job.rowErrors.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium text-rose-600">
                  Row Errors ({job.rowErrors.length})
                </p>
                <div className="rounded-lg border border-rose-200 dark:border-rose-900 max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {job.rowErrors.map((e, i) => (
                        <TableRow key={`${e.rowNumber}-${i}`}>
                          <TableCell className="font-mono text-xs">{e.rowNumber}</TableCell>
                          <TableCell className="text-xs">{e.field ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {job.rowWarnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium text-amber-600">
                  Warnings ({job.rowWarnings.length})
                </p>
                <ul className="rounded-lg border border-amber-200 dark:border-amber-900 divide-y text-xs max-h-40 overflow-y-auto">
                  {job.rowWarnings.map((w, i) => (
                    <li key={`${w.rowNumber}-${i}`} className="px-3 py-1.5">
                      <span className="font-mono text-slate-400">Row {w.rowNumber}</span> ·{" "}
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.executionResult && (
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 p-3 space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Execution Summary
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {job.executionResult.created} records created ·{" "}
                  {job.executionResult.skipped.length} skipped
                  {job.executionResult.receiptId
                    ? ` · receipt ${job.executionResult.receiptId.slice(0, 8)}… (${job.executionResult.stockMovementsCreated ?? 0} stock movements)`
                    : ""}
                </p>
                {job.executionResult.skipped.length > 0 && (
                  <ul className="text-xs space-y-0.5 text-slate-600 dark:text-slate-300 max-h-32 overflow-y-auto">
                    {job.executionResult.skipped.map((s, i) => (
                      <li key={i}>
                        <span className="font-mono text-slate-400">Row {s.rowNumber}</span> —{" "}
                        {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {job.lastError && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
                {job.lastError}
              </div>
            )}

            {canManage && (canValidate || canExecute) && (
              <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                {canValidate && (
                  <Button
                    variant="outline"
                    onClick={() => validateMutation.mutate()}
                    disabled={validateMutation.isPending}
                  >
                    {validateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Validate Rows
                  </Button>
                )}
                {canExecute &&
                  (confirming ? (
                    <Button
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={() => executeMutation.mutate()}
                      disabled={executeMutation.isPending}
                    >
                      {executeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Confirm &amp; Execute
                    </Button>
                  ) : (
                    <Button
                      className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
                      onClick={() => setConfirming(true)}
                    >
                      <TriangleAlert className="h-4 w-4 mr-2" />
                      Execute Import…
                    </Button>
                  ))}
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const queryParams: ImportListParams = useMemo(
    () => ({
      page,
      pageSize: 10,
      warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
      status: statusFilter !== "all" ? (statusFilter as ImportJobStatus) : undefined,
      importType: typeFilter !== "all" ? (typeFilter as ImportType) : undefined,
    }),
    [page, warehouseFilter, statusFilter, typeFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["imports", queryParams],
    queryFn: () => listImports(queryParams),
  });

  const meta = data?.meta;
  const canPrev = Boolean(meta && meta.page > 1);
  const canNext = Boolean(meta && meta.page < meta.totalPages);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Imports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bulk-import products, batches, aliases, and opening stock from CSV/XLSX with full
            validation before anything is committed.
          </p>
        </div>
        <UploadImportDialog />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {IMPORT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {IMPORT_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={warehouseFilter}
          onValueChange={(v) => {
            setWarehouseFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehousesData?.items.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Any Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="VALIDATED">Validated</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="PARTIALLY_COMPLETED">Partially Completed</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* History Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CircleAlert className="h-8 w-8 text-rose-400" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      Failed to load imports
                    </p>
                    <p className="text-xs text-slate-400">
                      Please try again or contact support if the problem persists.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : data && data.items.length > 0 ? (
              data.items.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <FileUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[220px]" title={imp.originalName}>
                        {imp.originalName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {IMPORT_TYPE_LABEL[imp.importType]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {imp.warehouseName ? (
                      <div className="flex items-center gap-1.5">
                        <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>{imp.warehouseName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {imp.totalRows} total
                    </span>
                    {imp.errorRows > 0 && (
                      <span className="ml-1.5 text-xs text-rose-600">{imp.errorRows} err</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[imp.status] ?? ""}>
                      {imp.status === "PARTIALLY_COMPLETED" ? "PARTIAL" : imp.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {new Date(imp.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <ImportDetailsDialog importId={imp.id} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileUp className="h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      No imports found
                    </p>
                    <p className="text-xs text-slate-400">
                      Click &quot;New Import&quot; to upload your first CSV or XLSX file.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <p>
            Page {meta.page} of {meta.totalPages} · {meta.total}{" "}
            {meta.total === 1 ? "import" : "imports"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
