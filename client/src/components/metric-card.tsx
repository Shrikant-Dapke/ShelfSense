"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Compact KPI card used by the core inventory modules (inventory, products,
 * warehouses, batches). Built entirely from Stage C primitives and tokens. */

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, { tile: string; value: string }> = {
  neutral: { tile: "bg-brand/20 text-ink", value: "text-ink" },
  success: {
    tile: "bg-[var(--status-success-soft)] text-[var(--status-success-ink)]",
    value: "text-[var(--status-success-ink)]",
  },
  warning: {
    tile: "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]",
    value: "text-[var(--status-warning-ink)]",
  },
  danger: {
    tile: "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]",
    value: "text-[var(--status-danger-ink)]",
  },
  info: {
    tile: "bg-[var(--status-info-soft)] text-[var(--status-info-ink)]",
    value: "text-[var(--status-info-ink)]",
  },
};

export function MetricCard({
  title,
  description,
  value,
  isLoading = false,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  value: number | null | undefined;
  isLoading?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
}) {
  const style = TONES[tone];
  return (
    <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardDescription className="text-sm font-semibold text-ink">{title}</CardDescription>
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", style.tile)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <CardTitle className={cn("font-mono text-3xl leading-none tracking-tight", style.value)}>
          {isLoading ? <Skeleton className="h-8 w-16" aria-label={`Loading ${title}`} /> : (value?.toLocaleString() ?? "—")}
        </CardTitle>
      </CardHeader>
      {description ? (
        <CardContent className="pt-1">
          <p className="text-xs leading-relaxed text-ink-muted">{description}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
