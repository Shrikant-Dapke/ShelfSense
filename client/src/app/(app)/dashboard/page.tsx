"use client";

import { useQuery } from "@tanstack/react-query";
import {
  listDispatches,
  listMovements,
  listReceipts,
  listStockCounts,
  type StockCountView,
} from "@/features/inventory-api";
import { getAnalyticsSummary } from "@/features/analytics-api";
import { getExpiryMonitor, type ExpiryListRow } from "@/features/expiry-api";
import {
  mergePendingCounts,
  nearExpiryBatchCount,
  nearExpiryRowActions,
  pendingCountTaskTotal,
  quickActionsFor,
  topNearExpiryRows,
  valueAtRisk,
  warehouseSummaries,
} from "@/features/dashboard-helpers";
import { useAuth } from "@/features/auth/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { CircleAlert, RotateCw } from "lucide-react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  Boxes,
  CircleAlert as CircleAlertIcon,
  ClipboardCheck,
  Coins,
  FileUp,
  History,
  Package,
  Percent,
  Timer,
  CalendarClock,
  Trash2,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";

/**
 * Operational dashboard. Every number comes from an existing endpoint:
 * `/expiry/monitor` (expiry KPIs, near-expiry worklist, warehouse overview),
 * `/analytics/summary` 30d (total stock, waste KPIs) and
 * `/stock-counts?status=PENDING|SUBMITTED` (pending worklist). A missing
 * value renders as an em dash — loading shows a skeleton, failures show the
 * error banner, and a real zero is only ever a real zero.
 */

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
  /** undefined = not loaded (skeleton); null = unavailable (em dash). */
  value: number | null | undefined;
  isLoading: boolean;
  tone?: "rose" | "amber" | "sky";
}) {
  const valueClass =
    tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "sky"
          ? "text-sky-600 dark:text-sky-400"
          : "text-slate-900 dark:text-white";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {title}
        </CardDescription>
        <CardTitle className={`text-3xl ${valueClass}`}>
          {isLoading ? <Skeleton className="h-8 w-16" /> : (value?.toLocaleString() ?? "—")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
}

/** Compact per-card error line with its own retry. */
function ListErrorLine({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CircleAlertIcon className="h-5 w-5 text-rose-400" aria-hidden />
      <p className="text-sm text-rose-600 dark:text-rose-400">
        Failed to load · {error instanceof Error ? error.message : "unknown error"}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} aria-label="Retry loading">
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}

function formatDays(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

function NearExpiryRow({ row }: { row: ExpiryListRow }) {
  const actions = nearExpiryRowActions(row);
  return (
    <div className="rounded-lg border p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <span className="truncate font-mono text-xs">{row.canonicalCode}</span>
          <span className="truncate text-slate-500">
            {row.productSku} · {row.productName}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge kind="expiry" value={row.expiryStatus} />
          {row.batchStatus !== "ACTIVE" ? (
            <StatusBadge kind="batchStatus" value={row.batchStatus} />
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {row.warehouseName} ({row.warehouseCode}) · {row.availableQuantity.toLocaleString()}{" "}
          {row.productUnit} · expires in {formatDays(row.daysToExpiry)}
        </span>
        <span className="flex items-center gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
            >
              {action.label}
            </Link>
          ))}
        </span>
      </div>
    </div>
  );
}

function PendingCountRow({ count }: { count: StockCountView }) {
  return (
    <div className="rounded-lg border p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate font-medium">{count.referenceNo ?? `Count ${count.id.slice(0, 8)}`}</p>
        <StatusBadge kind="countStatus" value={count.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {count.warehouseName} ({count.warehouseCode}) ·{" "}
          {new Date(count.createdAt).toLocaleDateString()}
          {count.items.length > 0 ? ` · ${count.items.length} lines` : ""}
          {count.totalVariance !== 0
            ? ` · variance ${count.totalVariance > 0 ? "+" : ""}${count.totalVariance.toLocaleString()}`
            : ""}
        </span>
        <Link
          href="/stock-counts"
          className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
        >
          Open stock counts
        </Link>
      </div>
    </div>
  );
}

const QUICK_ACTION_ICONS: Record<string, typeof Package> = {
  receipt: ArrowDownToLine,
  dispatch: Truck,
  waste: Trash2,
  count: ClipboardCheck,
  product: Package,
  import: FileUp,
};

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();

  const {
    data: monitor,
    isLoading: monitorLoading,
    isError: monitorError,
    error: monitorErr,
    refetch: refetchMonitor,
  } = useQuery({
    queryKey: ["dashboard", "expiry-monitor"],
    queryFn: () => getExpiryMonitor(),
  });

  const {
    data: analytics30d,
    isLoading: analyticsLoading,
    isError: analyticsError,
    error: analyticsErr,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["dashboard", "analytics-30d"],
    queryFn: () => getAnalyticsSummary({ period: "30d" }),
  });

  const {
    data: pendingCountsPage,
    isLoading: pendingCountsLoading,
    isError: pendingCountsError,
    error: pendingCountsErr,
    refetch: refetchPendingCounts,
  } = useQuery({
    queryKey: ["dashboard", "counts-pending"],
    queryFn: () =>
      listStockCounts({ status: "PENDING", sortBy: "createdAt", sortOrder: "asc", page: 1, pageSize: 5 }),
  });

  const {
    data: submittedCountsPage,
    isLoading: submittedCountsLoading,
    isError: submittedCountsError,
    error: submittedCountsErr,
    refetch: refetchSubmittedCounts,
  } = useQuery({
    queryKey: ["dashboard", "counts-submitted"],
    queryFn: () =>
      listStockCounts({ status: "SUBMITTED", sortBy: "createdAt", sortOrder: "asc", page: 1, pageSize: 5 }),
  });

  const {
    data: receiptsPage,
    isLoading: receiptsLoading,
    isError: receiptsError,
    error: receiptsErr,
    refetch: refetchReceipts,
  } = useQuery({
    queryKey: ["dashboard", "recent-receipts"],
    queryFn: () => listReceipts({ page: 1, pageSize: 5, sortBy: "createdAt", sortOrder: "desc" }),
  });

  const {
    data: dispatchesPage,
    isLoading: dispatchesLoading,
    isError: dispatchesError,
    error: dispatchesErr,
    refetch: refetchDispatches,
  } = useQuery({
    queryKey: ["dashboard", "recent-dispatches"],
    queryFn: () => listDispatches({ page: 1, pageSize: 5, sortBy: "createdAt", sortOrder: "desc" }),
  });

  const {
    data: movementsPage,
    isLoading: movementsLoading,
    isError: movementsError,
    error: movementsErr,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ["dashboard", "recent-movements"],
    queryFn: () => listMovements({ page: 1, pageSize: 6, sortBy: "occurredAt", sortOrder: "desc" }),
  });

  const failedQueries: Array<{ label: string; retry: () => void }> = [];
  if (monitorError) failedQueries.push({ label: "expiry monitor", retry: () => void refetchMonitor() });
  if (analyticsError) failedQueries.push({ label: "waste summary (30d)", retry: () => void refetchAnalytics() });
  if (pendingCountsError)
    failedQueries.push({ label: "pending stock counts", retry: () => void refetchPendingCounts() });
  if (submittedCountsError)
    failedQueries.push({ label: "submitted stock counts", retry: () => void refetchSubmittedCounts() });
  if (receiptsError) failedQueries.push({ label: "recent receipts", retry: () => void refetchReceipts() });
  if (dispatchesError)
    failedQueries.push({ label: "recent dispatches", retry: () => void refetchDispatches() });
  if (movementsError)
    failedQueries.push({ label: "ledger movements", retry: () => void refetchMovements() });

  const retryAll = () => {
    failedQueries.forEach((q) => q.retry());
  };

  const kpiPendingCounts = pendingCountTaskTotal(pendingCountsPage, submittedCountsPage);
  const kpiValueAtRisk = valueAtRisk(monitor);
  const nearExpiryRows = topNearExpiryRows(monitor);
  const pendingCountRows = mergePendingCounts(pendingCountsPage?.items, submittedCountsPage?.items);
  const warehouseRows = warehouseSummaries(monitor);
  const quickActions = quickActionsFor(user);
  const countsLoading = pendingCountsLoading || submittedCountsLoading;
  const nearExpiryTotal = monitor
    ? monitor.atRisk.length + monitor.expired.length
    : undefined;

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

      {failedQueries.length > 0 ? (
        <Card className="border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
              <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Some dashboard data failed to load: {failedQueries.map((q) => q.label).join(", ")}.
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={retryAll} aria-label="Retry failed dashboard requests">
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Retry all
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* KPI grid — every value is either loaded, loading, unavailable (—) or a real zero */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Stock"
          description="Quantity on hand across all warehouses"
          icon={Boxes}
          value={analytics30d?.inventory.totalStockQuantity}
          isLoading={analyticsLoading}
        />
        <KpiCard
          title="Near-Expiry Batches"
          description="Expiring within 14 days (critical + warning)"
          icon={Timer}
          value={nearExpiryBatchCount(monitor)}
          isLoading={monitorLoading}
          tone="amber"
        />
        <KpiCard
          title="Expired Holding"
          description="Quantity of expired stock still on hand"
          icon={CircleAlertIcon}
          value={monitor?.buckets.EXPIRED.totalQuantity}
          isLoading={monitorLoading}
          tone="rose"
        />
        <KpiCard
          title="Est. Value at Risk"
          description={
            kpiValueAtRisk === null ? "no cost data for stock on hand" : "Estimated value of stock on hand"
          }
          icon={Coins}
          value={kpiValueAtRisk}
          isLoading={monitorLoading}
          tone="rose"
        />
        <KpiCard
          title="Waste (30d)"
          description="Quantity written off in the last 30 days"
          icon={Trash2}
          value={analytics30d?.waste.totalQuantity}
          isLoading={analyticsLoading}
          tone="rose"
        />
        <KpiCard
          title="Waste % of Received"
          description={
            analytics30d?.waste.wastePercentOfReceived == null
              ? "no receipts in window — % unavailable"
              : "% of received quantity in window"
          }
          icon={Percent}
          value={analytics30d?.waste.wastePercentOfReceived ?? undefined}
          isLoading={analyticsLoading}
          tone="rose"
        />
        <KpiCard
          title="Pending Stock Counts"
          description="Drafts + counts awaiting review"
          icon={ClipboardCheck}
          value={kpiPendingCounts}
          isLoading={countsLoading}
          tone="amber"
        />
        <KpiCard
          title="Watchlist (15-30d)"
          description="Batches entering the near-expiry window"
          icon={CalendarClock}
          value={monitor?.buckets.MONITOR.batches}
          isLoading={monitorLoading}
          tone="sky"
        />
      </div>

      {/* Needs attention */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <Timer className="h-4 w-4 text-amber-600" aria-hidden />
              Near-Expiry Batches
            </CardTitle>
            <CardDescription>
              Most urgent stock (within 30 days). Expired, quarantined and recalled stock is never
              suggested for dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {monitorLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : monitorError ? (
              <ListErrorLine error={monitorErr} onRetry={() => void refetchMonitor()} />
            ) : nearExpiryRows.length > 0 ? (
              <>
                {nearExpiryRows.map((row) => (
                  <NearExpiryRow key={`${row.batchId}-${row.warehouseId}`} row={row} />
                ))}
                <Link
                  href="/expiry"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                >
                  View all in Expiry
                  {nearExpiryTotal !== undefined && nearExpiryTotal > 5
                    ? ` (${nearExpiryTotal} at-risk lines)`
                    : ""}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                Nothing approaching expiry within 30 days.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <ClipboardCheck className="h-4 w-4 text-amber-600" aria-hidden />
              Pending Stock Counts
            </CardTitle>
            <CardDescription>
              Submitted counts awaiting review, then drafts — oldest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {countsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : pendingCountsError || submittedCountsError ? (
              <ListErrorLine
                error={pendingCountsError ? pendingCountsErr : submittedCountsErr}
                onRetry={() => {
                  if (pendingCountsError) void refetchPendingCounts();
                  if (submittedCountsError) void refetchSubmittedCounts();
                }}
              />
            ) : pendingCountRows.length > 0 ? (
              <>
                {pendingCountRows.map((count) => (
                  <PendingCountRow key={count.id} count={count} />
                ))}
                <Link
                  href="/stock-counts"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                >
                  View all in Stock Counts
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">No pending stock counts.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Role-aware quick actions */}
      <section aria-label="Quick actions">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Quick Actions
        </h2>
        {authLoading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-56 rounded-xl" />
            ))}
          </div>
        ) : quickActions.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.key];
              return (
                <Link key={action.key} href={action.href} className="group">
                  <Card className="h-full w-56 transition-colors group-hover:border-teal-300 group-hover:bg-teal-50/40 dark:group-hover:border-teal-800 dark:group-hover:bg-teal-950/20">
                    <CardContent className="flex items-start gap-3 pt-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
                        <Icon className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 dark:text-white">
                          {action.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {action.description}
                        </span>
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Warehouse overview */}
      <section aria-label="Warehouse overview">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Warehouse Overview
        </h2>
        {monitorLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : monitorError ? (
          <Card>
            <CardContent className="pt-4">
              <ListErrorLine error={monitorErr} onRetry={() => void refetchMonitor()} />
            </CardContent>
          </Card>
        ) : warehouseRows.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {warehouseRows.map((wh) => (
              <Card key={wh.warehouseId}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <WarehouseIcon className="h-3.5 w-3.5" aria-hidden />
                    {wh.code}
                  </CardDescription>
                  <CardTitle className="text-base text-slate-900 dark:text-white">{wh.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {wh.totalQuantity.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-slate-400">on hand</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {wh.criticalQuantity > 0 ? (
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                        {wh.criticalQuantity.toLocaleString()} critical
                      </span>
                    ) : null}
                    {wh.warningQuantity > 0 ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        {wh.warningQuantity.toLocaleString()} warning
                      </span>
                    ) : null}
                    {wh.expiredQuantity > 0 ? (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        {wh.expiredQuantity.toLocaleString()} expired
                      </span>
                    ) : null}
                    {wh.criticalQuantity === 0 && wh.warningQuantity === 0 && wh.expiredQuantity === 0 ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        no expiry pressure
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-3 pt-1 text-xs font-medium">
                    <Link
                      href="/inventory"
                      className="text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                    >
                      Inventory →
                    </Link>
                    <Link
                      href="/expiry"
                      className="text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                    >
                      Expiry →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-slate-400">
            No stock on hand yet — warehouse summaries appear once stock is received.
          </p>
        )}
      </section>

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
            ) : receiptsError ? (
              <ListErrorLine error={receiptsErr} onRetry={() => void refetchReceipts()} />
            ) : receiptsPage && receiptsPage.items.length > 0 ? (
              <>
                {receiptsPage.items.map((r) => (
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
                      {r.createdByName ? ` · by ${r.createdByName}` : ""}
                    </p>
                  </div>
                ))}
                <Link
                  href="/receipts"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
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
            ) : dispatchesError ? (
              <ListErrorLine error={dispatchesErr} onRetry={() => void refetchDispatches()} />
            ) : dispatchesPage && dispatchesPage.items.length > 0 ? (
              <>
                {dispatchesPage.items.map((d) => (
                  <div key={d.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{d.referenceNo ?? "Dispatch"}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {d.items.length} {d.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {d.warehouseName} · {new Date(d.dispatchedAt).toLocaleDateString()}
                      {d.createdByName ? ` · by ${d.createdByName}` : ""}
                    </p>
                  </div>
                ))}
                <Link
                  href="/dispatch"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
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
            ) : movementsError ? (
              <ListErrorLine error={movementsErr} onRetry={() => void refetchMovements()} />
            ) : movementsPage && movementsPage.items.length > 0 ? (
              <>
                {movementsPage.items.map((m) => (
                  <div key={m.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge kind="movement" value={m.movementType} />
                      <span className="font-mono text-xs">{m.quantity}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 truncate">
                      {m.productSku} · {m.warehouseName} ·{" "}
                      {new Date(m.occurredAt).toLocaleString()}
                    </p>
                  </div>
                ))}
                <Link
                  href="/inventory"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
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
