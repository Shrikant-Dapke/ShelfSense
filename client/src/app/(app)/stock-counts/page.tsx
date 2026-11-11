"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveStockCount,
  createStockCount,
  getStockCount,
  listInventory,
  listStockCounts,
  listWarehouses,
  postStockCount,
  submitStockCount,
  updateStockCount,
  type StockCountStatus,
  type StockCountView,
  type StockCountListParams,
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
  ClipboardCheck,
  Plus,
  Loader2,
  Eye,
  Warehouse as WarehouseIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
  Send,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  APPROVED: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) {
    return <Badge variant="secondary" className="font-mono text-xs">0</Badge>;
  }
  const positive = variance > 0;
  return (
    <Badge
      variant="outline"
      className={`font-mono text-xs ${
        positive
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
      }`}
    >
      {positive ? "+" : ""}
      {variance.toLocaleString()}
    </Badge>
  );
}

// ---------- Create Stock Count Dialog ----------

interface CountRow {
  inventoryKey: string;
  productId: string;
  batchId: string;
  canonicalCode: string;
  expectedQuantity: number;
  countedQuantity: string;
}

function emptyRow(): CountRow {
  return {
    inventoryKey: "",
    productId: "",
    batchId: "",
    canonicalCode: "",
    expectedQuantity: 0,
    countedQuantity: "",
  };
}

function CreateCountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [description, setDescription] = useState("");
  const [countDate, setCountDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rows, setRows] = useState<CountRow[]>([emptyRow()]);

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100, isActive: "true" }),
  });

  const { data: inventoryData, isLoading: isLoadingStock } = useQuery({
    queryKey: ["inventory", "warehouse", warehouseId],
    queryFn: () =>
      listInventory({
        warehouseId,
        pageSize: 100,
        sortBy: "expiryDate",
        sortOrder: "asc",
      }),
    enabled: !!warehouseId,
  });

  const selectableStock = inventoryData?.items ?? [];

  const pickedBatchIds = new Set(rows.map((r) => r.batchId).filter(Boolean));

  const handleSelectBatch = (index: number, key: string) => {
    const stockItem = selectableStock.find((s) => `${s.productId}_${s.batchId}` === key);
    if (!stockItem) return;
    setRows((prev) => {
      const next = [...prev];
      next[index] = {
        inventoryKey: key,
        productId: stockItem.productId,
        batchId: stockItem.batchId,
        canonicalCode: stockItem.canonicalCode,
        expectedQuantity: stockItem.availableQuantity,
        countedQuantity: String(stockItem.availableQuantity),
      };
      return next;
    });
  };

  const updateRow = (index: number, field: keyof CountRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setWarehouseId("");
    setReferenceNo("");
    setDescription("");
    setCountDate(new Date().toISOString().split("T")[0]);
    setRows([emptyRow()]);
  };

  const mutation = useMutation({
    mutationFn: createStockCount,
    onSuccess: (count) => {
      toast.success(`Stock count ${count.referenceNo ?? count.id.slice(0, 8)} created as draft`);
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to create stock count");
    },
  });

  const isFormValid = useMemo(() => {
    if (!warehouseId) return false;
    if (rows.length === 0) return false;
    const batchIds = new Set<string>();
    for (const r of rows) {
      if (!r.batchId) return false;
      if (batchIds.has(r.batchId)) return false; // duplicate batch
      batchIds.add(r.batchId);
      const q = parseFloat(r.countedQuantity);
      if (isNaN(q) || q < 0) return false;
    }
    return true;
  }, [warehouseId, rows]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    mutation.mutate({
      warehouseId,
      referenceNo: referenceNo.trim() || undefined,
      description: description.trim() || undefined,
      countedAt: countDate ? new Date(countDate).toISOString() : new Date().toISOString(),
      items: rows.map((r) => ({
        productId: r.productId,
        batchId: r.batchId,
        countedQuantity: parseFloat(r.countedQuantity),
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          New Count
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-teal-600" />
            New Physical Stock Count
          </DialogTitle>
          <DialogDescription>
            Record physical quantities. Expected stock is derived from the ledger; inventory only
            changes after review, approval, and explicit posting.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <div>
              <Label htmlFor="sc-warehouse">Warehouse *</Label>
              <Select
                value={warehouseId}
                onValueChange={(val) => {
                  setWarehouseId(val);
                  setRows([emptyRow()]);
                }}
              >
                <SelectTrigger id="sc-warehouse" className="mt-1">
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
            <div>
              <Label htmlFor="sc-ref">Count Reference</Label>
              <Input
                id="sc-ref"
                placeholder="e.g. COUNT-2026-001"
                className="mt-1"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sc-date">Count Date *</Label>
              <Input
                id="sc-date"
                type="date"
                className="mt-1"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="sc-desc">Description</Label>
              <Input
                id="sc-desc"
                placeholder="e.g. Monthly cycle count — cold room"
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Counted Batches</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!warehouseId}
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item Row
              </Button>
            </div>

            {!warehouseId && (
              <p className="text-xs text-slate-500">Select a warehouse to load its stock batches.</p>
            )}
            {isLoadingStock && warehouseId && (
              <p className="text-xs text-slate-500">Loading warehouse stock...</p>
            )}

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                >
                  <div className="md:col-span-6">
                    <Label className="text-xs">Batch (product · canonical code) *</Label>
                    <Select
                      value={row.inventoryKey}
                      onValueChange={(val) => handleSelectBatch(idx, val)}
                      disabled={!warehouseId}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Select batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableStock.map((s) => {
                          const key = `${s.productId}_${s.batchId}`;
                          const taken = pickedBatchIds.has(s.batchId) && row.batchId !== s.batchId;
                          return (
                            <SelectItem key={key} value={key} disabled={taken}>
                              {s.productName} · {s.canonicalCode} — expected {s.availableQuantity.toLocaleString()}{" "}
                              {s.productUnit}
                              {taken ? " (already counted)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-xs">Expected (ledger)</Label>
                    <Input
                      className="mt-1 h-9 font-mono"
                      value={row.batchId ? row.expectedQuantity.toLocaleString() : "—"}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-xs">Physical Qty *</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      className="mt-1 h-9"
                      value={row.countedQuantity}
                      onChange={(e) => updateRow(idx, "countedQuantity", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      disabled={rows.length === 1}
                      onClick={() => removeRow(idx)}
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
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
              Save Draft Count
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Post Confirmation Dialog ----------

function PostConfirmDialog({ count, onPosted }: { count: StockCountView; onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => postStockCount(count.id),
    onSuccess: () => {
      toast.success("Adjustments posted to the stock ledger");
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["stock-count", count.id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      // Posting writes ADJUSTMENT movements; batch details show
      // ledger-derived per-warehouse stock and must refresh.
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batch"] });
      onPosted();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to post stock count");
    },
  });

  const nonZeroVariance = count.items.filter((i) => i.variance !== 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <ShieldCheck className="h-4 w-4 mr-1" />
          Post Adjustments
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <TriangleAlert className="h-5 w-5" />
            Post Stock Adjustments?
          </DialogTitle>
          <DialogDescription>
            This will write permanent ADJUSTMENT movements to the stock ledger. Expected balances are
            recalculated under row locks at posting time.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3 text-sm space-y-1.5">
          <p className="font-medium">
            {count.referenceNo ?? count.id.slice(0, 8)} · {count.warehouseName}
          </p>
          <p className="text-slate-500 text-xs">
            {nonZeroVariance.length === 0
              ? "No variances to post — the physical count matches the ledger."
              : `${nonZeroVariance.length} ${nonZeroVariance.length === 1 ? "adjustment" : "adjustments"} will be posted:`}
          </p>
          <ul className="text-xs space-y-1">
            {nonZeroVariance.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-600 dark:text-slate-400">{item.canonicalCode}</span>
                <VarianceBadge variance={item.variance} />
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="bg-rose-600 text-white hover:bg-rose-700"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm &amp; Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Details Dialog ----------

function CountDetailsDialog({ countId }: { countId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, string>>({});
  const [savedQuantities, setSavedQuantities] = useState<Record<string, string>>({});

  const { data: count, isLoading } = useQuery({
    queryKey: ["stock-count", countId],
    queryFn: () => getStockCount(countId),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["stock-count", countId] });
    queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
  };

  const submitMutation = useMutation({
    mutationFn: () => submitStockCount(countId),
    onSuccess: () => {
      toast.success("Stock count submitted for review");
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to submit");
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approveStockCount(countId),
    onSuccess: () => {
      toast.success("Stock count approved");
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to approve");
    },
  });

  const editMutation = useMutation({
    mutationFn: () => {
      if (!count) throw new Error("no count");
      return updateStockCount(countId, {
        items: count.items.map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          countedQuantity: parseFloat(editedQuantities[item.id] ?? String(item.countedQuantity)),
        })),
      });
    },
    onSuccess: () => {
      toast.success("Count updated");
      setSavedQuantities({});
      setEditedQuantities({});
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update count");
    },
  });

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isEditable = Boolean(count && (count.status === "PENDING" || count.status === "SUBMITTED") && !count.postedAt);
  const hasEdits =
    isEditable &&
    count &&
    count.items.some(
      (item) =>
        editedQuantities[item.id] !== undefined &&
        editedQuantities[item.id] !== (savedQuantities[item.id] ?? String(item.countedQuantity)),
    );

  const dirty = (itemId: string, current: number) =>
    editedQuantities[itemId] !== undefined && editedQuantities[itemId] !== String(current);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEditedQuantities({});
          setSavedQuantities({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600 hover:text-slate-900">
          <Eye className="h-4 w-4 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-teal-600" />
            Stock Count {count?.referenceNo ?? countId.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Physical count vs. ledger expectation. Inventory only changes on posting.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !count ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Header info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <div>
                <p className="text-slate-500 text-xs">Warehouse</p>
                <p className="font-medium">
                  {count.warehouseName} ({count.warehouseCode})
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Status</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className={STATUS_BADGE[count.status] ?? ""}>
                    {STATUS_LABEL[count.status] ?? count.status}
                  </Badge>
                  {count.postedAt && (
                    <Badge
                      variant="outline"
                      className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900"
                    >
                      Posted
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Counted At</p>
                <p className="font-medium">
                  {count.countedAt ? new Date(count.countedAt).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Counted By</p>
                <p className="font-medium">{count.countedByName ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Reference</p>
                <p className="font-medium">{count.referenceNo ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500 text-xs">Description</p>
                <p className="font-medium">{count.description ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Approved By</p>
                <p className="font-medium">{count.approvedByName ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Posted By</p>
                <p className="font-medium">{count.postedByName ?? "—"}</p>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-slate-500">Total Expected (ledger)</p>
                <p className="text-lg font-semibold font-mono">
                  {count.totalExpectedQuantity.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-slate-500">Total Counted (physical)</p>
                <p className="text-lg font-semibold font-mono">
                  {count.totalCountedQuantity.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-slate-500">Total Variance</p>
                <div className="mt-1">
                  <VarianceBadge variance={count.totalVariance} />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / Batch</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Physical</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {count.items.map((item) => {
                    const edited = dirty(item.id, item.countedQuantity);
                    const value =
                      editedQuantities[item.id] ?? (savedQuantities[item.id] ?? String(item.countedQuantity));
                    const parsed = parseFloat(value);
                    const liveVariance = edited && !isNaN(parsed)
                      ? (() => {
                          const diff = parsed - item.expectedQuantity;
                          return Math.round(diff * 10000) / 10000;
                        })()
                      : item.variance;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {item.canonicalCode}
                            </code>
                            · exp {new Date(item.expiryDate).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {item.expectedQuantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditable ? (
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="h-8 w-24 ml-auto text-right font-mono"
                              value={value}
                              onChange={(e) =>
                                setEditedQuantities((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="font-mono text-sm">{item.countedQuantity.toLocaleString()}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <VarianceBadge variance={liveVariance} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Workflow actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
              {isEditable && (
                <>
                  {hasEdits && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={editMutation.isPending}
                      onClick={() => editMutation.mutate()}
                    >
                      {editMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Save Changes
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    Submit for Review
                  </Button>
                </>
              )}

              {count.status === "SUBMITTED" && (
                <>
                  {isEditable && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={submitMutation.isPending}
                      onClick={() => submitMutation.mutate()}
                    >
                      Resubmit
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      )}
                      Approve
                    </Button>
                  )}
                </>
              )}

              {count.status === "APPROVED" && !count.postedAt && canManage && (
                <PostConfirmDialog count={count} onPosted={() => setSavedQuantities({})} />
              )}

              {count.postedAt && (
                <Badge
                  variant="outline"
                  className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Posted {new Date(count.postedAt).toLocaleDateString()} by {count.postedByName ?? "—"}
                </Badge>
              )}
            </div>
            {count.status === "PENDING" && (
              <p className="text-xs text-slate-400 -mt-3">
                Draft counts never affect inventory. Submit the count for managerial review, then
                approve and post to apply adjustments.
              </p>
            )}
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

export default function StockCountsPage() {
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const queryParams: StockCountListParams = {
    page,
    pageSize: 10,
    warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
    status: statusFilter !== "all" ? (statusFilter as StockCountStatus) : undefined,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["stock-counts", queryParams],
    queryFn: () => listStockCounts(queryParams),
  });

  const meta = data?.meta;
  const canPrev = Boolean(meta && meta.page > 1);
  const canNext = Boolean(meta && meta.page < meta.totalPages);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Physical Stock Counts
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Count physical stock, review variances against the ledger, and post approved adjustments.
          </p>
        </div>
        <CreateCountDialog />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            <SelectItem value="PENDING">Draft</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* History Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Counted At</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Counted By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CircleAlert className="h-8 w-8 text-rose-400" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      Failed to load stock counts
                    </p>
                    <p className="text-xs text-slate-400">
                      Please try again or contact support if the problem persists.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : data && data.items.length > 0 ? (
              data.items.map((count) => (
                <TableRow key={count.id}>
                  <TableCell>
                    {count.referenceNo ? (
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                        {count.referenceNo}
                      </code>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" />
                      <span>{count.warehouseName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {count.countedAt ? new Date(count.countedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {count.items.length} {count.items.length === 1 ? "item" : "items"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <VarianceBadge variance={count.totalVariance} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={STATUS_BADGE[count.status] ?? ""}>
                        {STATUS_LABEL[count.status] ?? count.status}
                      </Badge>
                      {count.postedAt && (
                        <Badge
                          variant="outline"
                          className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900"
                        >
                          Posted
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {count.countedByName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <CountDetailsDialog countId={count.id} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-36 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ClipboardCheck className="h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      No stock counts found
                    </p>
                    <p className="text-xs text-slate-400">
                      Click &quot;New Count&quot; to record a physical stock count.
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
            {meta.total === 1 ? "count" : "counts"}
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
