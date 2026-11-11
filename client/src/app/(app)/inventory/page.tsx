"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listInventory,
  listMovements,
  listWarehouses,
  type InventoryItemView,
  type MovementSummary,
} from "@/features/inventory-api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  History,
  PackageSearch,
  Search,
} from "lucide-react";

const EXPIRY_BADGE: Record<InventoryItemView["expiryStatus"], string> = {
  SAFE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  MONITOR: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  CRITICAL: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  EXPIRED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

const EXPIRY_LABEL: Record<InventoryItemView["expiryStatus"], string> = {
  SAFE: "Safe",
  MONITOR: "Monitor",
  WARNING: "Warning",
  CRITICAL: "Critical",
  EXPIRED: "Expired",
};

const MOVEMENT_BADGE: Record<MovementSummary["movementType"], string> = {
  RECEIPT: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  DISPATCH: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  WASTE: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  TRANSFER_IN: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  TRANSFER_OUT: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  ADJUSTMENT: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
};

// ---------- Movement History Dialog ----------

function MovementsDialog({ item }: { item: InventoryItemView }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["movements", item.batchId, item.warehouseId, page],
    queryFn: () =>
      listMovements({
        batchId: item.batchId,
        warehouseId: item.warehouseId,
        page,
        pageSize: 10,
        sortBy: "occurredAt",
        sortOrder: "desc",
      }),
    enabled: open,
  });

  const meta = data?.meta;
  const canPrev = Boolean(meta && meta.page > 1);
  const canNext = Boolean(meta && meta.page < meta.totalPages);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setPage(1); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600 hover:text-slate-900">
          <History className="h-4 w-4 mr-1" />
          Movements
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Ledger Movements
          </DialogTitle>
          <DialogDescription>
            {item.productName} ({item.productSku}) · batch{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
              {item.canonicalCode}
            </code>{" "}
            at {item.warehouseName}. Every quantity below is an immutable ledger entry.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Occurred</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <CircleAlert className="h-6 w-6 text-rose-400" />
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Failed to load movements
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((m) => {
                  // RECEIPT / TRANSFER_IN add stock; DISPATCH / WASTE /
                  // TRANSFER_OUT remove it; ADJUSTMENT quantities are stored
                  // already signed and shown as-is.
                  const sign =
                    m.movementType === "RECEIPT" || m.movementType === "TRANSFER_IN"
                      ? "+"
                      : m.movementType === "ADJUSTMENT"
                        ? ""
                        : "−";
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Badge variant="outline" className={MOVEMENT_BADGE[m.movementType]}>
                          {m.movementType.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {sign}
                        {m.quantity}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                        {new Date(m.occurredAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                        {m.createdByName}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                    No movements recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <p>
              Page {meta.page} of {meta.totalPages} · {meta.total} movements
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [lowStockFilter, setLowStockFilter] = useState("all");

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 10,
      sortBy: "expiryDate" as const,
      sortOrder: "asc" as const,
      search: search || undefined,
      warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
      expiryStatus: expiryFilter !== "all" ? (expiryFilter as InventoryItemView["expiryStatus"]) : undefined,
      lowStock: lowStockFilter !== "all" ? (lowStockFilter as "true" | "false") : undefined,
    }),
    [page, search, warehouseFilter, expiryFilter, lowStockFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["inventory", queryParams],
    queryFn: () => listInventory(queryParams),
  });

  const meta = data?.meta;
  const canPrev = Boolean(meta && meta.page > 1);
  const canNext = Boolean(meta && meta.page < meta.totalPages);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Inventory
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Live stock balances derived from the immutable movement ledger — product, batch, and
          warehouse level.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input
            placeholder="Search product, SKU or batch…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
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
          value={expiryFilter}
          onValueChange={(v) => {
            setExpiryFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue placeholder="Any Expiry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Expiry</SelectItem>
            <SelectItem value="SAFE">Safe (&gt;30d)</SelectItem>
            <SelectItem value="MONITOR">Monitor (≤30d)</SelectItem>
            <SelectItem value="WARNING">Warning (≤14d)</SelectItem>
            <SelectItem value="CRITICAL">Critical (≤6d)</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={lowStockFilter}
          onValueChange={(v) => {
            setLowStockFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Any Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Stock</SelectItem>
            <SelectItem value="true">Low stock only</SelectItem>
            <SelectItem value="false">Normal stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stock Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Last Movement</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CircleAlert className="h-8 w-8 text-rose-400" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      Failed to load inventory
                    </p>
                    <p className="text-xs text-slate-400">
                      Please try again or contact support if the problem persists.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : data && data.items.length > 0 ? (
              data.items.map((item) => (
                <TableRow key={`${item.warehouseId}-${item.batchId}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Boxes className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[220px]">{item.productName}</p>
                        <p className="text-xs text-slate-400 font-mono">{item.productSku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                      {item.canonicalCode}
                    </code>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {item.warehouseName}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono font-medium">
                      {item.availableQuantity.toLocaleString()}
                    </span>{" "}
                    <span className="text-xs text-slate-400">{item.productUnit}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={EXPIRY_BADGE[item.expiryStatus]}>
                        {EXPIRY_LABEL[item.expiryStatus]}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {item.daysToExpiry <= 0
                          ? "expired"
                          : `in ${item.daysToExpiry}d`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {item.lastMovementAt
                      ? new Date(item.lastMovementAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <MovementsDialog item={item} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <PackageSearch className="h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      No inventory records found
                    </p>
                    <p className="text-xs text-slate-400">
                      Stock appears here once receipts are processed or opening stock is imported.
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
            {meta.total === 1 ? "stock record" : "stock records"}
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
