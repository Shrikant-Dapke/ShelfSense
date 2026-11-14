"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listInventory,
  listMovements,
  listWarehouses,
  type InventoryItemView,
} from "@/features/inventory-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Boxes, History, Search } from "lucide-react";

// ---------- Movement History Dialog ----------

function MovementsDialog({ item }: { item: InventoryItemView }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
              <TableState
                isLoading={isLoading}
                error={isError ? error : undefined}
                onRetry={() => void refetch()}
                empty={
                  !isLoading && !isError && (!data || data.items.length === 0)
                    ? { title: "No movements recorded yet" }
                    : null
                }
                colSpan={4}
                skeletonRows={4}
              />
              {!isLoading &&
                !isError &&
                data?.items.map((m) => {
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
                        <StatusBadge kind="movement" value={m.movementType} />
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
                })}
            </TableBody>
          </Table>
        </div>

        {meta && meta.total > 0 ? (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            onPageChange={setPage}
          />
        ) : null}
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inventory", queryParams],
    queryFn: () => listInventory(queryParams),
  });

  const meta = data?.meta;
  const hasActiveFilters =
    search !== "" || warehouseFilter !== "all" || expiryFilter !== "all" || lowStockFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setExpiryFilter("all");
    setLowStockFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Live stock balances derived from the immutable movement ledger — product, batch, and warehouse level."
      />

      {/* Filters */}
      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          label: "Search inventory",
          placeholder: "Search product, SKU or batch…",
          className: "sm:max-w-xs",
        }}
        onReset={resetFilters}
        resetDisabled={!hasActiveFilters}
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
      </FilterBar>

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
            <TableState
              isLoading={isLoading}
              error={isError ? error : undefined}
              onRetry={() => void refetch()}
              empty={
                !isLoading && !isError && (!data || data.items.length === 0)
                  ? {
                      title: "No inventory records found",
                      hint: "Stock appears here once receipts are processed or opening stock is imported.",
                    }
                  : null
              }
              colSpan={7}
              skeletonRows={6}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((item) => (
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
                      <StatusBadge kind="expiry" value={item.expiryStatus} />
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
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.total > 0 ? (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
