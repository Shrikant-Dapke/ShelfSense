"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProducts, listWarehouses, type InventoryItemView } from "@/features/inventory-api";
import {
  getExpiryMonitor,
  getExpiryTrends,
  type ExpiryBucketName,
  type ExpiryListRow,
} from "@/features/expiry-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CalendarClock,
  CircleAlert,
  Clock,
  PackageOpen,
  ShieldCheck,
  Timer,
  TrendingDown,
  Truck,
  Trash2,
} from "lucide-react";

const BUCKET_STYLE: Record<ExpiryBucketName, { badge: string; label: string; bar: string }> = {
  SAFE: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    label: "Safe",
    bar: "bg-emerald-500",
  },
  MONITOR: {
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    label: "Monitor",
    bar: "bg-sky-500",
  },
  WARNING: {
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    label: "Warning",
    bar: "bg-amber-500",
  },
  CRITICAL: {
    badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    label: "Critical",
    bar: "bg-orange-500",
  },
  EXPIRED: {
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    label: "Expired",
    bar: "bg-rose-500",
  },
};

const EXPIRY_BADGE: Record<InventoryItemView["expiryStatus"], string> = {
  SAFE: BUCKET_STYLE.SAFE.badge,
  MONITOR: BUCKET_STYLE.MONITOR.badge,
  WARNING: BUCKET_STYLE.WARNING.badge,
  CRITICAL: BUCKET_STYLE.CRITICAL.badge,
  EXPIRED: BUCKET_STYLE.EXPIRED.badge,
};

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
  const cards: Array<{ key: ExpiryBucketName | "VALUE" }> = [
    ...BUCKET_ORDER.map((b) => ({ key: b })),
    { key: "VALUE" as const },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        if (card.key === "VALUE") {
          return (
            <div key="value" className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
              <p className="text-sm text-slate-500 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                Est. value at risk
              </p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1 text-3xl font-semibold font-mono text-slate-900 dark:text-white">
                  {fmtMoney(totals?.estimatedValueAtRisk ?? 0)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                estimate from receipt unit costs
                {totals && totals.quantityWithoutCost > 0
                  ? ` · ${fmtQty(totals.quantityWithoutCost)} units without cost data shown quantity-only`
                  : " · full cost coverage"}
              </p>
            </div>
          );
        }
        const bucket = buckets?.[card.key];
        const style = BUCKET_STYLE[card.key];
        return (
          <div key={card.key} className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
            <p className="text-sm text-slate-500 flex items-center gap-1.5">
              {card.key === "EXPIRED" ? (
                <CircleAlert className="h-3.5 w-3.5" aria-hidden />
              ) : card.key === "SAFE" ? (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Clock className="h-3.5 w-3.5" aria-hidden />
              )}
              {style.label}
            </p>
            {loading || !bucket ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className={`mt-1 text-3xl font-semibold font-mono ${card.key === "EXPIRED" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
                {bucket.totalQuantity.toLocaleString()}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {bucket ? `${bucket.batches} ${bucket.batches === 1 ? "batch" : "batches"} · ledger quantity` : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------- At-risk / expired tables ----------

function StockTable({ rows, expired }: { rows: ExpiryListRow[]; expired: boolean }) {
  return (
    <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm">
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
            <TableRow>
              <TableCell colSpan={7} className="h-20 text-center text-sm text-slate-400">
                {expired ? "No expired stock in the ledger." : "Nothing near expiry right now."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.batchId}-${row.warehouseId}`}>
                <TableCell>
                  <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    {row.canonicalCode}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[180px]">{row.productName}</p>
                    <p className="text-xs text-slate-400 font-mono">{row.productSku}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                  {row.warehouseCode}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={EXPIRY_BADGE[row.expiryStatus]}>
                      {row.expiryStatus}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {new Date(row.expiryDate).toLocaleDateString()} ({daysLabel(row.daysToExpiry)})
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-slate-900 dark:text-white">
                  {fmtQty(row.availableQuantity)} <span className="text-xs font-sans text-slate-400">{row.productUnit}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.estimatedValue === null ? (
                    <span className="text-slate-400" title="No receipt unit cost — quantity only">
                      —
                    </span>
                  ) : (
                    <span className="text-slate-900 dark:text-white" title="Estimate from receipt unit cost">
                      ~{fmtMoney(row.estimatedValue)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dispatch" title="Dispatch this stock (existing workflow)">
                        <Truck className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/waste" title="Record waste (existing workflow)">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
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
      <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-6 text-center text-sm text-slate-500">
        Failed to load waste trends.
      </div>
    );
  }

  const maxQty = Math.max(1, ...(data?.series.map((m) => m.totalWasteQuantity) ?? [1]));

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Historical expiry-related waste (last 12 months, from actual waste records)
        </p>
        {data && (
          <p className="text-xs text-slate-400">
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
              <span className="w-14 shrink-0 font-mono text-slate-400">{m.month}</span>
              <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-slate-900 overflow-hidden">
                <div
                  className={`h-full ${m.expiredQuantity > 0 ? BUCKET_STYLE.EXPIRED.bar : "bg-slate-300 dark:bg-slate-700"}`}
                  style={{ width: `${Math.max(2, (m.totalWasteQuantity / maxQty) * 100)}%` }}
                  title={`${fmtQty(m.expiredQuantity)} expired / ${fmtQty(m.totalWasteQuantity)} total waste`}
                />
              </div>
              <span className="w-36 shrink-0 text-right font-mono text-slate-600 dark:text-slate-300">
                {fmtQty(m.expiredQuantity)} expired
              </span>
            </div>
          ))}
        </div>
      )}

      {data && (data.byWarehouse.length > 0 || data.byProduct.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Expired waste by warehouse</p>
            <div className="flex flex-wrap gap-2">
              {data.byWarehouse.map((w) => (
                <Badge key={w.id} variant="outline" className={BUCKET_STYLE.EXPIRED.badge}>
                  {w.code}: {fmtQty(w.expiredQuantity)}
                </Badge>
              ))}
              {data.byWarehouse.length === 0 && <span className="text-xs text-slate-400">—</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Expired waste by product</p>
            <div className="flex flex-wrap gap-2">
              {data.byProduct.map((p) => (
                <Badge key={p.id} variant="outline" className={BUCKET_STYLE.EXPIRED.badge}>
                  {p.code}: {fmtQty(p.expiredQuantity)}
                </Badge>
              ))}
              {data.byProduct.length === 0 && <span className="text-xs text-slate-400">—</span>}
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
  } = useQuery({
    queryKey: ["expiry", "monitor", warehouseFilter, productFilter],
    queryFn: () => getExpiryMonitor(monitorParams),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Expiry
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
          Expiry intelligence over the stock ledger: every quantity is ledger-derived and every
          monetary figure is an <span className="font-medium">estimate</span> from actual receipt
          unit costs (batches without cost data show quantity only). This page never moves stock —
          act through dispatch, waste or stock counts.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
      </div>

      {isError ? (
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-10 text-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <CircleAlert className="h-8 w-8 text-rose-400" />
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Failed to load expiry monitor
            </p>
            <p className="text-xs text-slate-400">Please try again.</p>
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
              <Timer className="h-4 w-4 text-amber-500" aria-hidden />
              <h2 className="font-semibold text-slate-900 dark:text-white">Near-expiry stock</h2>
              <span className="text-xs text-slate-400">
                1–30 days to expiry · most urgent first · max 100 rows
              </span>
            </div>
            {isLoading ? (
              <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4 space-y-2">
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
              <CircleAlert className="h-4 w-4 text-rose-500" aria-hidden />
              <h2 className="font-semibold text-slate-900 dark:text-white">Expired stock</h2>
              <span className="text-xs text-slate-400">
                still holding positive ledger balance · most overdue first
              </span>
            </div>
            {isLoading ? (
              <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4 space-y-2">
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
            <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Warehouse breakdown
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {monitor.warehouses.map((wh) => (
                  <div key={wh.warehouseId} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                    <p className="text-sm font-medium">{wh.warehouseName}</p>
                    <p className="text-xs text-slate-400 mb-2">
                      {wh.warehouseCode} · total {fmtQty(wh.totalQuantity)} · est. value{" "}
                      {wh.estimatedValueAtRisk > 0 ? `~${fmtMoney(wh.estimatedValueAtRisk)}` : "—"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {BUCKET_ORDER.filter((b) => wh.buckets[b] > 0).map((b) => (
                        <Badge key={b} variant="outline" className={BUCKET_STYLE[b].badge}>
                          {BUCKET_STYLE[b].label}: {fmtQty(wh.buckets[b])}
                        </Badge>
                      ))}
                      {BUCKET_ORDER.every((b) => wh.buckets[b] === 0) && (
                        <span className="text-xs text-slate-400">no stock</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {monitor && monitor.totals.batchesWithStock === 0 && monitor.warehouses.length === 0 && (
            <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2">
                <PackageOpen className="h-8 w-8 text-slate-300" />
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  No stock in scope
                </p>
                <p className="text-xs text-slate-400">
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
