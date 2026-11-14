"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listInventory,
  listProducts,
  listWarehouses,
} from "@/features/inventory-api";
import {
  createWaste,
  getWasteSummary,
  listWaste,
  type WasteReason,
  type WasteRecordView,
} from "@/features/waste-api";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { ApiClientError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AlertTriangle,
  PackageOpen,
  Plus,
  Trash2,
} from "lucide-react";

const REASON_LABEL: Record<WasteReason, string> = {
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  SPOILED: "Spoiled",
  LOST: "Lost",
  OTHER: "Other",
};

// ---------- Record Waste dialog ----------

function RecordWasteDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("EXPIRED");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
    enabled: open,
  });

  const { data: products } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" }),
    enabled: open,
  });

  // Batches with stock in the selected warehouse for the selected product —
  // available quantities and expiry status come straight from the ledger.
  const { data: stockRows, isLoading: stockLoading } = useQuery({
    queryKey: ["inventory", "waste-picker", warehouseId, productId],
    queryFn: () =>
      listInventory({
        page: 1,
        pageSize: 100,
        warehouseId: warehouseId || undefined,
        productId: productId || undefined,
        sortBy: "expiryDate",
        sortOrder: "asc",
      }),
    enabled: open && !!warehouseId && !!productId,
  });

  const selectedRow = stockRows?.items.find((row) => row.batchId === batchId);
  const available = selectedRow?.availableQuantity ?? null;
  const qtyNum = Number(quantity);
  const quantityValid =
    quantity !== "" &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    (available === null || qtyNum <= available);
  const valid = warehouseId && productId && batchId && reason && quantityValid;

  const mutation = useMutation({
    mutationFn: () =>
      createWaste({
        warehouseId,
        productId,
        batchId,
        quantity: qtyNum,
        reason,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (record) => {
      toast.success(
        `Waste recorded: ${record.quantity} of ${record.productName} (${REASON_LABEL[record.reason]})`,
      );
      // Waste writes a WASTE ledger movement: every ledger-derived view and
      // the waste module's own lists/summaries must refresh.
      queryClient.invalidateQueries({ queryKey: ["waste"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batch"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setConfirmOpen(false);
      setWarehouseId("");
      setProductId("");
      setBatchId("");
      setQuantity("");
      setReason("EXPIRED");
      setNotes("");
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to record waste");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setWarehouseId("");
          setProductId("");
          setBatchId("");
          setQuantity("");
          setReason("EXPIRED");
          setNotes("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4" aria-hidden />
          Record Waste
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-500" />
            Record Waste
          </DialogTitle>
          <DialogDescription>
            Writes an immutable WASTE movement to the ledger. Expired and
            quarantined stock can be wasted; stock can never go negative.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !mutation.isPending) setConfirmOpen(true);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="waste-warehouse">Warehouse</Label>
            <Select
              value={warehouseId}
              onValueChange={(v) => {
                setWarehouseId(v);
                setProductId("");
                setBatchId("");
              }}
            >
              <SelectTrigger id="waste-warehouse">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.items.map((wh) => (
                  <SelectItem key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waste-product">Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                setBatchId("");
              }}
            >
              <SelectTrigger id="waste-product">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waste-batch">Batch</Label>
            <Select
              value={batchId}
              onValueChange={setBatchId}
              disabled={!warehouseId || !productId}
            >
              <SelectTrigger id="waste-batch">
                <SelectValue
                  placeholder={
                    !warehouseId || !productId
                      ? "Select warehouse and product first"
                      : "Select batch"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {stockLoading ? (
                  <div className="px-3 py-2 text-sm text-slate-400">Loading stock…</div>
                ) : stockRows && stockRows.items.length > 0 ? (
                  stockRows.items.map((row) => (
                    <SelectItem key={row.batchId} value={row.batchId}>
                      {row.canonicalCode} · {row.availableQuantity.toLocaleString()}{" "}
                      {row.productUnit} available
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-400">
                    No stock of this product in this warehouse.
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedRow && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <StatusBadge kind="expiry" value={selectedRow.expiryStatus} />
                <span>
                  Expires {new Date(selectedRow.expiryDate).toLocaleDateString()} (
                  {selectedRow.daysToExpiry <= 0 ? "expired" : `in ${selectedRow.daysToExpiry}d`}) ·
                  Available:{" "}
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {selectedRow.availableQuantity.toLocaleString()} {selectedRow.productUnit}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waste-quantity">Quantity</Label>
            <Input
              id="waste-quantity"
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.0000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={quantity !== "" && !quantityValid}
            />
            {available !== null && quantity !== "" && !quantityValid && (
              <p className="text-xs text-rose-600" role="alert">
                {qtyNum <= 0
                  ? "Quantity must be greater than zero."
                  : `Cannot exceed available stock (${available}).`}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waste-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as WasteReason)}>
              <SelectTrigger id="waste-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_LABEL) as WasteReason[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waste-notes">Notes (optional)</Label>
            <Input
              id="waste-notes"
              placeholder="What happened?"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={!valid || mutation.isPending}
            className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
          >
            Review &amp; Record
          </Button>
        </form>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Record this waste?"
          description={`${qtyNum.toLocaleString()} ${selectedRow?.productUnit ?? "units"} of ${
            stockRows?.items.find((r) => r.batchId === batchId)?.productName ?? "the selected product"
          } (${REASON_LABEL[reason]}) will be permanently deducted from the stock ledger. This cannot be undone.`}
          confirmLabel="Record waste"
          onConfirm={() => mutation.mutate()}
          isPending={mutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Summary cards (ADMIN/MANAGER only — the endpoint is restricted) ----------

function WasteSummaryCards() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["waste", "summary"],
    queryFn: () => getWasteSummary(),
  });

  if (isError) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <PackageOpen className="h-3.5 w-3.5" aria-hidden />
            Total Wasted
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1 text-3xl font-semibold font-mono text-rose-600 dark:text-rose-400">
              {data!.totalQuantity.toLocaleString()}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">units removed from the ledger</p>
        </div>
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Waste Records
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1 text-3xl font-semibold font-mono text-slate-900 dark:text-white">
              {data!.totalRecords.toLocaleString()}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">recorded waste events</p>
        </div>
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Top Reason
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : data!.byReason.length > 0 ? (
            <>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                {REASON_LABEL[data!.byReason[0].reason]}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {data!.byReason[0].totalQuantity.toLocaleString()} units across{" "}
                {data!.byReason[0].records} records
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No waste recorded yet.</p>
          )}
        </div>
      </div>

      {data && data.byReason.length > 0 && (
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Breakdown by reason
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.byReason.map((r) => (
              <StatusBadge
                key={r.reason}
                kind="wasteReason"
                value={r.reason}
                label={`${REASON_LABEL[r.reason]}: ${r.totalQuantity.toLocaleString()} (${r.records})`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const { user } = useAuth();
  const canViewSummary = can(user, "waste.summary");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
  });

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 10,
      sortBy: "recordedAt" as const,
      sortOrder: "desc" as const,
      search: search || undefined,
      warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
      reason: reasonFilter !== "all" ? (reasonFilter as WasteReason) : undefined,
    }),
    [page, search, warehouseFilter, reasonFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["waste", queryParams],
    queryFn: () => listWaste(queryParams),
  });

  const meta = data?.meta;

  const resetFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setReasonFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Waste"
        description="Recorded food waste. Every entry is an immutable WASTE movement in the stock ledger."
        actions={<RecordWasteDialog />}
      />

      {canViewSummary && <WasteSummaryCards />}

      {/* Filters */}
      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          label: "Search waste records",
          placeholder: "Search product, SKU, batch or notes…",
        }}
        onReset={resetFilters}
        resetDisabled={search === "" && warehouseFilter === "all" && reasonFilter === "all"}
      >
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
            {warehouses?.items.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={reasonFilter}
          onValueChange={(v) => {
            setReasonFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue placeholder="Any Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Reason</SelectItem>
            {(Object.keys(REASON_LABEL) as WasteReason[]).map((r) => (
              <SelectItem key={r} value={r}>
                {REASON_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* History table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableState
              isLoading={isLoading}
              error={isError ? error : undefined}
              onRetry={() => void refetch()}
              empty={
                !isLoading && !isError && (!data || data.items.length === 0)
                  ? {
                      icon: PackageOpen,
                      title: "No waste recorded",
                      hint: "Expired, damaged or spoiled stock recorded here appears in the ledger.",
                    }
                  : null
              }
              colSpan={7}
              skeletonRows={5}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="font-medium truncate max-w-[220px]">{record.productName}</p>
                      <p className="text-xs text-slate-400 font-mono">{record.productSku}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                      {record.canonicalCode}
                    </code>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {record.warehouseName}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-rose-600 dark:text-rose-400">
                    −{record.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="wasteReason" value={record.reason} />
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    <div>
                      <p>{new Date(record.recordedAt).toLocaleDateString()}</p>
                      <p className="text-xs text-slate-400">{record.recordedByName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm max-w-[200px]">
                    <span className="truncate block" title={record.notes ?? undefined}>
                      {record.notes ?? "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
