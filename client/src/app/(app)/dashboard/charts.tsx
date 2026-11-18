"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsSummary } from "@/features/analytics-api";

/**
 * Dashboard charts use data from the single 30-day analytics query the page
 * already fetches — no new endpoints and no derived stock calculations. When
 * the source series is empty we show a real empty state instead of inventing
 * points. Chart colors come from Stage B/C tokens so both themes work.
 */

const axisTick = { fontSize: 11, fill: "var(--ss-muted)" };
const gridStroke = "var(--ss-border)";
const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--ss-surface)",
  color: "var(--ss-ink)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
};

function ChartFrame({
  title,
  description,
  summary,
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  description: string;
  /** Plain-text summary for screen readers — the chart is decorative to AT. */
  summary: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px] pt-2 sm:h-[280px]">
        <p className="sr-only">{summary}</p>
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-xl" aria-label={`Loading ${title}`} />
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-hairline bg-canvas px-6 text-center">
            <p className="text-sm text-ink-muted">{emptyMessage}</p>
          </div>
        ) : (
          <div role="img" aria-label={summary} className="h-full w-full">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Receipts vs dispatches over the analytics window (real movement totals). */
export function MovementChart({
  analytics,
  isLoading,
}: {
  analytics: AnalyticsSummary | undefined;
  isLoading: boolean;
}) {
  const series = analytics?.movements.series ?? [];
  const totals = analytics?.movements.totals;
  const summary = analytics
    ? `Stock movements over the last ${analytics.period}: ${totals?.receipts ?? 0} received, ${totals?.dispatches ?? 0} dispatched units.`
    : "Stock movement history is loading.";

  return (
    <ChartFrame
      title="Inventory Movement"
      description={`Receipts and dispatches · last ${analytics?.period ?? "30 days"}`}
      summary={summary}
      isLoading={isLoading}
      isEmpty={series.length === 0}
      emptyMessage="No stock movements recorded in this period."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="dashReceiptFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--ss-accent)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--ss-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="date"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={24}
          />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: gridStroke }} />
          <Area
            type="monotone"
            dataKey="receipts"
            name="Received"
            stroke="var(--ss-accent)"
            strokeWidth={2.5}
            fill="url(#dashReceiptFill)"
          />
          <Area
            type="monotone"
            dataKey="dispatches"
            name="Dispatched"
            stroke="var(--ss-info)"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Stock on hand by warehouse from the same analytics summary. */
export function WarehouseDistributionChart({
  analytics,
  isLoading,
}: {
  analytics: AnalyticsSummary | undefined;
  isLoading: boolean;
}) {
  const rows = (analytics?.inventory.byWarehouse ?? [])
    .slice()
    .sort((a, b) => b.quantity - a.quantity);
  const summary = rows.length
    ? `Stock on hand by warehouse: ${rows.map((w) => `${w.warehouseName} ${w.quantity}`).join(", ")}.`
    : "Warehouse stock distribution is loading.";

  return (
    <ChartFrame
      title="Stock by Warehouse"
      description="Quantity on hand per warehouse"
      summary={summary}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyMessage="No warehouse stock distribution available."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="warehouseCode"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--ss-canvas)" }} />
          <Bar dataKey="quantity" name="On hand" fill="var(--ss-accent)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
