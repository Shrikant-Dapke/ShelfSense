"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDispatch,
  getDispatchRecommendations,
  listDispatches,
  listInventory,
  listProducts,
  listWarehouses,
  type CreateDispatchPayload,
  type DispatchView,
  type DispatchListParams,
  type FefoRecommendation,
  type InventoryItemView,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
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
  AlertTriangle,
  Eye,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";

const FEFO_STATUS_BADGE: Record<string, string> = {
  CRITICAL: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  MONITOR: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  SAFE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
};

interface DispatchFormRow {
  inventoryKey: string; // warehouseId + batchId
  productId: string;
  batchId: string;
  canonicalCode: string;
  availableQuantity: number;
  expiryDate: string;
  daysToExpiry: number;
  quantity: string;
}

function initialRow(): DispatchFormRow {
  return {
    inventoryKey: "",
    productId: "",
    batchId: "",
    canonicalCode: "",
    availableQuantity: 0,
    expiryDate: "",
    daysToExpiry: 0,
    quantity: "1",
  };
}

function CreateDispatchDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [dispatchedDate, setDispatchedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rows, setRows] = useState<DispatchFormRow[]>([initialRow()]);

  // FEFO recommendation state (advisory; applying is always explicit).
  const [fefoProductId, setFefoProductId] = useState("");
  const [fefoQuantity, setFefoQuantity] = useState("");
  const [fefoResult, setFefoResult] = useState<FefoRecommendation | null>(null);
  const [isRequestingFefo, setIsRequestingFefo] = useState(false);

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100, isActive: "true" }),
  });

  // Fetch available stock in the selected warehouse (FEFO-compatible: sorted by expiryDate asc)
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

  // Filter batches that have available quantity > 0 and are not expired
  const eligibleStock = useMemo(() => {
    if (!inventoryData) return [];
    return inventoryData.items.filter(
      (item) => item.availableQuantity > 0 && item.expiryStatus !== "EXPIRED",
    );
  }, [inventoryData]);

  // Products for the FEFO recommendation selector
  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ pageSize: 100, sortBy: "name", sortOrder: "asc" }),
  });

  const handleWarehouseChange = (val: string) => {
    setWarehouseId(val);
    setRows([initialRow()]); // Reset rows when warehouse switches
    setFefoProductId("");
    setFefoResult(null);
  };

  const handleGetRecommendation = async () => {
    const qty = parseFloat(fefoQuantity);
    if (!warehouseId || !fefoProductId || isNaN(qty) || qty <= 0) return;
    setIsRequestingFefo(true);
    try {
      const rec = await getDispatchRecommendations({
        warehouseId,
        productId: fefoProductId,
        quantity: qty,
      });
      setFefoResult(rec);
    } catch (err) {
      setFefoResult(null);
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to get FEFO recommendation");
      }
    } finally {
      setIsRequestingFefo(false);
    }
  };

  /**
   * Explicit confirmation step: replaces the picking list with the ordered
   * allocation. Never auto-submits — the rows land in the editable picking
   * list and the user still books the dispatch through the normal flow.
   */
  const applyFefoToPickingList = () => {
    if (!fefoResult || fefoResult.allocations.length === 0) return;
    setRows(
      fefoResult.allocations.map((a) => ({
        inventoryKey: `${a.productId}_${a.batchId}`,
        productId: a.productId,
        batchId: a.batchId,
        canonicalCode: a.canonicalCode,
        availableQuantity: a.availableQuantity,
        expiryDate: a.expiryDate,
        daysToExpiry: a.daysToExpiry,
        quantity: String(a.recommendedQuantity),
      })),
    );
    setFefoResult(null);
    toast.success("FEFO allocation applied to the picking list");
  };

  const handleSelectBatch = (index: number, key: string) => {
    const stockItem = eligibleStock.find((s) => `${s.productId}_${s.batchId}` === key);
    if (!stockItem) return;

    setRows((prev) => {
      const next = [...prev];
      next[index] = {
        inventoryKey: key,
        productId: stockItem.productId,
        batchId: stockItem.batchId,
        canonicalCode: stockItem.canonicalCode,
        availableQuantity: stockItem.availableQuantity,
        expiryDate: stockItem.expiryDate,
        daysToExpiry: stockItem.daysToExpiry,
        quantity: "1",
      };
      return next;
    });
  };

  const updateQuantity = (index: number, val: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, quantity: val };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, initialRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: createDispatch,
    onSuccess: (dispatch) => {
      toast.success(`Dispatch ${dispatch.referenceNo ?? dispatch.id.slice(0, 8)} booked successfully`);
      queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      // Batch details show ledger-derived per-warehouse stock, which just
      // changed with the dispatch deduction.
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batch"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["expiry"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setWarehouseId("");
      setReferenceNo("");
      setRows([initialRow()]);
      setFefoProductId("");
      setFefoQuantity("");
      setFefoResult(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to process dispatch");
      }
    },
  });

  const isFormValid = useMemo(() => {
    if (!warehouseId) return false;
    if (rows.length === 0) return false;
    const pickedBatchIds = new Set<string>();

    for (const r of rows) {
      if (!r.batchId || !r.productId) return false;
      if (pickedBatchIds.has(r.batchId)) return false; // No duplicate batches
      pickedBatchIds.add(r.batchId);

      const q = parseFloat(r.quantity);
      if (isNaN(q) || q <= 0 || q > r.availableQuantity) return false;
    }
    return true;
  }, [warehouseId, rows]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const payload: CreateDispatchPayload = {
      warehouseId,
      referenceNo: referenceNo.trim() || undefined,
      dispatchedAt: dispatchedDate ? new Date(dispatchedDate).toISOString() : new Date().toISOString(),
      items: rows.map((r) => ({
        productId: r.productId,
        batchId: r.batchId,
        quantity: parseFloat(r.quantity),
      })),
    };

    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          New Dispatch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-teal-600" />
            Create Outbound Dispatch
          </DialogTitle>
          <DialogDescription>
            Allocate stock from non-expired batches with First-Expiry-First-Out (FEFO) prioritization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Header Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <div>
              <Label htmlFor="sourceWarehouse">Source Warehouse *</Label>
              <Select value={warehouseId} onValueChange={handleWarehouseChange}>
                <SelectTrigger id="sourceWarehouse" className="mt-1">
                  <SelectValue placeholder="Select warehouse to dispatch from" />
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
              <Label htmlFor="reference">Sales Order / Dispatch Ref #</Label>
              <Input
                id="reference"
                placeholder="e.g. SO-2026-901"
                className="mt-1"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>
          </div>

          {/* FEFO Recommendation */}
          <div className="space-y-3 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-teal-600" />
                FEFO Recommendation (optional)
              </Label>
              <p className="text-xs text-slate-500">
                Get an advisory First-Expiry-First-Out allocation for a product, review it, then apply
                it to the picking list below. Applying never submits a dispatch.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-6">
                <Label htmlFor="fefoProduct" className="text-xs">Product *</Label>
                <Select
                  value={fefoProductId}
                  onValueChange={(val) => {
                    setFefoProductId(val);
                    setFefoResult(null);
                  }}
                  disabled={!warehouseId}
                >
                  <SelectTrigger id="fefoProduct" className="mt-1 h-9">
                    <SelectValue placeholder={warehouseId ? "Select product to allocate" : "Select warehouse first"} />
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

              <div className="md:col-span-3">
                <Label htmlFor="fefoQuantity" className="text-xs">Requested Quantity *</Label>
                <Input
                  id="fefoQuantity"
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="e.g. 25"
                  className="mt-1 h-9"
                  value={fefoQuantity}
                  onChange={(e) => {
                    setFefoQuantity(e.target.value);
                    setFefoResult(null);
                  }}
                  disabled={!warehouseId}
                />
              </div>

              <div className="md:col-span-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9"
                  disabled={!warehouseId || !fefoProductId || !(parseFloat(fefoQuantity) > 0) || isRequestingFefo}
                  onClick={handleGetRecommendation}
                >
                  {isRequestingFefo ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Allocating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Get Recommendation
                    </>
                  )}
                </Button>
              </div>
            </div>

            {fefoResult && (
              <div className="space-y-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {fefoResult.productName} ({fefoResult.productSku})
                  </span>
                  <span>Requested: <span className="font-mono font-semibold">{fefoResult.requestedQuantity}</span> {fefoResult.productUnit}</span>
                  <span>Eligible: <span className="font-mono">{fefoResult.totalEligibleQuantity}</span></span>
                  <span>Allocated: <span className="font-mono">{fefoResult.allocatedQuantity}</span></span>
                  {fefoResult.shortfall > 0 && (
                    <span className="flex items-center gap-1 text-rose-600 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Shortfall: {fefoResult.shortfall} {fefoResult.productUnit} (insufficient stock)
                    </span>
                  )}
                </div>

                <div className="rounded border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Recommended</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fefoResult.allocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-14 text-center text-xs text-slate-400">
                            No eligible non-expired stock for this product in this warehouse.
                          </TableCell>
                        </TableRow>
                      ) : (
                        fefoResult.allocations.map((a) => (
                          <TableRow key={a.batchId}>
                            <TableCell className="font-mono text-xs">{a.order}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {a.canonicalCode}
                              </code>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] px-1.5 ${FEFO_STATUS_BADGE[a.expiryStatus] ?? ""}`}>
                                  {a.expiryStatus}
                                </Badge>
                                <span className="text-xs">
                                  {new Date(a.expiryDate).toLocaleDateString()} (in {a.daysToExpiry}d)
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{a.availableQuantity}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">{a.recommendedQuantity}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {fefoResult.allocations.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#0d1f33] text-white hover:bg-[#13293f]"
                      onClick={applyFefoToPickingList}
                    >
                      Apply to Picking List
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dispatch Item Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Picking List Items</Label>
                <p className="text-xs text-slate-500">Batches sorted by FEFO (earliest expiry first)</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                disabled={!warehouseId || isLoadingStock}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Batch Row
              </Button>
            </div>

            {!warehouseId ? (
              <div className="p-8 border border-dashed rounded-lg text-center text-slate-400 text-sm">
                Please select a source warehouse to load eligible stock batches.
              </div>
            ) : eligibleStock.length === 0 ? (
              <div className="p-8 border border-dashed rounded-lg text-center text-slate-400 text-sm">
                No active non-expired stock found in this warehouse.
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row, idx) => {
                  const qtyNum = parseFloat(row.quantity) || 0;
                  const isOverStock = qtyNum > row.availableQuantity;

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                    >
                      <div className="md:col-span-8">
                        <Label className="text-xs">Batch & Product (FEFO) *</Label>
                        <Select
                          value={row.inventoryKey}
                          onValueChange={(val) => handleSelectBatch(idx, val)}
                        >
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder="Select batch to dispatch" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleStock.map((item) => (
                              <SelectItem
                                key={`${item.productId}_${item.batchId}`}
                                value={`${item.productId}_${item.batchId}`}
                              >
                                {item.productName} ({item.productSku}) — {item.canonicalCode} [Avail: {item.availableQuantity} | Exp: {new Date(item.expiryDate).toLocaleDateString()}]
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="md:col-span-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Dispatch Qty *</Label>
                          {row.batchId && (
                            <span className="text-[11px] text-slate-500">
                              Max: {row.availableQuantity}
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          step="any"
                          min="0.0001"
                          max={row.availableQuantity || undefined}
                          className={`mt-1 h-9 ${isOverStock ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                          value={row.quantity}
                          onChange={(e) => updateQuantity(idx, e.target.value)}
                        />
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                          disabled={rows.length === 1}
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {isOverStock && (
                        <div className="col-span-12 flex items-center gap-1.5 text-xs text-rose-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Requested quantity exceeds available batch balance ({row.availableQuantity}).
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
              Confirm & Book Dispatch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewDispatchDialog({ dispatch }: { dispatch: DispatchView }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600 hover:text-slate-900">
          <Eye className="h-4 w-4 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-teal-600" />
            Dispatch Order: {dispatch.referenceNo ?? dispatch.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Outbound fulfillment from {dispatch.warehouseName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
          <div>
            <p className="text-slate-500 text-xs">Origin Warehouse</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.warehouseName} ({dispatch.warehouseCode})</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Reference No</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.referenceNo ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Dispatched Date</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {new Date(dispatch.dispatchedAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Dispatched By</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.createdByName}</p>
          </div>
        </div>

        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch Code</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead className="text-right">Quantity Dispatched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispatch.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.productName}</div>
                    <div className="text-xs text-slate-500">{item.productSku}</div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                      {item.canonicalCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    {new Date(item.expiryDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {item.quantity.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DispatchPage() {
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const queryParams: DispatchListParams = useMemo(() => ({
    warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
    referenceNo: search.trim() || undefined,
  }), [warehouseFilter, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["dispatches", queryParams],
    queryFn: () => listDispatches(queryParams),
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dispatch Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Allocate and dispatch inventory with FEFO batch selection and strict negative-stock prevention.
          </p>
        </div>
        <CreateDispatchDialog />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by SO / reference number..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
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
      </div>

      {/* Dispatches History Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dispatched At</TableHead>
              <TableHead>Reference / SO</TableHead>
              <TableHead>Origin Warehouse</TableHead>
              <TableHead>Batches Dispatched</TableHead>
              <TableHead>Total Units</TableHead>
              <TableHead>Dispatched By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data && data.items.length > 0 ? (
              data.items.map((dispatch) => {
                const totalUnits = dispatch.items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <TableRow key={dispatch.id}>
                    <TableCell className="font-medium">
                      {new Date(dispatch.dispatchedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {dispatch.referenceNo ? (
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                          {dispatch.referenceNo}
                        </code>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>{dispatch.warehouseName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-xs">
                        {dispatch.items.length} {dispatch.items.length === 1 ? "batch" : "batches"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-800 dark:text-slate-200">
                      {totalUnits.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                      {dispatch.createdByName}
                    </TableCell>
                    <TableCell className="text-right">
                      <ViewDispatchDialog dispatch={dispatch} />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Truck className="h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">No dispatch records found</p>
                    <p className="text-xs text-slate-400">Click &quot;New Dispatch&quot; to pick and ship stock.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
