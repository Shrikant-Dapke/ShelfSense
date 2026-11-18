"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWarehouse,
  deactivateWarehouse,
  listWarehouses,
} from "@/features/inventory-api";
import { ApiClientError } from "@/lib/api-client";
import type { Warehouse } from "@/lib/types";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { FilterBar } from "@/components/filter-bar";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiErrorMessage } from "@/components/form-feedback";
import { Loader2, MapPin, Plus, Warehouse as WarehouseIcon, PackageX } from "lucide-react";
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
      toast.error(apiErrorMessage(err, "Failed to create warehouse"));
    },
  });

  if (!can(user, "warehouse.manage")) return null;
  const valid = form.name && form.code;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
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

/** Row action: deactivate a warehouse (backend ADMIN-only). */
function DeactivateWarehouseButton({ warehouse }: { warehouse: Warehouse }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deactivateWarehouse(warehouse.id),
    onSuccess: () => {
      toast.success(`Warehouse "${warehouse.name}" deactivated`);
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Failed to deactivate warehouse"));
    },
  });

  if (!can(user, "warehouse.manage")) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-ink-muted hover:text-[var(--status-danger-ink)]"
        onClick={() => setOpen(true)}
        aria-label={`Deactivate ${warehouse.name}`}
      >
        <PackageX className="h-4 w-4" aria-hidden />
        Deactivate
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Deactivate "${warehouse.name}"?`}
        description={`"${warehouse.code}" will be marked inactive and can no longer receive or dispatch stock. Existing stock ledger history is preserved. This cannot be undone from the app.`}
        confirmLabel="Deactivate warehouse"
        onConfirm={() => mutation.mutate()}
        isPending={mutation.isPending}
      />
    </>
  );
}

export default function WarehousesPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["warehouses", { search, page, activeFilter }],
    queryFn: () =>
      listWarehouses({
        search: search || undefined,
        isActive: activeFilter === "all" ? undefined : (activeFilter as "true" | "false"),
        page,
        pageSize: 10,
      }),
  });

  // Catalog-wide counts from a single bounded read, independent of filters.
  const { data: catalogue, isLoading: catalogueLoading } = useQuery({
    queryKey: ["warehouses", "catalogue-counts"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100 }),
  });
  const activeCount = catalogue?.items.filter((w) => w.isActive).length;
  const inactiveCount = catalogue?.items.filter((w) => !w.isActive).length;

  const columns: Array<{ key: keyof Warehouse | "status" | "actions"; label: string }> = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "actions", label: "" },
  ];

  const resetFilters = () => {
    setSearch("");
    setActiveFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Warehouse network — locations, status and receiving eligibility."
        actions={<CreateWarehouseDialog />}
      />

      <section aria-label="Warehouse summary" className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          title="Warehouses"
          description="Total locations in the network"
          value={catalogue?.meta.total}
          isLoading={catalogueLoading}
          icon={WarehouseIcon}
        />
        <MetricCard
          title="Active"
          description="Locations available for stock operations"
          value={activeCount}
          isLoading={catalogueLoading}
          icon={MapPin}
          tone="success"
        />
        <MetricCard
          title="Inactive"
          description="Deactivated locations — ledger history preserved"
          value={inactiveCount}
          isLoading={catalogueLoading}
          icon={PackageX}
          tone="neutral"
        />
      </section>

      <FilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          label: "Search warehouses",
          placeholder: "Search warehouses…",
        }}
        onReset={resetFilters}
        resetDisabled={search === "" && activeFilter === "all"}
      >
        <Select
          value={activeFilter}
          onValueChange={(v) => {
            setActiveFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline">
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
                  ? { icon: PackageX, title: "No warehouses found" }
                  : null
              }
              colSpan={columns.length}
              skeletonRows={3}
            />
            {!isLoading &&
              !isError &&
              data?.items.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell className="font-mono text-xs text-ink-muted">{warehouse.code}</TableCell>
                  <TableCell className="font-medium text-ink">{warehouse.name}</TableCell>
                  <TableCell className="text-ink-muted">
                    {warehouse.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                        {warehouse.location}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="active" value={warehouse.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DeactivateWarehouseButton warehouse={warehouse} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {data && data.meta.total > 0 ? (
          <div className="border-t border-hairline px-4 py-3">
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <WarehouseIcon className="h-3 w-3" aria-hidden />
        Only administrators can create or modify warehouses.
      </p>
    </div>
  );
}
