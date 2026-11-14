"use client";

import { Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standard filter row: leading search input (when configured), any number of
 * custom filter controls as children, and an optional Reset button. The
 * caller owns the state; this only standardizes layout and a11y labels.
 */
export function FilterBar({
  search,
  onReset,
  resetDisabled = false,
  children,
  className,
}: {
  search?: {
    value: string;
    onChange: (value: string) => void;
    /** Accessible label for the search input. */
    label: string;
    placeholder?: string;
    className?: string;
  };
  /** When provided, a Reset button is shown on the right. */
  onReset?: () => void;
  resetDisabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {search ? (
        <div className={cn("relative w-full max-w-xs", search.className)}>
          <Search
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder={search.placeholder ?? "Search…"}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            aria-label={search.label}
          />
        </div>
      ) : null}
      {children}
      {onReset ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={resetDisabled}
          aria-label="Reset filters"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </Button>
      ) : null}
    </div>
  );
}
