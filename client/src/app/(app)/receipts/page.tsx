"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReceipt,
  listReceipts,
  listProducts,
  listWarehouses,
  type CreateReceiptPayload,
  type ReceiptView,
  type ReceiptListParams,
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
  ArrowDownToLine,
  Calendar,
  CheckCircle2,
  Eye,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";

interface ReceiptItemFormRow {
  productId: string;
  canonicalCode: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
}

function initialRow(): ReceiptItemFormRow {
  return {
    productId: "",
    canonicalCode: "",
    expiryDate: "",
    quantity: "1",
    unitCost: "",
  };
}

function CreateReceiptDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rows, setRows] = useState<ReceiptItemFormRow[]>([initialRow()]);

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100, isActive: "true" }),
  });

  // Fetch products
  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ pageSize: 100 }),
  });

  const updateRow = (index: number, field: keyof ReceiptItemFormRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
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
    mutationFn: createReceipt,
    onSuccess: (receipt) => {
      toast.success(`Receipt ${receipt.referenceNo ?? receipt.id.slice(0, 8)} recorded successfully`);
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setOpen(false);
      setWarehouseId("");
      setSupplierName("");
      setReferenceNo("");
      setRows([initialRow()]);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to process receipt");
      }
    },
  });

  const isFormValid = useMemo(() => {
    if (!warehouseId) return false;
    if (rows.length === 0) return false;
    for (const r of rows) {
      if (!r.productId || !r.canonicalCode.trim() || !r.expiryDate) return false;
      const q = parseFloat(r.quantity);
      if (isNaN(q) || q <= 0) return false;
      if (r.unitCost) {
        const c = parseFloat(r.unitCost);
        if (isNaN(c) || c < 0) return false;
      }
    }
    return true;
  }, [warehouseId, rows]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const payload: CreateReceiptPayload = {
      warehouseId,
      supplierName: supplierName.trim() || undefined,
      referenceNo: referenceNo.trim() || undefined,
      receivedAt: receivedDate ? new Date(receivedDate).toISOString() : new Date().toISOString(),
      items: rows.map((r) => ({
        productId: r.productId,
        canonicalCode: r.canonicalCode.trim(),
        expiryDate: new Date(r.expiryDate).toISOString(),
        quantity: parseFloat(r.quantity),
        unitCost: r.unitCost ? parseFloat(r.unitCost) : undefined,
      })),
    };

    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          Receive Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-teal-600" />
            Receive Inbound Stock
          </DialogTitle>
          <DialogDescription>
            Record inbound goods, assign canonical batch codes, and atomically book stock movements.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Header Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <div>
              <Label htmlFor="warehouse">Destination Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="warehouse" className="mt-1">
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
              <Label htmlFor="supplier">Supplier Name</Label>
              <Input
                id="supplier"
                placeholder="e.g. Apex Foods Ltd"
                className="mt-1"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reference">PO / Reference #</Label>
              <Input
                id="reference"
                placeholder="e.g. PO-2026-4401"
                className="mt-1"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>
          </div>

          {/* Product Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Inbound Product Batches</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item Row
              </Button>
            </div>

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                >
                  <div className="md:col-span-4">
                    <Label className="text-xs">Product *</Label>
                    <Select
                      value={row.productId}
                      onValueChange={(val) => updateRow(idx, "productId", val)}
                    >
                      <SelectTrigger className="mt-1 h-9">
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

                  <div className="md:col-span-3">
                    <Label className="text-xs">Batch Code *</Label>
                    <Input
                      placeholder="LOT-..."
                      className="mt-1 h-9"
                      value={row.canonicalCode}
                      onChange={(e) => updateRow(idx, "canonicalCode", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-xs">Expiry Date *</Label>
                    <Input
                      type="date"
                      className="mt-1 h-9"
                      value={row.expiryDate}
                      onChange={(e) => updateRow(idx, "expiryDate", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-1">
                    <Label className="text-xs">Qty *</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0.0001"
                      className="mt-1 h-9"
                      value={row.quantity}
                      onChange={(e) => updateRow(idx, "quantity", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-1">
                    <Label className="text-xs">Cost</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      className="mt-1 h-9"
                      value={row.unitCost}
                      onChange={(e) => updateRow(idx, "unitCost", e.target.value)}
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
              Confirm & Book Stock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewReceiptDialog({ receipt }: { receipt: ReceiptView }) {
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
            <PackageCheck className="h-5 w-5 text-teal-600" />
            Receipt Details: {receipt.referenceNo ?? receipt.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Inbound delivery record received at {receipt.warehouseName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
          <div>
            <p className="text-slate-500 text-xs">Warehouse</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{receipt.warehouseName} ({receipt.warehouseCode})</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Supplier</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{receipt.supplierName ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Received Date</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {new Date(receipt.receivedAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Received By</p>
            <p className="font-medium text-slate-900 dark:text-slate-100">{receipt.createdByName}</p>
          </div>
        </div>

        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch Code</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.items.map((item) => (
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
                  <TableCell className="text-right">
                    {item.unitCost !== null ? `$${item.unitCost.toFixed(2)}` : "—"}
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

export default function ReceiptsPage() {
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100 }),
  });

  const queryParams: ReceiptListParams = useMemo(() => ({
    warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
    supplierName: search.trim() || undefined,
  }), [warehouseFilter, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["receipts", queryParams],
    queryFn: () => listReceipts(queryParams),
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Inbound Receiving
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Receive stock from suppliers, generate canonical batches, and log atomic stock movements.
          </p>
        </div>
        <CreateReceiptDialog />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by supplier name..."
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

      {/* Receipts History Table */}
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received At</TableHead>
              <TableHead>Reference / PO</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Destination Warehouse</TableHead>
              <TableHead>Items Received</TableHead>
              <TableHead>Received By</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data && data.items.length > 0 ? (
              data.items.map((receipt) => {
                const totalUnits = receipt.items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-medium">
                      {new Date(receipt.receivedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {receipt.referenceNo ? (
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                          {receipt.referenceNo}
                        </code>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{receipt.supplierName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>{receipt.warehouseName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-xs">
                        {receipt.items.length} {receipt.items.length === 1 ? "batch" : "batches"} ({totalUnits.toLocaleString()} units)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                      {receipt.createdByName}
                    </TableCell>
                    <TableCell className="text-right">
                      <ViewReceiptDialog receipt={receipt} />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ArrowDownToLine className="h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">No receipt records found</p>
                    <p className="text-xs text-slate-400">Click &quot;Receive Stock&quot; to log inbound goods into inventory.</p>
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
