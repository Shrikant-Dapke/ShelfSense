"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listWarehouses } from "@/features/inventory-api";
import { getAnalyticsSummary, type AnalyticsPeriod } from "@/features/analytics-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CircleAlert,
  Package,
  RefreshCw,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";

const PERIOD_OPTIONS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
];

const PALETTE = ["#0ea5e9", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

const BUCKET_COLORS: Record<string, string> = {
  EXPIRED: "#e11d48",
  CRITICAL: "#f97316",
  WARNING: "#f59e0b",
  MONITOR: "#0ea5e9",
  SAFE: "#10b981",
};
const BUCKET_ORDER: Array<"EXPIRED" | "CRITICAL" | "WARNING" | "MONITOR" | "SAFE"> = [
  "EXPIRED",
  "CRITICAL",
  "WARNING",
  "MONITOR",
  "SAFE",
];
const BUCKET_LABEL: Record<string, string> = {
  EXPIRED: "Expired",
  CRITICAL: "Critical (1–6d)",
  WARNING: "Warning (7–14d)",
  MONITOR: "Monitor (15–30d)",
  SAFE: "Safe (>30d)",
};

function fmtQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function KpiCard({
  title,
  description,
  icon: Icon,
  value,
  isLoading,
  tone,
  suffix,
}: {
  title: string;
  description: string;
  icon: typeof Package;
  value: string | number | null | undefined;
  isLoading: boolean;
  tone?: "rose" | "amber";
  suffix?: string;
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
          {isLoading ? <Skeleton className="h-8 w-20" /> : value === null ? "—" : value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-400">{suffix ? `${description} · ${suffix}` : description}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
  isEmpty,
  emptyLabel,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900 dark:text-white">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="py-14 text-center text-sm text-slate-400">
            {emptyLabel ?? "No data for this scope and period yet."}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(0 0% 100%)",
  border: "1px solid hsl(214 32% 91%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(222 47% 11%)",
};

export default function Page() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [warehouseId, setWarehouseId] = useState("all");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ page: 1, pageSize: 100, isActive: "true" }),
  });

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["analytics", "summary", period, warehouseId],
    queryFn: () =>
      getAnalyticsSummary({
        period,
        warehouseId: warehouseId !== "all" ? warehouseId : undefined,
      }),
  });

  const granularityLabel = data?.granularity === "month" ? "per month" : "per day";

  if (isError) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-lg border bg-white dark:bg-slate-950 shadow-sm p-10 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <CircleAlert className="h-8 w-8 text-rose-400" />
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Failed to load analytics
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const movements = data?.movements;
  const hasMovementData = movements
    ? movements.series.some(
        (b) => b.receipts || b.dispatches || b.transfersIn || b.transfersOut || b.adjustments,
      )
    : false;
  const waste = data?.waste;
  const expiry = data?.expiry;
  const inventory = data?.inventory;
  const dispatch = data?.dispatch;

  return (
    <div className="space-y-6">
      <Header />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Select value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses?.items.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>
                {wh.name} ({wh.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 self-center">
          {data && (
            <>
              {new Date(data.fromDate).toLocaleDateString()} –{" "}
              {new Date(data.toDate).toLocaleDateString()} · every figure derived from the immutable
              stock ledger
            </>
          )}
          {isRefetching && " · refreshing…"}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Total Stock"
          description="Current positive ledger balance"
          icon={Boxes}
          value={isLoading ? undefined : inventory && fmtQty(inventory.totalStockQuantity)}
          isLoading={isLoading}
        />
        <KpiCard
          title="Active Products"
          description="Products holding stock in scope"
          icon={Package}
          value={inventory?.activeProducts}
          isLoading={isLoading}
        />
        <KpiCard
          title="Active Warehouses"
          description="Warehouses holding stock in scope"
          icon={WarehouseIcon}
          value={inventory?.activeWarehouses}
          isLoading={isLoading}
        />
        <KpiCard
          title="Waste % of Received"
          description="window waste vs window receipts"
          icon={Trash2}
          value={
            isLoading ? undefined : waste?.wastePercentOfReceived === null
              ? null
              : waste?.wastePercentOfReceived !== undefined
                ? `${fmtQty(waste.wastePercentOfReceived)}%`
                : undefined
          }
          suffix={waste?.wastePercentOfReceived === null ? "no receipts in window" : undefined}
          isLoading={isLoading}
          tone={waste && waste.wastePercentOfReceived !== null && waste.wastePercentOfReceived > 5 ? "rose" : undefined}
        />
        <KpiCard
          title="Est. Value at Risk"
          description="expiry risk from receipt costs"
          icon={AlertTriangle}
          value={isLoading ? undefined : expiry && `~${fmtMoney(expiry.estimatedValueAtRisk)}`}
          suffix={
            expiry && expiry.quantityWithoutCost > 0
              ? `${fmtQty(expiry.quantityWithoutCost)} units without cost data shown quantity-only`
              : undefined
          }
          isLoading={isLoading}
          tone="amber"
        />
      </div>

      {/* Movement trend */}
      <ChartCard
        title="Movement trend"
        description={`Receipts vs dispatches (${granularityLabel}); transfers in/out are the two legs of the same transfer`}
      >
        {isLoading || !movements ? (
          <Skeleton className="h-72 w-full" />
        ) : !hasMovementData ? (
          <p className="py-14 text-center text-sm text-slate-400">
            No stock movements recorded in this window yet.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={movements.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReceipts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDispatches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(data?.granularity === "month" ? 0 : 5)}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="receipts"
                  name="Receipts"
                  stroke="#10b981"
                  fill="url(#gReceipts)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="dispatches"
                  name="Dispatches"
                  stroke="#f43f5e"
                  fill="url(#gDispatches)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="transfersIn"
                  name="Transfers in"
                  stroke="#0ea5e9"
                  fill="transparent"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="transfersOut"
                  name="Transfers out"
                  stroke="#8b5cf6"
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <Area
                  type="monotone"
                  dataKey="adjustments"
                  name="Adjustments"
                  stroke="#f59e0b"
                  fill="transparent"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {movements && (
          <p className="mt-2 text-xs text-slate-400">
            Window totals: {fmtQty(movements.totals.receipts)} received ·{" "}
            {fmtQty(movements.totals.dispatches)} dispatched · {fmtQty(movements.totals.transfersIn)}{" "}
            transferred in / {fmtQty(movements.totals.transfersOut)} out ·{" "}
            {fmtQty(movements.totals.adjustments)} adjusted
          </p>
        )}
      </ChartCard>

      {/* Inventory distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Stock by warehouse"
          description="Current positive ledger balances"
        >
          {isLoading || !inventory ? (
            <Skeleton className="h-64 w-full" />
          ) : inventory.byWarehouse.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">No stock in scope yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventory.byWarehouse.map((w) => ({ code: w.warehouseCode, quantity: w.quantity }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [fmtQty(Number(value)), "Quantity"]}
                  />
                  <Bar dataKey="quantity" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Stock by category"
          description="Share of current stock per product category"
        >
          {isLoading || !inventory ? (
            <Skeleton className="h-64 w-full" />
          ) : inventory.byCategory.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">No stock in scope yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={inventory.byCategory}
                    dataKey="quantity"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {inventory.byCategory.map((entry, i) => (
                      <Cell key={entry.category} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [fmtQty(Number(value)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Expiry risk + waste */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Expiry risk distribution"
          description="Current stock by days-to-expiry bucket (shared global thresholds)"
        >
          {isLoading || !expiry ? (
            <Skeleton className="h-64 w-full" />
          ) : expiry.buckets ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={BUCKET_ORDER.map((b) => ({
                    bucket: BUCKET_LABEL[b],
                    quantity: expiry.buckets[b].totalQuantity,
                    batches: expiry.buckets[b].batches,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, _name, item) => [
                      `${fmtQty(Number(value))} (${item?.payload?.batches ?? 0} batches)`,
                      "Quantity",
                    ]}
                  />
                  <Bar dataKey="quantity" radius={[4, 4, 0, 0]}>
                    {BUCKET_ORDER.map((b) => (
                      <Cell key={b} fill={BUCKET_COLORS[b]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {expiry && (
            <p className="mt-2 text-xs text-slate-400">
              Expired stock still held: {fmtQty(expiry.expiredQuantity)} · near expiry (1–30d):{" "}
              {fmtQty(expiry.nearExpiryQuantity)}
              {expiry.quantityWithoutCost > 0 &&
                ` · ${fmtQty(expiry.quantityWithoutCost)} units without cost data excluded from value`}
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Waste by reason"
          description="From actual waste records in the window (estimated value from receipt costs)"
        >
          {isLoading || !waste ? (
            <Skeleton className="h-64 w-full" />
          ) : waste.records === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">
              No waste recorded in this window.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={waste.byReason}
                    dataKey="quantity"
                    nameKey="reason"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {waste.byReason.map((entry, i) => (
                      <Cell key={entry.reason} fill={PALETTE[(i + 2) % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [fmtQty(Number(value)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {waste && waste.records > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="font-mono">
                {fmtQty(waste.totalQuantity)} units wasted
              </Badge>
              <Badge variant="outline" className="font-mono">
                {waste.wastePercentOfReceived === null
                  ? "% of received unavailable"
                  : `${fmtQty(waste.wastePercentOfReceived)}% of received`}
              </Badge>
              <Badge variant="outline" className="font-mono">
                est. value {waste.estimatedValue === null ? "unavailable" : `~${fmtMoney(waste.estimatedValue)}`}
              </Badge>
              {waste.quantityWithoutCost > 0 && (
                <span className="text-slate-400">
                  {fmtQty(waste.quantityWithoutCost)} units without cost data
                </span>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Dispatch analytics */}
      <ChartCard
        title="Top dispatched products"
        description={`By dispatched quantity over the window (${dispatch?.topProducts.length ?? 0} shown of actual dispatch records)`}
      >
        {isLoading || !dispatch ? (
          <Skeleton className="h-64 w-full" />
        ) : dispatch.topProducts.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-400">
            No dispatches recorded in this window yet.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dispatch.topProducts.map((p) => ({
                  sku: p.productSku,
                  quantity: p.quantity,
                  dispatches: p.dispatches,
                  name: p.productName,
                }))}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="sku"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, _name, item) => [
                    `${fmtQty(Number(value))} across ${item?.payload?.dispatches ?? 0} dispatch order(s) — ${item?.payload?.name ?? ""}`,
                    "Quantity",
                  ]}
                />
                <Bar dataKey="quantity" fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {dispatch && dispatch.byWarehouse.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-400 self-center">Dispatch quantity by warehouse:</span>
            {dispatch.byWarehouse.map((w) => (
              <Badge key={w.warehouseId} variant="outline" className="font-mono">
                {w.warehouseCode}: {fmtQty(w.quantity)}
              </Badge>
            ))}
          </div>
        )}
      </ChartCard>

      {/* Footer note */}
      <Card>
        <CardContent className="pt-6 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <BarChart3 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            All analytics are deterministic aggregations of recorded ledger data — no forecasting,
            predictions, or estimates beyond clearly labeled receipt-cost-based monetary values.
            Waste value is labeled an estimate; batches without receipt cost data contribute
            quantity only and never a fabricated monetary value.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Analytics
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
        Inventory intelligence derived from the immutable stock ledger: distribution, movement
        trends, waste, expiry risk and dispatch activity for the selected period and warehouse.
      </p>
    </div>
  );
}
