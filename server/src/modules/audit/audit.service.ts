import { prisma } from "../../config/prisma.js";
import type { AuditLogsQuery } from "./audit.validation.js";
import type { AuditLogView } from "./audit.types.js";
import type { Prisma } from "@prisma/client";

/**
 * Read-only audit-log listing for the ADMIN viewer.
 *
 * - Filters: exact `action`, exact `entityType`, case-insensitive substring
 *   `actorEmail`, and a UTC-day-bounded `dateFrom`/`dateTo` range.
 * - Deterministic ordering: newest first, `id` desc as the stable tie-break
 *   so same-millisecond entries never reorder between pages.
 * - No relations are included: `actorEmail` is denormalized on the audit
 *   row, so the whole listing is a single `findMany` + `count` in one
 *   transaction — no N+1 by construction.
 * - Returns only safe metadata (see AuditLogView).
 */
export async function listAuditLogs(query: AuditLogsQuery): Promise<{
  items: AuditLogView[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorEmail
      ? { actorEmail: { contains: query.actorEmail, mode: "insensitive" } }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorEmail: row.actorEmail,
      userId: row.userId,
      ip: row.ip,
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / query.pageSize), 1),
    },
  };
}
