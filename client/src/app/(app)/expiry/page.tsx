"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProducts, listWarehouses } from "@/features/inventory-api";
import {
  getExpiryMonitor,
  getExpiryTrends,
  type ExpiryBucketName,
  type ExpiryListRow,
} from "@/features/expiry-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableEmptyRow } from "@/components/table-state";
import { statusStyle, EXPIRY_BAR } from "@/components/status-styles";
import {
  CalendarClock,
  CircleAlert,
  Clock,
  PackageOpen,
  RotateCw,
  Timer,
  TrendingDown,
  Truck,
  Trash2,
} from "lucide-react";

const BUCKET_ORDER: ExpiryBucketName[] = ["EXPIRED", "CRITICAL", "WARNING", "MONITOR", "SAFE"];

function fmtQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function daysLabel(days: number): string {
  if (days <= 0) return `expired ${Math.abs(days)}d ago`;
  return `in ${days}d`;
}

// ---------- Bucket KPI cards ----------

function BucketCards({
  buckets,
  totals,
  loading,
}: {
  buckets?: Record<ExpiryBucketName, { batches: number; totalQuantity: number }>;
  totals?: { estimatedValueAtRisk: number; quantityWithCost: number; quantityWithoutCost: number };
  loading: boolean;
}) {
  const riskData = BUCKET_ORDER.map((key) => ({
    bucket: statusStyle("expiry", key).label,
    quantity: buckets?.[key].totalQuantity ?? 0,
  }));

  return (
    <div className="space-y-4">
      <section aria-label="Expiry summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Expired Stock"
          description="Expired units still on hand"
          value={buckets?.EXPIRED.totalQuantity}
          isLoading={loading || !buckets}
          icon={CircleAlert}
          tone="danger"
        />
        <MetricCard
          title="Critical Batches"
          description="Expiring within 1–6 days"
          value={buckets?.CRITICAL.batches}
          isLoading={loading || !buckets}
          icon={Timer}
          tone="danger"
        />
        <MetricCard
          title="Warning Batches"
          description="Expiring within 7–14 days"
          value={buckets?.WARNING.batches}
          isLoading={loading || !buckets}
          icon={Clock}
          tone="warning"
        />
        <Card>
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-start justify-between gap-3">
              <CardDescription className="text-sm font-semibold text-ink">
                Est. Value at Risk
              </CardDescription>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]">
                <TrendingDown className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <CardTitle className="font-mono text-3xl leading-none tracking-tight text-[var(--status-danger-ink)]">
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                fmtMoney(totals?.estimatedValueAtRisk ?? 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-xs leading-relaxed text-ink-muted">
              estimate from receipt unit costs
              {totals && totals.quantityWithoutCost > 0
                ? ` · ${fmtQty(totals.quantityWithoutCost)} units without cost data shown quantity-only`
                : " · full cost coverage"}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-1 pb-2">
          <CardTitle>Risk distribution</CardTitle>
          <CardDescription>Ledger quantity in each server-classified expiry bucket</CardDescription>
        </CardHeader>
        <CardContent className="h-56 pt-2 sm:h-64">
          <p className="sr-only">
            Expiry risk distribution: {riskData.map((r) => `${r.bucket} ${r.quantity}`).join(", ")}.
          </p>
          <div role="img" aria-label="Quantity by expiry risk classification" className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ss-border)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--ss-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ss-muted)" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--ss-surface)",
                    color: "var(--ss-ink)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="quantity" name="Quantity" fill="var(--ss-accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- At-risk / expired tables ----------

function StockTable({ rows, expired }: { rows: ExpiryListRow[]; expired: boolean }) {
  return (
    <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Est. value</TableHead>
            <TableHead className="text-right">Act via</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmptyRow
              title={expired ? "No expired stock in the ledger." : "Nothing near expiry right now."}
              colSpan={7}
            />
          ) : null}
          {rows.length > 0 &&
            rows.map((row) => (
              <TableRow key={`${row.batchId}-${row.warehouseId}`}>
                <TableCell>
                  <code className="text-xs bg-canvas ring-1 ring-hairline px-1.5 py-0.5 rounded font-mono">
                    {row.canonicalCode}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[180px]">{row.productName}</p>
                    <p className="text-xs text-ink-muted font-mono">{row.productSku}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-ink-muted">
                  {row.warehouseCode}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge kind="expiry" value={row.expiryStatus} />
                    <span className="text-xs text-ink-muted">
                      {new Date(row.expiryDate).toLocaleDateString()} ({daysLabel(row.daysToExpiry)})
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-ink">
                  {fmtQty(row.availableQuantity)} <span className="text-xs font-sans text-ink-muted">{row.productUnit}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.estimatedValue === null ? (
                    <span className="text-ink-muted" title="No receipt unit cost — quantity only">
                      —
                    </span>
                  ) : (
                    <span className="text-ink" title="Estimate from receipt unit cost">
                      ~{fmtMoney(row.estimatedValue)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Never offer dispatch for expired, quarantined or recalled
                        stock — the server also revalidates eligibility. */}
                    {row.batchStatus === "ACTIVE" && row.expiryStatus !== "EXPIRED" ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href="/dispatch" title="Dispatch this stock (existing workflow)">
                          <Truck className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="outline" size="sm">
                      <Link href="/waste" title="Record waste (existing workflow)">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Trends ----------

function TrendsSection({
  warehouseId,
  productId,
}: {
  warehouseId: string;
  productId: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["expiry", "trends", warehouseId, productId],
    queryFn: () =>
      getExpiryTrends({
        months: 12,
        warehouseId: warehouseId !== "all" ? warehouseId : undefined,
        productId: productId !== "all" ? productId : undefined,
      }),
  });

  if (isError) {
    return (
      <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-6 text-center text-sm text-ink-muted">
        Failed to load waste trends.
      </div>
    );
  }

  const maxQty = Math.max(1, ...(data?.series.map((m) => m.totalWasteQuantity) ?? [1]));

  return (
    <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-ink flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Historical expiry-related waste (last 12 months, from actual waste records)
        </p>
        {data && (
          <p className="text-xs text-ink-muted">
            {fmtQty(data.totals.expiredQuantity)} units wasted as expired ·{" "}
            {data.totals.expiredRecords} records · {fmtQty(data.totals.totalWasteQuantity)} total waste
          </p>
        )}
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.series.map((m) => (
            <div key={m.month} className="flex items-center gap-2 text-xs">
              <span className="w-14 shrink-0 font-mono text-ink-muted">{m.month}</span>
              <div className="flex-1 h-4 rounded bg-canvas overflow-hidden">
                <div
                  className={`h-full ${m.expiredQuantity > 0 ? EXPIRY_BAR.EXPIRED : "bg-hairline"}`}
                  style={{ width: `${Math.max(2, (m.totalWasteQuantity / maxQty) * 100)}%` }}
                  title={`${fmtQty(m.expiredQuantity)} expired / ${fmtQty(m.totalWasteQuantity)} total waste`}
                />
              </div>
              <span className="w-36 shrink-0 text-right font-mono text-ink-muted">
                {fmtQty(m.expiredQuantity)} expired
              </span>
            </div>
          ))}
        </div>
      )}

      {data && (data.byWarehouse.length > 0 || data.byProduct.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-hairline">
          <div>
            <p className="text-xs font-medium text-ink-muted mb-2">Expired waste by warehouse</p>
            <div className="flex flex-wrap gap-2">
              {data.byWarehouse.map((w) => (
                <Badge
                  key={w.id}
                  variant="outline"
                  className={statusStyle("expiry", "EXPIRED").className}
                >
                  {w.code}: {fmtQty(w.expiredQuantity)}
                </Badge>
              ))}
              {data.byWarehouse.length === 0 && <span className="text-xs text-ink-muted">—</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-2">Expired waste by product</p>
            <div className="flex flex-wrap gap-2">
              {data.byProduct.map((p) => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={statusStyle("expiry", "EXPIRED").className}
                >
                  {p.code}: {fmtQty(p.expiredQuantity)}
                </Badge>
              ))}
              {data.byProduct.length === 0 && <span className="text-xs text-ink-muted">—</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
  });

  const { data: products } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" }),
  });

  const monitorParams = {
    warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
    productId: productFilter !== "all" ? productFilter : undefined,
  };

  const {
    data: monitor,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["expiry", "monitor", warehouseFilter, productFilter],
    queryFn: () => getExpiryMonitor(monitorParams),
  });

  const resetFilters = () => {
    setWarehouseFilter("all");
    setProductFilter("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiry Intelligence"
        description="Monitor shelf life and identify inventory at risk."
      />

      {/* Filters */}
      <FilterBar onReset={resetFilters} resetDisabled={warehouseFilter === "all" && productFilter === "all"}>
        <Select
          value={warehouseFilter}
          onValueChange={setWarehouseFilter}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses?.items.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={productFilter}
          onValueChange={setProductFilter}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products?.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {isError ? (
        <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-10 text-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <CircleAlert className="h-8 w-8 text-[var(--status-danger-ink)]" aria-hidden />
            <p className="font-medium text-ink">
              Failed to load expiry monitor
            </p>
            {error instanceof Error && error.message ? (
              <p className="max-w-md truncate text-xs text-ink-muted">{error.message}</p>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refetch()} aria-label="Retry loading">
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <BucketCards
            buckets={monitor?.buckets}
            totals={monitor?.totals}
            loading={isLoading}
          />

          {/* Near-expiry */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-[var(--status-warning-ink)]" aria-hidden />
              <h2 className="font-semibold text-ink">Near-expiry stock</h2>
              <span className="text-xs text-ink-muted">
                1–30 days to expiry · most urgent first · max 100 rows
              </span>
            </div>
            {isLoading ? (
              <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <StockTable rows={monitor?.atRisk ?? []} expired={false} />
            )}
          </div>

          {/* Expired */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-[var(--status-danger-ink)]" aria-hidden />
              <h2 className="font-semibold text-ink">Expired stock</h2>
              <span className="text-xs text-ink-muted">
                still holding positive ledger balance · most overdue first
              </span>
            </div>
            {isLoading ? (
              <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <StockTable rows={monitor?.expired ?? []} expired={true} />
            )}
          </div>

          {/* Trends */}
          <TrendsSection warehouseId={warehouseFilter} productId={productFilter} />

          {/* Per-warehouse breakdown */}
          {monitor && monitor.warehouses.length > 0 && (
            <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-4">
              <p className="text-sm font-medium text-ink mb-3">
                Warehouse breakdown
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {monitor.warehouses.map((wh) => (
                  <div key={wh.warehouseId} className="rounded-lg border border-hairline p-3">
                    <p className="text-sm font-medium">{wh.warehouseName}</p>
                    <p className="text-xs text-ink-muted mb-2">
                      {wh.warehouseCode} · total {fmtQty(wh.totalQuantity)} · est. value{" "}
                      {wh.estimatedValueAtRisk > 0 ? `~${fmtMoney(wh.estimatedValueAtRisk)}` : "—"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {BUCKET_ORDER.filter((b) => wh.buckets[b] > 0).map((b) => (
                        <StatusBadge
                          key={b}
                          kind="expiry"
                          value={b}
                          label={`${statusStyle("expiry", b).label}: ${fmtQty(wh.buckets[b])}`}
                        />
                      ))}
                      {BUCKET_ORDER.every((b) => wh.buckets[b] === 0) && (
                        <span className="text-xs text-ink-muted">no stock</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {monitor && monitor.totals.batchesWithStock === 0 && monitor.warehouses.length === 0 && (
            <div className="rounded-2xl bg-surface shadow-surface ring-1 ring-hairline p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2">
                <PackageOpen className="h-8 w-8 text-ink-muted" />
                <p className="font-medium text-ink">
                  No stock in scope
                </p>
                <p className="text-xs text-ink-muted">
                  Batches appear here once they have ledger movement history.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
