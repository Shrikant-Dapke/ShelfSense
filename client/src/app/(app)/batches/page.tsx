"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBatch,
  createBatchAlias,
  getBatch,
  listBatches,
  listProducts,
  listWarehouses,
  updateBatch,
  type BatchStatus,
  type BatchView,
  type BatchListParams,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ScanBarcode,
  Plus,
  Eye,
  Loader2,
  Warehouse as WarehouseIcon,
  Tags,
} from "lucide-react";
import { toast } from "sonner";

function formatExpiry(days: number): string {
  if (days <= 0) return `Expired ${-days}d ago`;
  if (days <= 14) return `${days}d left`;
  return `${days}d left`;
}

// ---------- Create Batch Dialog ----------

function CreateBatchDialog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [canonicalCode, setCanonicalCode] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [status, setStatus] = useState<BatchStatus>("ACTIVE");

  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ pageSize: 100 }),
  });

  const mutation = useMutation({
    mutationFn: createBatch,
    onSuccess: (batch) => {
      toast.success(`Batch ${batch.canonicalCode} created`);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setOpen(false);
      setProductId("");
      setCanonicalCode("");
      setManufacturingDate("");
      setReceiptDate("");
      setExpiryDate("");
      setSupplierName("");
      setStatus("ACTIVE");
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to create batch");
      }
    },
  });

  const isFormValid = Boolean(
    productId && canonicalCode.trim() && expiryDate && status,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    mutation.mutate({
      productId,
      canonicalCode: canonicalCode.trim(),
      manufacturingDate: manufacturingDate
        ? new Date(manufacturingDate).toISOString()
        : undefined,
      receiptDate: receiptDate ? new Date(receiptDate).toISOString() : undefined,
      expiryDate: new Date(expiryDate).toISOString(),
      supplierName: supplierName.trim() || undefined,
      status,
    });
  };

  const canManage = can(user, "batch.manage");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
          disabled={!canManage}
          title={canManage ? undefined : "Requires ADMIN or MANAGER role"}
        >
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          New Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-teal-600" />
            Create Canonical Batch
          </DialogTitle>
          <DialogDescription>
            Register a new canonical batch code for a product. Batches are unique per product.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="batch-product">Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="batch-product" className="mt-1">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {productsData?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="batch-code">Canonical Batch Code *</Label>
            <Input
              id="batch-code"
              placeholder="e.g. LOT-APEX-2026-001"
              className="mt-1"
              value={canonicalCode}
              onChange={(e) => setCanonicalCode(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="batch-mfg">Manufacturing Date</Label>
              <Input
                id="batch-mfg"
                type="date"
                className="mt-1"
                value={manufacturingDate}
                onChange={(e) => setManufacturingDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="batch-rcpt">Receipt Date</Label>
              <Input
                id="batch-rcpt"
                type="date"
                className="mt-1"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="batch-exp">Expiry Date *</Label>
              <Input
                id="batch-exp"
                type="date"
                className="mt-1"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="batch-supplier">Supplier</Label>
              <Input
                id="batch-supplier"
                placeholder="e.g. Apex Foods Ltd"
                className="mt-1"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="batch-status">Initial Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BatchStatus)}>
              <SelectTrigger id="batch-status" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="QUARANTINED">Quarantined</SelectItem>
                <SelectItem value="RECALLED">Recalled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || mutation.isPending}
              className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Batch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Batch Details Dialog ----------

function BatchDetailsDialog({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [aliasWarehouseId, setAliasWarehouseId] = useState("");
  const [aliasCode, setAliasCode] = useState("");

  const { data: batch, isLoading } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => getBatch(batchId),
    enabled: open,
  });

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
    enabled: open,
  });

  const aliasMutation = useMutation({
    mutationFn: () =>
      createBatchAlias(batchId, {
        warehouseId: aliasWarehouseId,
        externalCode: aliasCode,
      }),
    onSuccess: (alias) => {
      toast.success(`Alias "${alias.externalCode}" registered`);
      queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setAliasCode("");
      setAliasWarehouseId("");
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to create alias");
      }
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: BatchStatus) => updateBatch(batchId, { status }),
    onSuccess: (updated) => {
      toast.success(`Batch status set to ${updated.status}`);
      queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update status");
    },
  });

  const canManage = can(user, "batch.manage");
  const aliasValid = Boolean(aliasWarehouseId && aliasCode.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600 hover:text-slate-900">
          <Eye className="h-4 w-4 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-teal-600" />
            Batch {batch?.canonicalCode ?? "..."}
          </DialogTitle>
          <DialogDescription>
            Canonical batch identity, ledger-derived stock, and warehouse aliases.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !batch ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Header info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <div>
                <p className="text-slate-500 text-xs">Canonical Code</p>
                <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                  {batch.canonicalCode}
                </code>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Product</p>
                <p className="font-medium">{batch.productName}</p>
                <p className="text-xs text-slate-500">{batch.productSku}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Expiry</p>
                <p className="font-medium">{new Date(batch.expiryDate).toLocaleDateString()}</p>
                <p className={`text-xs ${batch.expiryStatus === "EXPIRED" ? "text-rose-600" : "text-slate-500"}`}>
                  {formatExpiry(batch.daysToExpiry)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Supplier</p>
                <p className="font-medium">{batch.supplierName ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Manufactured</p>
                <p className="font-medium">
                  {batch.manufacturingDate
                    ? new Date(batch.manufacturingDate).toLocaleDateString()
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Received</p>
                <p className="font-medium">
                  {batch.receiptDate ? new Date(batch.receiptDate).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Total Available (ledger)</p>
                <p className="font-semibold text-teal-700 dark:text-teal-400">
                  {batch.totalAvailableStock.toLocaleString()} {batch.productUnit}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <StatusBadge kind="batchStatus" value={batch.status} />
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800"
                          disabled={statusMutation.isPending}
                        >
                          Change
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => statusMutation.mutate("ACTIVE")}>
                          Active
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => statusMutation.mutate("QUARANTINED")}>
                          Quarantined
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600"
                          onClick={() => statusMutation.mutate("RECALLED")}
                        >
                          Recalled
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            {/* Stock by warehouse */}
            <div className="border rounded-md">
              <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-900 flex items-center gap-2">
                <WarehouseIcon className="h-4 w-4 text-slate-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Stock by Warehouse (from stock movement ledger)
                </p>
              </div>
              {batch.warehouses.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">
                  No stock on hand for this batch in any warehouse.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batch.warehouses.map((w) => (
                      <TableRow key={w.warehouseId}>
                        <TableCell>
                          <span className="font-medium">{w.warehouseName}</span>{" "}
                          <span className="text-xs text-slate-500">({w.warehouseCode})</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {w.availableQuantity.toLocaleString()} {batch.productUnit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Aliases */}
            <div className="border rounded-md">
              <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-900 flex items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Warehouse Aliases ({batch.aliases.length})
                </p>
              </div>
              {batch.aliases.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">
                  No aliases registered. Add one below to map supplier/import codes to this batch.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Original Code</TableHead>
                      <TableHead>Normalized</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Registered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batch.aliases.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                            {a.externalCode}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">
                          {a.normalizedCode}
                        </TableCell>
                        <TableCell className="text-sm">{a.warehouseName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal text-xs">
                            {a.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {canManage && (
                <div className="p-3 border-t flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Warehouse *</Label>
                    <Select value={aliasWarehouseId} onValueChange={setAliasWarehouseId}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehousesData?.items.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            {wh.name} ({wh.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Original / Supplier Code *</Label>
                    <Input
                      className="mt-1 h-9"
                      placeholder="e.g. lot 2026/01"
                      value={aliasCode}
                      onChange={(e) => setAliasCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && aliasValid && !aliasMutation.isPending) {
                          aliasMutation.mutate();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 bg-[#0d1f33] text-white hover:bg-[#13293f]"
                    disabled={!aliasValid || aliasMutation.isPending}
                    onClick={() => aliasMutation.mutate()}
                  >
                    {aliasMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Add Alias
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------

export default function BatchesPage() {
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ pageSize: 100 }),
  });

  const queryParams: BatchListParams = {
    page,
    pageSize: 10,
    search: search.trim() || undefined,
    warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
    productId: productFilter !== "all" ? productFilter : undefined,
    status: statusFilter !== "all" ? (statusFilter as BatchStatus) : undefined,
    expiryStatus: expiryFilter !== "all" ? (expiryFilter as BatchListParams["expiryStatus"]) : undefined,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["batches", queryParams],
    queryFn: () => listBatches(queryParams),
  });

  const resetPage = () => {
    setPage(1);
  };

  const meta = data?.meta;

  const resetFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setProductFilter("all");
    setStatusFilter("all");
    setExpiryFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch Management"
        description="Canonical batch identities, expiry tracking, and warehouse-specific alias mapping."
        actions={<CreateBatchDialog />}
      />

      {/* Filters Bar */}
      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            resetPage();
          },
          label: "Search batches",
          placeholder: "Search by batch code, product, or alias...",
          className: "sm:max-w-sm",
        }}
        onReset={resetFilters}
        resetDisabled={
          search === "" &&
          warehouseFilter === "all" &&
          productFilter === "all" &&
          statusFilter === "all" &&
          expiryFilter === "all"
        }
      >
        <Select
          value={warehouseFilter}
          onValueChange={(v) => {
            setWarehouseFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
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
          value={productFilter}
          onValueChange={(v) => {
            setProductFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {productsData?.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="QUARANTINED">Quarantined</SelectItem>
            <SelectItem value="RECALLED">Recalled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={expiryFilter}
          onValueChange={(v) => {
            setExpiryFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Expiry" />
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
      </FilterBar>

      {/* Batches Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canonical Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Available (Ledger)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aliases</TableHead>
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
                      icon: ScanBarcode,
                      title: "No batches found",
                      hint: "Batches are created here or automatically when stock is received.",
                    }
                  : null
              }
              colSpan={7}
              skeletonRows={4}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                      {batch.canonicalCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{batch.productName}</div>
                    <div className="text-xs text-slate-500">{batch.productSku}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {new Date(batch.expiryDate).toLocaleDateString()}
                    </div>
                    <StatusBadge
                      kind="expiry"
                      value={batch.expiryStatus}
                      label={formatExpiry(batch.daysToExpiry)}
                      className="mt-0.5"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {batch.totalAvailableStock > 0 ? (
                      <>
                        {batch.totalAvailableStock.toLocaleString()}{" "}
                        <span className="text-slate-400 font-sans">{batch.productUnit}</span>
                        <div className="text-[11px] text-slate-400 font-sans">
                          {batch.warehouses.length}{" "}
                          {batch.warehouses.length === 1 ? "warehouse" : "warehouses"}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400 font-sans">No stock</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="batchStatus" value={batch.status} />
                  </TableCell>
                  <TableCell>
                    {batch.aliases.length > 0 ? (
                      <Badge variant="secondary" className="font-normal text-xs">
                        {batch.aliases.length} {batch.aliases.length === 1 ? "alias" : "aliases"}
                      </Badge>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <BatchDetailsDialog batchId={batch.id} />
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
