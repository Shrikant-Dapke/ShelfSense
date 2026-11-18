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
import { cn } from "@/lib/utils";

/**
 * Standard list pagination: "Page X of Y" (+ optional total count), numbered
 * pages with ellipsis for long ranges, Previous/Next and optional page-size
 * selection. Props and onPageChange/onPageSizeChange semantics are unchanged.
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

  const pages: Array<number | "ellipsis"> = [];
  if (clampedTotalPages <= 7) {
    for (let i = 1; i <= clampedTotalPages; i++) pages.push(i);
  } else {
    const start = Math.max(2, page - 1);
    const end = Math.min(clampedTotalPages - 1, page + 1);
    pages.push(1);
    if (start > 2) pages.push("ellipsis");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < clampedTotalPages - 1) pages.push("ellipsis");
    pages.push(clampedTotalPages);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-t-none border-t border-hairline bg-canvas px-4 py-3 text-sm text-ink-muted",
        className,
      )}
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
      <div className="flex flex-wrap items-center gap-2">
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
          <span className="hidden sm:inline">Previous</span>
        </Button>
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-ink-muted" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "default" : "outline"}
              size="sm"
              aria-label={`Go to page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className="min-w-8"
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(Math.min(clampedTotalPages, page + 1))}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
