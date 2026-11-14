"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Standard list pagination: "Page X of Y" (+ optional total count) with
 * Previous/Next and optional page-size selection. Render it whenever the
 * list has at least one page; buttons disable themselves at the edges.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className,
}: {
  page: number;
  totalPages: number;
  /** Total item count; rendered as "· N items" when provided. */
  total?: number;
  onPageChange: (page: number) => void;
  /** When provided (with onPageSizeChange) a page-size select is shown. */
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: Array<number>;
  className?: string;
}) {
  const clampedTotalPages = Math.max(totalPages, 1);
  const canPrev = page > 1;
  const canNext = page < clampedTotalPages;

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"
      }
    >
      <p>
        Page {page} of {clampedTotalPages}
        {typeof total === "number" ? (
          <>
            {" · "}
            {total.toLocaleString()} {total === 1 ? "item" : "items"}
          </>
        ) : null}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && typeof pageSize === "number" ? (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="w-28" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(Math.min(clampedTotalPages, page + 1))}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
