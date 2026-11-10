import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { Prisma } from "@prisma/client";

export interface AuditEntry {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Writes an audit record. Audit failures must never break the primary
 * operation, but they ARE logged loudly for operators.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    // import from logger lazily-free: keep this module dependency-light
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log", err);
  }
}

/** Express helper that forwards errors properly. */
export function auditMiddleware(): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}
