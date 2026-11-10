"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  listProducts,
  type ProductListParams,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import type { Product } from "@/lib/types";
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
import { Loader2, Package, Plus, Search, PackageX } from "lucide-react";
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
      if (err instanceof ApiClientError) {
        if (err.code === "CONFLICT") {
          toast.error(err.message);
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Failed to create product");
      }
    },
  });

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER";
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

export default function ProductsPage() {
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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["products", params],
    queryFn: () => listProducts(params),
  });

  const columns: Array<{ key: keyof Product | "status"; label: string }> = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "brand", label: "Brand" },
    { key: "unit", label: "Unit" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.meta.total} products in the catalogue` : "Product catalogue"}
          </p>
        </div>
        <CreateProductDialog />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder="Search name, SKU or brand…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search products"
          />
        </div>
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
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-red-600">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : !data || data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-14 text-center">
                  <PackageX className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden />
                  <p className="font-medium text-slate-600">No products found</p>
                  <p className="text-sm text-slate-400">
                    Try a different search, or create your first product.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs text-slate-600">{product.sku}</TableCell>
                  <TableCell className="font-medium text-slate-900">{product.name}</TableCell>
                  <TableCell className="text-slate-600">{product.category}</TableCell>
                  <TableCell className="text-slate-600">{product.brand ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{product.unit}</TableCell>
                  <TableCell>
                    {product.isActive ? (
                      <Badge className="bg-teal-50 text-teal-700 border-teal-200">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data && data.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              Page {data.meta.page} of {data.meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page >= data.meta.totalPages}
              >
                Next
              </Button>
            </div>
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
