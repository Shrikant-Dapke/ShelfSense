"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listAuditLogs, type AuditLogListParams, type AuditLogView } from "./audit-api";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

/**
 * "Audit log" settings section (ADMIN only — the page gates the tab, the
 * backend gates the data). Server-side filtering and pagination: every filter
 * change resets to page 1, and rows are fetched for the current page only.
 */
export function AuditLogsSection() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogView | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params: AuditLogListParams = {
    page,
    pageSize: PAGE_SIZE,
    action: actionFilter.trim() || undefined,
    actorEmail: actorFilter.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => listAuditLogs(params),
    placeholderData: keepPreviousData,
  });

  const resetFilters = () => {
    setActionFilter("");
    setActorFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const filtersActive =
    actionFilter !== "" || actorFilter !== "" || dateFrom !== "" || dateTo !== "";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. waste.recorded"
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-actor">Actor email</Label>
          <Input
            id="audit-actor"
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value);
              setPage(1);
            }}
            placeholder="contains…"
            className="w-52"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-date-from">From</Label>
          <Input
            id="audit-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-date-to">To</Label>
          <Input
            id="audit-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm font-medium text-ink-muted underline-offset-4 hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-surface">
        <Table>
          <TableHeader>
            <TableRow className="bg-canvas">
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableState
            isLoading={isLoading}
            error={isError ? error : undefined}
            onRetry={() => refetch()}
            colSpan={5}
            empty={
              data && data.data.length === 0
                ? { icon: Search, title: "No audit entries match these filters" }
                : null
            }
          />
          {data && data.data.length > 0 ? (
            <TableBody>
              {data.data.map((row) => (
                <TableRow key={row.id} data-testid="audit-log-row">
                  <TableCell className="whitespace-nowrap text-ink-muted">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-ink">
                    {row.action}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {row.entityType}
                    {row.entityId ? (
                      <span className="ml-1 font-mono text-xs text-ink-muted">
                        {row.entityId.slice(0, 8)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {row.actorEmail ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-muted">
                        {summarizeMetadata(row.metadata)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-ink-muted hover:text-ink"
                        onClick={() => setSelected(row)}
                        aria-label={`View audit entry ${row.id}`}
                      >
                        Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          ) : null}
        </Table>
        {data && data.meta && data.meta.total > 0 ? (
          <div className="border-t border-hairline px-4 py-3">
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
              pageSize={PAGE_SIZE}
            />
          </div>
        ) : null}
      </div>
      {isFetching && !isLoading ? (
        <p className="text-xs text-ink-muted" aria-live="polite">
          Refreshing…
        </p>
      ) : null}

      {/* Read-only detail view. All fields come from the already-sanitized
          ADMIN audit response — no raw metadata or secrets are rendered. */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit entry</DialogTitle>
            <DialogDescription>
              Immutable administrative record from the audit log.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 rounded-xl border border-hairline bg-canvas p-4 sm:grid-cols-2">
                {[
                  ["Time", formatDateTime(selected.createdAt)],
                  ["Action", selected.action],
                  ["Entity", `${selected.entityType}${selected.entityId ? ` · ${selected.entityId}` : ""}`],
                  ["Actor", selected.actorEmail ?? "—"],
                  ["User ID", selected.userId ?? "—"],
                  ["IP", selected.ip ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {label}
                    </p>
                    <p className="mt-0.5 break-all font-mono text-xs text-ink">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Metadata (safe fields only)
                </p>
                {selected.metadata && Object.keys(selected.metadata).length > 0 ? (
                  <div className="rounded-xl border border-hairline bg-canvas p-4">
                    {Object.entries(selected.metadata).map(([key, value]) => (
                      <div key={key} className="flex flex-wrap gap-2 border-b border-hairline py-1.5 last:border-0">
                        <span className="font-mono text-xs text-ink-muted">{key}</span>
                        <span className="break-all font-mono text-xs text-ink">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No metadata recorded.</p>
                )}
              </div>
              <Button variant="outline" onClick={() => setSelected(null)} className="w-full">
                Close
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
