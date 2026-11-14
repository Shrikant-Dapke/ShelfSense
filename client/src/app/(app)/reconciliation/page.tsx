"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustStock,
  listProducts,
  listWarehouses,
  transferStock,
  type InventoryItemView,
} from "@/features/inventory-api";
import {
  getReconciliation,
  getReconciliationOverview,
  type ReconciliationBatchRow,
  type ReconciliationCondition,
} from "@/features/reconciliation-api";
import { useAuth } from "@/features/auth/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { statusStyle } from "@/components/status-styles";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  Layers,
  PackageOpen,
  Scale,
  SlidersHorizontal,
  Timer,
} from "lucide-react";

const RECON_CONDITIONS: ReconciliationCondition[] = [
  "MULTI_WAREHOUSE",
  "MULTI_ALIAS",
  "EXPIRED_STOCK",
  "OPEN_VARIANCE",
  "INCONSISTENT",
];

function fmtQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Invalidates every ledger-derived view after a governed correction. */
function useCorrectionInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["batches"] });
    queryClient.invalidateQueries({ queryKey: ["batch"] });
    queryClient.invalidateQueries({ queryKey: ["movements"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

// ---------- Overview cards ----------

function OverviewCards({ warehouseId }: { warehouseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reconciliation", "overview", warehouseId],
    queryFn: () => getReconciliationOverview(warehouseId !== "all" ? { warehouseId } : {}),
  });

  if (isError) return null;

  const cards = [
    {
      icon: Layers,
      label: "Batches with stock",
      value: data?.batchesWithStock,
      hint: "with positive ledger balance",
    },
    {
      icon: ArrowLeftRight,
      label: "Multi-warehouse",
      value: data?.multiWarehouseBatches,
      hint: "batches spread across warehouses",
    },
    {
      icon: Timer,
      label: "Expired stock",
      value: data?.expiredStockBatches,
      hint: "batches expired while holding stock",
    },
    {
      icon: ClipboardList,
      label: "Open variances",
      value: data?.openVarianceBatches,
      hint: "counts awaiting posting",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <card.icon className="h-3.5 w-3.5" aria-hidden />
            {card.label}
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-semibold font-mono text-slate-900 dark:text-white">
              {(card.value ?? 0).toLocaleString()}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- Transfer dialog (existing governed endpoint) ----------

function TransferDialog({ row, onClose }: { row: ReconciliationBatchRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = useCorrectionInvalidation();
  const holding = row.warehouses.filter((w) => w.availableQuantity > 0);
  const [fromWarehouseId, setFromWarehouseId] = useState(holding[0]?.warehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
  });

  const fromWh = holding.find((w) => w.warehouseId === fromWarehouseId);
  const qtyNum = Number(quantity);
  const valid =
    fromWarehouseId &&
    toWarehouseId &&
    toWarehouseId !== fromWarehouseId &&
    quantity !== "" &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    fromWh !== undefined &&
    qtyNum <= fromWh.availableQuantity;

  const mutation = useMutation({
    mutationFn: () =>
      transferStock({
        fromWarehouseId,
        toWarehouseId,
        batchId: row.batchId,
        quantity: qtyNum,
        // One-shot key: a double-click replays as 409 instead of moving stock twice.
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success(`Transferred ${fmtQty(qtyNum)} of ${row.productName}`);
      invalidate();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Transfer failed");
    },
  });

  return (
    <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-sky-600" aria-hidden />
        Transfer stock
      </p>
      <p className="text-xs text-slate-500">
        Uses the governed <code className="font-mono">POST /inventory/transfer</code> endpoint —
        TRANSFER_OUT + TRANSFER_IN pair, row-locked, audited.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tr-from">From warehouse</Label>
          <Select value={fromWarehouseId} onValueChange={(v) => { setFromWarehouseId(v); setToWarehouseId(""); }}>
            <SelectTrigger id="tr-from">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {holding.map((w) => (
                <SelectItem key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseCode} · {fmtQty(w.availableQuantity)} {row.productUnit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tr-to">To warehouse</Label>
          <Select value={toWarehouseId} onValueChange={setToWarehouseId} disabled={!fromWarehouseId}>
            <SelectTrigger id="tr-to">
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.items
                .filter((wh) => wh.id !== fromWarehouseId)
                .map((wh) => (
                  <SelectItem key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tr-qty">
            Quantity{fromWh ? ` (max ${fmtQty(fromWh.availableQuantity)})` : ""}
          </Label>
          <Input
            id="tr-qty"
            type="number"
            step="0.0001"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
      >
        {mutation.isPending ? "Transferring…" : "Confirm transfer"}
      </Button>
    </div>
  );
}

// ---------- Adjustment dialog (existing governed endpoint) ----------

function AdjustDialog({ row, onClose }: { row: ReconciliationBatchRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = useCorrectionInvalidation();
  const [warehouseId, setWarehouseId] = useState(row.warehouses[0]?.warehouseId ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const qtyNum = Number(quantity);
  const valid = warehouseId && quantity !== "" && Number.isFinite(qtyNum) && qtyNum !== 0 && reason.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      adjustStock({
        warehouseId,
        batchId: row.batchId,
        quantity: qtyNum,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success(`Adjustment recorded for ${row.canonicalCode}`);
      invalidate();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Adjustment failed");
    },
  });

  return (
    <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-amber-600" aria-hidden />
        Record adjustment
      </p>
      <p className="text-xs text-slate-500">
        Uses the governed <code className="font-mono">POST /inventory/adjust</code> endpoint — signed
        ADJUSTMENT movement, refuses negative results, audited.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="adj-wh">Warehouse</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger id="adj-wh">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {row.warehouses.map((w) => (
                <SelectItem key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseCode} · {fmtQty(w.availableQuantity)} {row.productUnit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="adj-qty">Signed quantity (+ adds / − removes)</Label>
          <Input
            id="adj-qty"
            type="number"
            step="0.0001"
            value={quantity}
            placeholder="e.g. -5 or 2.5"
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="adj-reason">Reason</Label>
          <Input
            id="adj-reason"
            value={reason}
            maxLength={500}
            placeholder="Why is the ledger being corrected?"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
      >
        {mutation.isPending ? "Recording…" : "Confirm adjustment"}
      </Button>
    </div>
  );
}

// ---------- Drill-down dialog ----------

function BatchDetailDialog({ row, onClose }: { row: ReconciliationBatchRow; onClose: () => void }) {
  const { user } = useAuth();
  const canCorrect = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const varianceTotal = row.openVariances.reduce((acc, v) => acc + v.variance, 0);

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <code className="text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
            {row.canonicalCode}
          </code>
          <span className="text-base font-semibold">{row.productName}</span>
          <StatusBadge kind="expiry" value={row.expiryStatus} />
          {row.batchStatus !== "ACTIVE" && (
            <StatusBadge kind="batchStatus" value={row.batchStatus} />
          )}
        </DialogTitle>
        <DialogDescription>
          {row.productSku} · {row.productCategory} · expires{" "}
          {new Date(row.expiryDate).toLocaleDateString()} (
          {row.daysToExpiry <= 0 ? "expired" : `in ${row.daysToExpiry} days`}) · total across
          warehouses: {fmtQty(row.totalQuantity)} {row.productUnit}
        </DialogDescription>
      </DialogHeader>

      {canCorrect && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowTransfer(!showTransfer); setShowAdjust(false); }}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />
            Transfer
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowAdjust(!showAdjust); setShowTransfer(false); }}>
            <SlidersHorizontal className="h-4 w-4 mr-1" />
            Adjust
          </Button>
        </div>
      )}
      {showTransfer && <TransferDialog row={row} onClose={() => { setShowTransfer(false); onClose(); }} />}
      {showAdjust && <AdjustDialog row={row} onClose={() => { setShowAdjust(false); onClose(); }} />}

      {/* Per-warehouse distribution with aliases */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Warehouse aliases</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.warehouses.map((w) => (
              <TableRow key={w.warehouseId}>
                <TableCell className="font-medium">
                  {w.warehouseName}
                  <span className="text-xs text-slate-400 ml-1.5">({w.warehouseCode})</span>
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    w.availableQuantity < 0
                      ? "text-red-600 dark:text-red-400 font-semibold"
                      : w.availableQuantity === 0
                        ? "text-slate-400"
                        : "text-slate-900 dark:text-white"
                  }`}
                >
                  {fmtQty(w.availableQuantity)} {row.productUnit}
                </TableCell>
                <TableCell>
                  {w.aliasCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {w.aliasCodes.map((code) => (
                        <code
                          key={code}
                          className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono"
                          title={`source: ${w.aliasSources.join(", ")}`}
                        >
                          {code}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">— none —</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Open stock-count variances */}
      {row.openVariances.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <Scale className="h-4 w-4" aria-hidden />
            Open stock-count variances ({fmtQty(varianceTotal)} {row.productUnit} unposted)
          </p>
          {row.openVariances.map((v, i) => (
            <div key={`${v.stockCountId}-${i}`} className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-medium">{v.warehouseCode}</span> · {v.status} count
              {v.referenceNo ? ` · ref ${v.referenceNo}` : ""}: expected{" "}
              <span className="font-mono">{fmtQty(v.expectedQuantity)}</span>, counted{" "}
              <span className="font-mono">{fmtQty(v.countedQuantity)}</span>, variance{" "}
              <span className={`font-mono font-semibold ${v.variance < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {v.variance > 0 ? "+" : ""}
                {fmtQty(v.variance)}
              </span>
              . Resolve via the stock-count workflow (approve → post).
            </div>
          ))}
        </div>
      )}

      {/* Recent ledger movements */}
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Recent ledger movements
        </p>
        {row.recentMovements.length > 0 ? (
          <div className="space-y-1.5">
            {row.recentMovements.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge kind="movement" value={m.movementType} />
                  <span className="text-slate-500">{m.warehouseCode}</span>
                  {m.referenceId && (
                    <span className="text-slate-400 font-mono truncate max-w-[120px]">
                      ref {m.referenceId.slice(0, 8)}…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-medium ${m.quantity < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {m.movementType === "ADJUSTMENT" && m.quantity > 0 ? "+" : "−"}
                    {fmtQty(Math.abs(m.quantity))}
                  </span>
                  <span className="text-slate-400">{new Date(m.occurredAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No movements recorded.</p>
        )}
      </div>
    </DialogContent>
  );
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [detailRow, setDetailRow] = useState<ReconciliationBatchRow | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
  });

  const { data: products } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" }),
  });

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 10,
      sortBy: "canonicalCode" as const,
      sortOrder: "asc" as const,
      search: search || undefined,
      warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
      productId: productFilter !== "all" ? productFilter : undefined,
      condition: conditionFilter !== "all" ? (conditionFilter as ReconciliationCondition) : undefined,
    }),
    [page, search, warehouseFilter, productFilter, conditionFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reconciliation", queryParams],
    queryFn: () => getReconciliation(queryParams),
  });

  const meta = data?.meta;

  const resetFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setProductFilter("all");
    setConditionFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        description="Read-only cross-warehouse comparison of canonical batches. Every quantity is derived from the immutable stock ledger; aliases are shown but never merged, and corrections happen through the governed transfer, adjustment and stock-count workflows."
      />

      <OverviewCards warehouseId={warehouseFilter} />

      {/* Filters */}
      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          label: "Search reconciliation",
          placeholder: "Search batch, alias, product or SKU…",
        }}
        onReset={resetFilters}
        resetDisabled={
          search === "" &&
          warehouseFilter === "all" &&
          productFilter === "all" &&
          conditionFilter === "all"
        }
      >
        <Select
          value={warehouseFilter}
          onValueChange={(v) => {
            setWarehouseFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[210px]">
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
          value={productFilter}
          onValueChange={(v) => {
            setProductFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[210px]">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products?.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={conditionFilter}
          onValueChange={(v) => {
            setConditionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Any Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Condition</SelectItem>
            {RECON_CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {statusStyle("reconCondition", c).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Comparison table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Distribution</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead className="text-right">Details</TableHead>
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
                      title: "Nothing to reconcile",
                      hint: "No batches with ledger history match the current filters.",
                    }
                  : null
              }
              colSpan={7}
              skeletonRows={5}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((row) => {
                const varianceTotal = row.openVariances.reduce((acc, v) => acc + v.variance, 0);
                return (
                  <TableRow key={row.batchId}>
                    <TableCell>
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                        {row.canonicalCode}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[200px]">{row.productName}</p>
                        <p className="text-xs text-slate-400 font-mono">{row.productSku}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                        {row.warehouses.map((w) => (
                          <Badge
                            key={w.warehouseId}
                            variant="outline"
                            className={
                              w.availableQuantity > 0
                                ? "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                                : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                            }
                            title={`${w.warehouseName}${w.aliasCodes.length > 0 ? ` · aliases: ${w.aliasCodes.join(", ")}` : ""}`}
                          >
                            {w.warehouseCode} <span className="font-mono ml-1">{fmtQty(w.availableQuantity)}</span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-slate-900 dark:text-white">
                      {fmtQty(row.totalQuantity)} <span className="text-xs font-sans text-slate-400">{row.productUnit}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="expiry" value={row.expiryStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {row.conditions.map((c) => (
                          <StatusBadge key={c} kind="reconCondition" value={c} />
                        ))}
                        {row.conditions.length === 0 && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {row.openVariances.length > 0 && (
                          <Badge
                            variant="outline"
                            className={statusStyle("reconCondition", "OPEN_VARIANCE").className}
                            title="Open stock-count variance"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" aria-hidden />
                            {varianceTotal > 0 ? "+" : ""}
                            {fmtQty(varianceTotal)}
                          </Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setDetailRow(row)}>
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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

      {/* Drill-down dialog */}
      <Dialog open={detailRow !== null} onOpenChange={(open) => !open && setDetailRow(null)}>
        {detailRow && <BatchDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />}
      </Dialog>
    </div>
  );
}
