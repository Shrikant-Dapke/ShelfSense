"use client";

import { CircleAlert, PackageSearch, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LucideIcon } from "lucide-react";

export interface TableEmptyState {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}

/**
 * Standard table body states. Render `<TableState />` as the sole child of
 * `<TableBody>` while loading, on error, or when the list is empty; it emits
 * the matching full-width row(s) and returns `null` when real data should be
 * rendered instead.
 */
export function TableState({
  isLoading,
  error,
  onRetry,
  empty,
  colSpan,
  skeletonRows = 5,
}: {
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: TableEmptyState | null;
  colSpan: number;
  skeletonRows?: number;
}) {
  if (isLoading) {
    return <TableSkeletonRows rows={skeletonRows} cols={colSpan} />;
  }
  if (error) {
    return <TableErrorRow error={error} onRetry={onRetry} colSpan={colSpan} />;
  }
  if (empty) {
    return <TableEmptyRow {...empty} colSpan={colSpan} />;
  }
  return null;
}

/** Branded loading rows: muted skeleton cells for every column. */
export function TableSkeletonRows({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-32" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Branded error row with the backend message and a Retry action. */
export function TableErrorRow({
  error,
  onRetry,
  colSpan,
  title = "Failed to load data",
}: {
  error?: unknown;
  onRetry?: () => void;
  colSpan: number;
  title?: string;
}) {
  const message = error instanceof Error ? error.message : null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-36 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <CircleAlert className="h-8 w-8 text-rose-400" aria-hidden />
          <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
          {message ? (
            <p className="max-w-md truncate text-xs text-slate-400">{message}</p>
          ) : null}
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry} aria-label="Retry loading">
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Branded empty row: icon, title and optional hint. */
export function TableEmptyRow({
  icon: Icon = PackageSearch,
  title,
  hint,
  colSpan,
}: TableEmptyState & { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-36 text-center text-slate-500">
        <div className="flex flex-col items-center justify-center gap-2">
          <Icon className="h-8 w-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
          {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
