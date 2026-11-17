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

const SENSITIVE_KEY_REGEX = /(password|hash|token|secret|auth|cookie|credential)/i;

/**
 * Strips sensitive keys and values (passwords, hashes, tokens, secrets, cookies)
 * from audit metadata so credential or auth material is never persisted.
 */
export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      // Catch raw bcrypt hashes or JWT tokens
      if (
        /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value) ||
        /^ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
      ) {
        continue;
      }
    }
    clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Writes an audit record. Audit failures must never break the primary
 * operation, but they ARE logged loudly for operators.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const cleanMetadata = sanitizeAuditMetadata(entry.metadata);
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (cleanMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
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
