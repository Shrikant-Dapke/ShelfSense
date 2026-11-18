"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { PageHeader } from "@/components/page-header";
import { MovementChart, WarehouseDistributionChart } from "./charts";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  Boxes,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Coins,
  FileUp,
  History,
  Package,
  Percent,
  RotateCw,
  Timer,
  Trash2,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";

/**
 * Inventory intelligence dashboard. Every number comes from an existing
 * endpoint: /expiry/monitor (expiry KPIs, alerts, warehouse overview),
 * /analytics/summary 30d (stock, movement series, waste) and
 * /stock-counts (pending worklist). No trends or values are synthesized.
 */

type KpiTone = "danger" | "warning" | "info" | "neutral";

const TONE_STYLES: Record<KpiTone, { tile: string; value: string }> = {
  danger: {
    tile: "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]",
    value: "text-[var(--status-danger-ink)]",
  },
  warning: {
    tile: "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]",
    value: "text-[var(--status-warning-ink)]",
  },
  info: {
    tile: "bg-[var(--status-info-soft)] text-[var(--status-info-ink)]",
    value: "text-[var(--status-info-ink)]",
  },
  neutral: {
    tile: "bg-brand/20 text-ink",
    value: "text-ink",
  },
};

function KpiCard({
  title,
  description,
  icon: Icon,
  value,
  isLoading,
  tone = "neutral",
  compact = false,
}: {
  title: string;
  description: string;
  icon: typeof Package;
  /** undefined = not loaded (skeleton); null = unavailable (em dash). */
  value: number | null | undefined;
  isLoading: boolean;
  tone?: KpiTone;
  compact?: boolean;
}) {
  const style = TONE_STYLES[tone];
  return (
    <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className={compact ? "gap-1 pb-1" : "gap-3 pb-2"}>
        <div className="flex items-start justify-between gap-3">
          <CardDescription className={compact ? "text-xs" : "text-sm font-semibold text-ink"}>
            {title}
          </CardDescription>
          <span
            className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? "size-8" : "size-10"} ${style.tile}`}
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </span>
        </div>
        <CardTitle
          className={`font-mono tracking-tight ${compact ? "text-2xl" : "text-[2rem] leading-none sm:text-4xl"} ${style.value}`}
        >
          {isLoading ? <Skeleton className="h-8 w-20" aria-label={`Loading ${title}`} /> : (value?.toLocaleString() ?? "—")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <p className="text-xs leading-relaxed text-ink-muted">{description}</p>
      </CardContent>
    </Card>
  );
}

/** Compact per-card error line with its own retry. */
function ListErrorLine({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CircleAlert className="h-5 w-5 text-[var(--status-danger-ink)]" aria-hidden />
      <p className="text-sm text-[var(--status-danger-ink)]">
        Failed to load — {error instanceof Error ? error.message : "unknown error"}
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

function WorklistRow({ row }: { row: ExpiryListRow }) {
  const actions = nearExpiryRowActions(row);
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 font-medium text-ink">
          <span className="truncate font-mono text-xs">{row.canonicalCode}</span>
          <span className="truncate text-ink-muted">
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
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>
          {row.warehouseName} ({row.warehouseCode}) · {row.availableQuantity.toLocaleString()}{" "}
          {row.productUnit} ·{" "}
          {row.expiryStatus === "EXPIRED"
            ? `expired ${formatDays(Math.abs(row.daysToExpiry))} ago`
            : `expires in ${formatDays(row.daysToExpiry)}`}
        </span>
        <span className="flex items-center gap-3">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="rounded-lg border border-hairline bg-canvas p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate font-medium text-ink">
          {count.referenceNo ?? `Count ${count.id.slice(0, 8)}`}
        </p>
        <StatusBadge kind="countStatus" value={count.status} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
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
          className="font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  // Expired batches are real, separate records from the at-risk worklist.
  const alertRows = [...(monitor?.expired ?? []), ...nearExpiryRows];
  const pendingCountRows = mergePendingCounts(pendingCountsPage?.items, submittedCountsPage?.items);
  const warehouseRows = warehouseSummaries(monitor);
  const quickActions = quickActionsFor(user);
  const countsLoading = pendingCountsLoading || submittedCountsLoading;
  const nearExpiryTotal = monitor
    ? monitor.atRisk.length + monitor.expired.length
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Inventory intelligence at a glance."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted">
            {analytics30d ? (
              <span className="rounded-full border border-hairline bg-surface px-3 py-1.5">
                Last {analytics30d.period}
              </span>
            ) : null}
            {analytics30d ? (
              <span className="rounded-full border border-hairline bg-surface px-3 py-1.5">
                {analytics30d.inventory.activeWarehouses} active warehouses
              </span>
            ) : null}
          </div>
        }
      />

      {failedQueries.length > 0 ? (
        <Card className="border-[var(--status-danger-border)] bg-[var(--status-danger-soft)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
            <div className="flex items-center gap-2 text-[var(--status-danger-ink)]">
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

      {/* Primary KPIs — all sourced from /expiry/monitor and /analytics/summary */}
      <section aria-label="Primary inventory metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          tone="warning"
        />
        <KpiCard
          title="Expired Holding"
          description="Quantity of expired stock still on hand"
          icon={CircleAlert}
          value={monitor?.buckets.EXPIRED.totalQuantity}
          isLoading={monitorLoading}
          tone="danger"
        />
        <KpiCard
          title="Est. Value at Risk"
          description={
            kpiValueAtRisk === null ? "no cost data for stock on hand" : "Estimated value of stock on hand"
          }
          icon={Coins}
          value={kpiValueAtRisk}
          isLoading={monitorLoading}
          tone="danger"
        />
      </section>

      {/* Secondary operational KPIs — kept compact, same real data sources */}
      <section aria-label="Operational metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Waste (30d)"
          description="Quantity written off in the last 30 days"
          icon={Trash2}
          value={analytics30d?.waste.totalQuantity}
          isLoading={analyticsLoading}
          tone="danger"
          compact
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
          tone="danger"
          compact
        />
        <KpiCard
          title="Pending Stock Counts"
          description="Drafts + counts awaiting review"
          icon={ClipboardCheck}
          value={kpiPendingCounts}
          isLoading={countsLoading}
          tone="warning"
          compact
        />
        <KpiCard
          title="Watchlist (15-30d)"
          description="Batches entering the near-expiry window"
          icon={CalendarClock}
          value={monitor?.buckets.MONITOR.batches}
          isLoading={monitorLoading}
          tone="info"
          compact
        />
      </section>

      {/* Analytics — real series from the single 30d summary query */}
      <section aria-label="Inventory analytics" className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MovementChart analytics={analytics30d} isLoading={analyticsLoading} />
        </div>
        <WarehouseDistributionChart analytics={analytics30d} isLoading={analyticsLoading} />
      </section>

      {/* Alerts and actionable worklists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-[var(--status-danger-ink)]" aria-hidden />
              Critical alerts & expiry intelligence
            </CardTitle>
            <CardDescription>
              Expired stock first, then most urgent batches (within 30 days). Expired, quarantined and
              recalled stock is never suggested for dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {monitorLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            ) : monitorError ? (
              <ListErrorLine error={monitorErr} onRetry={() => void refetchMonitor()} />
            ) : alertRows.length > 0 ? (
              <>
                {alertRows.map((row) => (
                  <WorklistRow key={`${row.batchId}-${row.warehouseId}`} row={row} />
                ))}
                <Link
                  href="/expiry"
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View all in Expiry
                  {nearExpiryTotal !== undefined && nearExpiryTotal > 5
                    ? ` (${nearExpiryTotal} at-risk lines)`
                    : ""}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">
                Nothing approaching expiry within 30 days.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[var(--status-warning-ink)]" aria-hidden />
              Pending Stock Counts
            </CardTitle>
            <CardDescription>
              Submitted counts awaiting review, then drafts — oldest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {countsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
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
                  className="flex items-center justify-end gap-1 pt-1 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View all in Stock Counts
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">No pending stock counts.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Role-aware quick actions */}
      <section aria-label="Quick actions">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
          Quick Actions
        </h2>
        {authLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : quickActions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.key];
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-brand group-hover:shadow-lg">
                    <CardContent className="flex items-start gap-3 pt-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/20 text-ink transition-colors group-hover:bg-brand group-hover:text-brand-ink">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{action.label}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted">{action.description}</span>
                      </span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
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
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
          Warehouse Overview
        </h2>
        {monitorLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
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
              <Card key={wh.warehouseId} className="h-full">
                <CardHeader className="gap-1 pb-2">
                  <CardDescription className="flex items-center gap-1.5 font-mono text-xs">
                    <WarehouseIcon className="h-3.5 w-3.5" aria-hidden />
                    {wh.code}
                  </CardDescription>
                  <CardTitle className="text-base text-ink">{wh.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="font-mono text-2xl font-bold tracking-tight text-ink">
                    {wh.totalQuantity.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-ink-muted">on hand</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {wh.criticalQuantity > 0 ? (
                      <span className="rounded-full bg-[var(--status-warning-soft)] px-2 py-0.5 font-semibold text-[var(--status-warning-ink)]">
                        {wh.criticalQuantity.toLocaleString()} critical
                      </span>
                    ) : null}
                    {wh.warningQuantity > 0 ? (
                      <span className="rounded-full bg-[var(--status-warning-soft)] px-2 py-0.5 font-semibold text-[var(--status-warning-ink)]">
                        {wh.warningQuantity.toLocaleString()} warning
                      </span>
                    ) : null}
                    {wh.expiredQuantity > 0 ? (
                      <span className="rounded-full bg-[var(--status-danger-soft)] px-2 py-0.5 font-semibold text-[var(--status-danger-ink)]">
                        {wh.expiredQuantity.toLocaleString()} expired
                      </span>
                    ) : null}
                    {wh.criticalQuantity === 0 && wh.warningQuantity === 0 && wh.expiredQuantity === 0 ? (
                      <span className="rounded-full bg-[var(--status-success-soft)] px-2 py-0.5 font-semibold text-[var(--status-success-ink)]">
                        no expiry pressure
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-3 pt-1 text-xs font-semibold">
                    <Link href="/inventory" className="text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Inventory →
                    </Link>
                    <Link href="/expiry" className="text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Expiry →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-ink-muted">
            No stock on hand yet — warehouse summaries appear once stock is received.
          </p>
        )}
      </section>

      {/* Recent activity — operational worklists from real list endpoints */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-[var(--status-success-ink)]" aria-hidden />
              Recent Receipts
            </CardTitle>
            <CardDescription>Latest goods received</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {receiptsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : receiptsError ? (
              <ListErrorLine error={receiptsErr} onRetry={() => void refetchReceipts()} />
            ) : receiptsPage && receiptsPage.items.length > 0 ? (
              <>
                {receiptsPage.items.map((r) => (
                  <div key={r.id} className="rounded-lg border border-hairline bg-canvas p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-ink">
                        {r.referenceNo ?? r.supplierName ?? "Receipt"}
                      </p>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {r.items.length} {r.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {r.warehouseName} · {new Date(r.receivedAt).toLocaleDateString()}
                      {r.createdByName ? ` · by ${r.createdByName}` : ""}
                    </p>
                  </div>
                ))}
                <Link href="/receipts" className="flex items-center justify-end gap-1 pt-1 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">No receipts recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ArrowUpToLine className="h-4 w-4 text-[var(--status-danger-ink)]" aria-hidden />
              Recent Dispatches
            </CardTitle>
            <CardDescription>Latest stock dispatched out</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dispatchesLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : dispatchesError ? (
              <ListErrorLine error={dispatchesErr} onRetry={() => void refetchDispatches()} />
            ) : dispatchesPage && dispatchesPage.items.length > 0 ? (
              <>
                {dispatchesPage.items.map((d) => (
                  <div key={d.id} className="rounded-lg border border-hairline bg-canvas p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-ink">{d.referenceNo ?? "Dispatch"}</p>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {d.items.length} {d.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {d.warehouseName} · {new Date(d.dispatchedAt).toLocaleDateString()}
                      {d.createdByName ? ` · by ${d.createdByName}` : ""}
                    </p>
                  </div>
                ))}
                <Link href="/dispatch" className="flex items-center justify-end gap-1 pt-1 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">No dispatches recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--status-info-ink)]" aria-hidden />
              Latest Ledger Movements
            </CardTitle>
            <CardDescription>Every quantity change, immutable</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {movementsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : movementsError ? (
              <ListErrorLine error={movementsErr} onRetry={() => void refetchMovements()} />
            ) : movementsPage && movementsPage.items.length > 0 ? (
              <>
                {movementsPage.items.map((m) => (
                  <div key={m.id} className="rounded-lg border border-hairline bg-canvas p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge kind="movement" value={m.movementType} />
                      <span className="font-mono text-xs text-ink">{m.quantity}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-muted">
                      {m.productSku} · {m.warehouseName} · {new Date(m.occurredAt).toLocaleString()}
                    </p>
                  </div>
                ))}
                <Link href="/inventory" className="flex items-center justify-end gap-1 pt-1 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">
                No stock movements recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-canvas">
        <CardContent className="pt-6 text-sm text-ink-muted">
          You are signed in as <strong className="text-ink">{user?.email}</strong> with the{" "}
          <strong className="text-ink">{user?.role}</strong> role.
        </CardContent>
      </Card>
    </div>
  );
}
