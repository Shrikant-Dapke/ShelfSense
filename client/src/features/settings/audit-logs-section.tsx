"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listAuditLogs, type AuditLogListParams } from "./audit-api";
import { TableState } from "@/components/table-state";
import { Pagination } from "@/components/pagination";
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
            className="text-sm font-medium text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
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
                  <TableCell className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-slate-900 dark:text-white">
                    {row.action}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">
                    {row.entityType}
                    {row.entityId ? (
                      <span className="ml-1 font-mono text-xs text-slate-400">
                        {row.entityId.slice(0, 8)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">
                    {row.actorEmail ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-slate-500 dark:text-slate-400">
                    {summarizeMetadata(row.metadata)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          ) : null}
        </Table>
        {data && data.meta && data.meta.total > 0 ? (
          <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
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
        <p className="text-xs text-slate-400" aria-live="polite">
          Refreshing…
        </p>
      ) : null}
    </div>
  );
}
