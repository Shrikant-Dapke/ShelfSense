"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  deactivateProduct,
  listProducts,
  type ProductListParams,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import type { Product } from "@/lib/types";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiErrorMessage } from "@/components/form-feedback";
import { Loader2, Package, Plus, PackageX } from "lucide-react";
import { toast } from "sonner";

const UNIT_OPTIONS = ["kg", "g", "L", "mL", "unit", "pack", "crate"];
const CATEGORY_OPTIONS = [
  "Dairy",
  "Fruits and Vegetables",
  "Packaged Food",
  "Bakery",
  "Frozen Food",
  "Beverages",
];

function CreateProductDialog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", category: "", unit: "", brand: "" });

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (product) => {
      toast.success(`Product "${product.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setForm({ name: "", sku: "", category: "", unit: "", brand: "" });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Failed to create product"));
    },
  });

  const canCreate = can(user, "product.create");
  if (!canCreate) return null;

  const valid = form.name && form.sku && form.category && form.unit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4" aria-hidden />
          New Product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Product</DialogTitle>
          <DialogDescription>
            Add a product to the catalogue. SKUs are unique and case-insensitive.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              mutation.mutate({
                name: form.name,
                sku: form.sku,
                category: form.category,
                unit: form.unit,
                brand: form.brand || undefined,
              });
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-sku">SKU</Label>
              <Input
                id="p-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="DAI-MILK-001"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-brand">Brand (optional)</Label>
              <Input
                id="p-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
                required
              >
                <SelectTrigger id="p-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-unit">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })} required>
                <SelectTrigger id="p-unit" className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Row action: deactivate a product (backend ADMIN-only). */
function DeactivateProductButton({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deactivateProduct(product.id),
    onSuccess: () => {
      toast.success(`Product "${product.name}" deactivated`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Failed to deactivate product"));
    },
  });

  if (!can(user, "product.deactivate")) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-slate-500 hover:text-rose-600"
        onClick={() => setOpen(true)}
        aria-label={`Deactivate ${product.name}`}
      >
        <PackageX className="h-4 w-4" aria-hidden />
        Deactivate
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Deactivate "${product.name}"?`}
        description={`"${product.sku}" will be marked inactive and can no longer receive stock. Existing stock ledger history is preserved. This cannot be undone from the app.`}
        confirmLabel="Deactivate product"
        onConfirm={() => mutation.mutate()}
        isPending={mutation.isPending}
      />
    </>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const canCreate = can(user, "product.create");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>("all");

  const params: ProductListParams = useMemo(
    () => ({
      page,
      pageSize: 10,
      search: search || undefined,
      category: category === "all" ? undefined : category,
      sortBy: "name",
      sortOrder: "asc",
    }),
    [page, search, category],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["products", params],
    queryFn: () => listProducts(params),
  });

  const columns: Array<{ key: keyof Product | "status" | "actions"; label: string }> = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "brand", label: "Brand" },
    { key: "unit", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "actions", label: "" },
  ];
  const columnCount = columns.length;

  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={
          data ? `${data.meta.total.toLocaleString()} products in the catalogue` : "Product catalogue"
        }
        actions={<CreateProductDialog />}
      />

      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          label: "Search products",
          placeholder: "Search name, SKU or brand…",
        }}
        onReset={resetFilters}
        resetDisabled={search === "" && category === "all"}
      >
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={col.key === "actions" ? "text-right" : undefined}>
                  {col.label}
                </TableHead>
              ))}
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
                      title: "No products found",
                      hint: canCreate
                        ? "Try a different search, or create your first product."
                        : "Try a different search. Products are created by ADMIN and MANAGER roles.",
                    }
                  : null
              }
              colSpan={columnCount}
              skeletonRows={5}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs text-slate-600">{product.sku}</TableCell>
                  <TableCell className="font-medium text-slate-900">{product.name}</TableCell>
                  <TableCell className="text-slate-600">{product.category}</TableCell>
                  <TableCell className="text-slate-600">{product.brand ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{product.unit}</TableCell>
                  <TableCell>
                    <StatusBadge
                      kind="active"
                      value={product.isActive ? "ACTIVE" : "INACTIVE"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DeactivateProductButton product={product} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {data && data.meta.total > 0 ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Package className="h-3 w-3" aria-hidden />
        Seed data for products arrives with the synthetic dataset milestone.
      </p>
    </div>
  );
}
