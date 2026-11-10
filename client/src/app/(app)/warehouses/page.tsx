"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWarehouse, listWarehouses } from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import type { Warehouse } from "@/lib/types";
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
import { Loader2, MapPin, Plus, Search, Warehouse as WarehouseIcon, PackageX } from "lucide-react";
import { toast } from "sonner";

function CreateWarehouseDialog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", location: "" });

  const mutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: (warehouse) => {
      toast.success(`Warehouse "${warehouse.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      setOpen(false);
      setForm({ name: "", code: "", location: "" });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to create warehouse");
    },
  });

  if (user?.role !== "ADMIN") return null;
  const valid = form.name && form.code;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0d1f33] text-white hover:bg-[#13293f]">
          <Plus className="h-4 w-4" aria-hidden />
          New Warehouse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Warehouse</DialogTitle>
          <DialogDescription>
            Warehouse codes are unique and normalized to uppercase.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              mutation.mutate({
                name: form.name,
                code: form.code,
                location: form.location || undefined,
              });
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="w-name">Name</Label>
            <Input
              id="w-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Pune Central Warehouse"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-code">Code</Label>
            <Input
              id="w-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="PUNE-CENTRAL"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-location">Location (optional)</Label>
            <Input
              id="w-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Pune, Maharashtra, IN"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create Warehouse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function WarehousesPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["warehouses", { search }],
    queryFn: () => listWarehouses({ search: search || undefined, pageSize: 50 }),
  });

  const columns: Array<{ key: keyof Warehouse | "status"; label: string }> = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Warehouses</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.meta.total} locations` : "Warehouse network"}
          </p>
        </div>
        <CreateWarehouseDialog />
      </header>

      <div className="relative w-full max-w-xs">
        <Search
          className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          className="pl-8"
          placeholder="Search warehouses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search warehouses"
        />
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
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-36" />
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
                  <p className="font-medium text-slate-600">No warehouses found</p>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell className="font-mono text-xs text-slate-600">{warehouse.code}</TableCell>
                  <TableCell className="font-medium text-slate-900">{warehouse.name}</TableCell>
                  <TableCell className="text-slate-600">
                    {warehouse.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {warehouse.location}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {warehouse.isActive ? (
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
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <WarehouseIcon className="h-3 w-3" aria-hidden />
        Only administrators can create or modify warehouses.
      </p>
    </div>
  );
}
