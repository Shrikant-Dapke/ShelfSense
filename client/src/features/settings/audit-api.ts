import { apiFetch } from "@/lib/api-client";

/** Safe audit-log row — mirrors the server's `AuditLogView`. */
export interface AuditLogView {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  userId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogListParams {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  actorEmail?: string;
  /** YYYY-MM-DD, inclusive (server expands to the UTC day). */
  dateFrom?: string;
  /** YYYY-MM-DD, inclusive (server expands to the UTC day). */
  dateTo?: string;
}

export async function listAuditLogs(params: AuditLogListParams) {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
  for (const key of ["action", "entityType", "actorEmail", "dateFrom", "dateTo"] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return apiFetch<AuditLogView[]>(`/audit-logs${qs ? `?${qs}` : ""}`);
}
