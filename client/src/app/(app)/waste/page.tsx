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
import { getAnalyticsSummary } from "@/features/analytics-api";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { ApiClientError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MetricCard } from "@/components/metric-card";
import { FilterBar } from "@/components/filter-bar";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CircleDollarSign,
  PackageOpen,
  Percent,
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
        <Button className="">
          <Plus className="h-4 w-4" aria-hidden />
          Record Waste
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-[var(--status-danger-ink)]" />
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
                  <div className="px-3 py-2 text-sm text-ink-muted">Loading stock…</div>
                ) : stockRows && stockRows.items.length > 0 ? (
                  stockRows.items.map((row) => (
                    <SelectItem key={row.batchId} value={row.batchId}>
                      {row.canonicalCode} · {row.availableQuantity.toLocaleString()}{" "}
                      {row.productUnit} available
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-ink-muted">
                    No stock of this product in this warehouse.
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedRow && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <StatusBadge kind="expiry" value={selectedRow.expiryStatus} />
                <span>
                  Expires {new Date(selectedRow.expiryDate).toLocaleDateString()} (
                  {selectedRow.daysToExpiry <= 0 ? "expired" : `in ${selectedRow.daysToExpiry}d`}) ·
                  Available:{" "}
                  <span className="font-mono font-medium text-ink">
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
              <p className="text-xs text-[var(--status-danger-ink)]" role="alert">
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
            className=""
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
  // Rate and value come from the backend's existing cost-basis calculations.
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["waste", "analytics-30d"],
    queryFn: () => getAnalyticsSummary({ period: "30d" }),
  });

  if (isError) return null;

  const reasonData = (data?.byReason ?? []).map((row) => ({
    reason: REASON_LABEL[row.reason],
    quantity: row.totalQuantity,
  }));

  return (
    <div className="space-y-4">
      <section aria-label="Waste summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Waste"
          description="Units removed from the ledger"
          value={data?.totalQuantity}
          isLoading={isLoading}
          icon={PackageOpen}
          tone="danger"
        />
        <MetricCard
          title="Waste Records"
          description="Recorded waste events"
          value={data?.totalRecords}
          isLoading={isLoading}
          icon={Trash2}
        />
        <MetricCard
          title="Waste Rate (%)"
          description="Recorded waste ÷ received quantity × 100 (server calculated)"
          value={analytics?.waste.wastePercentOfReceived}
          isLoading={analyticsLoading}
          icon={Percent}
          tone="warning"
        />
        <MetricCard
          title="Est. Waste Value"
          description={
            analytics?.waste.estimatedValue == null
              ? "cost data unavailable — value not estimated"
              : "Cost-basis estimate from the server"
          }
          value={analytics?.waste.estimatedValue}
          isLoading={analyticsLoading}
          icon={CircleDollarSign}
          tone="danger"
        />
      </section>

      {reasonData.length > 0 ? (
        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--status-warning-ink)]" aria-hidden />
              Waste by reason
            </CardTitle>
            <CardDescription>Quantity written off for each recorded reason</CardDescription>
          </CardHeader>
          <CardContent className="h-56 pt-2 sm:h-64">
            <p className="sr-only">
              Waste quantity by reason: {reasonData.map((r) => `${r.reason} ${r.quantity}`).join(", ")}.
            </p>
            <div role="img" aria-label="Waste quantity by reason" className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reasonData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ss-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ss-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="reason" width={72} tick={{ fontSize: 11, fill: "var(--ss-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--ss-surface)",
                      color: "var(--ss-ink)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="quantity" name="Quantity" fill="var(--ss-danger)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data && data.byReason.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.byReason.map((r) => (
            <StatusBadge
              key={r.reason}
              kind="wasteReason"
              value={r.reason}
              label={`${REASON_LABEL[r.reason]}: ${r.totalQuantity.toLocaleString()} (${r.records})`}
            />
          ))}
        </div>
      ) : null}
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
        title="Waste Management"
        description="Track inventory loss and reduce avoidable waste."
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
      <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline">
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
                      <p className="text-xs text-ink-muted font-mono">{record.productSku}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-canvas ring-1 ring-hairline px-1.5 py-0.5 rounded font-mono">
                      {record.canonicalCode}
                    </code>
                  </TableCell>
                  <TableCell className="text-ink-muted text-sm">
                    {record.warehouseName}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-[var(--status-danger-ink)]">
                    −{record.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="wasteReason" value={record.reason} />
                  </TableCell>
                  <TableCell className="text-ink-muted text-sm">
                    <div>
                      <p>{new Date(record.recordedAt).toLocaleDateString()}</p>
                      <p className="text-xs text-ink-muted">{record.recordedByName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink-muted text-sm max-w-[200px]">
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
