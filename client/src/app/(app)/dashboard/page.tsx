"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getInventorySummary,
  listBatches,
  listDispatches,
  listMovements,
  listProducts,
  listReceipts,
  listWarehouses,
} from "@/features/inventory-api";
import { getAnalyticsSummary } from "@/features/analytics-api";
import { useAuth } from "@/features/auth/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Boxes,
  CircleAlert,
  ClipboardCheck,
  History,
  Package,
  Timer,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";

const MOVEMENT_BADGE: Record<string, string> = {
  RECEIPT: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  DISPATCH: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  WASTE: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  TRANSFER_IN: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  TRANSFER_OUT: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  ADJUSTMENT: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
};

function KpiCard({
  title,
  description,
  icon: Icon,
  value,
  isLoading,
  tone,
}: {
  title: string;
  description: string;
  icon: typeof Package;
  value: number | undefined;
  isLoading: boolean;
  tone?: "rose" | "amber";
}) {
  const valueClass =
    tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-900 dark:text-white";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {title}
        </CardDescription>
        <CardTitle className={`text-3xl ${valueClass}`}>
          {isLoading ? <Skeleton className="h-8 w-16" /> : value?.toLocaleString() ?? "—"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();

  // Every KPI below is computed from real backend endpoints. A "0" is a real
  // zero; while a query is loading the value shows a skeleton, never a
  // fabricated number. The single analytics KPI (waste, fixed 30-day window)
  // links into the full /analytics dashboard rather than duplicating its
  // charts here.
  const { data: analytics30d, isLoading: analyticsLoading } = useQuery({
    queryKey: ["dashboard", "analytics-30d"],
    queryFn: () => getAnalyticsSummary({ period: "30d" }),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => getInventorySummary(),
  });

  const { data: productsPage, isLoading: productsLoading } = useQuery({
    queryKey: ["dashboard", "products-total"],
    queryFn: () => listProducts({ page: 1, pageSize: 1 }),
  });

  const { data: warehousesPage, isLoading: warehousesLoading } = useQuery({
    queryKey: ["dashboard", "warehouses-total"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 1, isActive: "true" }),
  });

  const { data: nearExpiryPage, isLoading: nearExpiryLoading } = useQuery({
    queryKey: ["dashboard", "near-expiry"],
    queryFn: () => listBatches({ page: 1, pageSize: 1, expiryStatus: "WARNING" }),
  });

  const { data: receiptsPage, isLoading: receiptsLoading } = useQuery({
    queryKey: ["dashboard", "recent-receipts"],
    queryFn: () => listReceipts({ page: 1, pageSize: 5, sortBy: "createdAt", sortOrder: "desc" }),
  });

  const { data: dispatchesPage, isLoading: dispatchesLoading } = useQuery({
    queryKey: ["dashboard", "recent-dispatches"],
    queryFn: () => listDispatches({ page: 1, pageSize: 5, sortBy: "createdAt", sortOrder: "desc" }),
  });

  const { data: movementsPage, isLoading: movementsLoading } = useQuery({
    queryKey: ["dashboard", "recent-movements"],
    queryFn: () => listMovements({ page: 1, pageSize: 6, sortBy: "occurredAt", sortOrder: "desc" }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {authLoading ? "Welcome" : `Welcome back, ${user?.name?.split(" ")[0]}`}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Smarter Inventory. Less Waste. Better Distribution.
        </p>
      </header>

      {/* KPI grid — all values live from the API */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Products"
          description="Total products in the catalogue"
          icon={Package}
          value={productsPage?.meta.total}
          isLoading={productsLoading}
        />
        <KpiCard
          title="Active Warehouses"
          description="Locations currently receiving stock"
          icon={WarehouseIcon}
          value={warehousesPage?.meta.total}
          isLoading={warehousesLoading}
        />
        <KpiCard
          title="Stock Records"
          description="Active batch-warehouse stock lines"
          icon={Boxes}
          value={summary?.totalItems}
          isLoading={summaryLoading}
        />
        <KpiCard
          title="Ledger Movements"
          description="All-time immutable movement entries"
          icon={History}
          value={summary?.totalMovements}
          isLoading={summaryLoading}
        />
        <KpiCard
          title="Near-Expiry Batches"
          description="Expiring within 14 days"
          icon={Timer}
          value={nearExpiryPage?.meta.total}
          isLoading={nearExpiryLoading}
          tone="amber"
        />
        <KpiCard
          title="Expired Stock"
          description="Active batches past their expiry date"
          icon={CircleAlert}
          value={summary?.expiredBatches}
          isLoading={summaryLoading}
          tone="rose"
        />
        <KpiCard
          title="Waste (30d)"
          description={
            analytics30d?.waste.wastePercentOfReceived === null
              ? "no receipts in window — % unavailable"
              : "% of received quantity in window"
          }
          icon={Trash2}
          value={analytics30d?.waste.totalQuantity}
          isLoading={analyticsLoading}
          tone="rose"
        />
        <KpiCard
          title="Draft Stock Counts"
          description="Counts awaiting submission"
          icon={ClipboardCheck}
          value={summary?.pendingCounts}
          isLoading={summaryLoading}
        />
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" aria-hidden />
              Recent Receipts
            </CardTitle>
            <CardDescription>Latest goods received</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {receiptsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : receiptsPage && receiptsPage.items.length > 0 ? (
              receiptsPage.items.map((r) => (
                <div key={r.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">
                      {r.referenceNo ?? r.supplierName ?? "Receipt"}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400">
                      {r.items.length} {r.items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {r.warehouseName} · {new Date(r.receivedAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">No receipts recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <ArrowUpToLine className="h-4 w-4 text-rose-600" aria-hidden />
              Recent Dispatches
            </CardTitle>
            <CardDescription>Latest stock dispatched out</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dispatchesLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : dispatchesPage && dispatchesPage.items.length > 0 ? (
              dispatchesPage.items.map((d) => (
                <div key={d.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{d.referenceNo ?? "Dispatch"}</p>
                    <span className="shrink-0 text-xs text-slate-400">
                      {d.items.length} {d.items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {d.warehouseName} · {new Date(d.dispatchedAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">No dispatches recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <History className="h-4 w-4 text-sky-600" aria-hidden />
              Latest Ledger Movements
            </CardTitle>
            <CardDescription>Every quantity change, immutable</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {movementsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : movementsPage && movementsPage.items.length > 0 ? (
              movementsPage.items.map((m) => (
                <div key={m.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={MOVEMENT_BADGE[m.movementType] ?? ""}>
                      {m.movementType.replace("_", " ")}
                    </Badge>
                    <span className="font-mono text-xs">{m.quantity}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 truncate">
                    {m.productSku} · {m.warehouseName} ·{" "}
                    {new Date(m.occurredAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                No stock movements recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-slate-600 dark:text-slate-300">
          You are signed in as <strong>{user?.email}</strong> with the{" "}
          <strong>{user?.role}</strong> role.
        </CardContent>
      </Card>
    </div>
  );
}
