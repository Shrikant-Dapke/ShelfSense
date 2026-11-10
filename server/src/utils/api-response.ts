import type { Response } from "express";

/**
 * Consistent API envelope for every successful response:
 *   { success: true, data: ..., meta?: ... }
 * Errors are rendered by the centralized error middleware as
 *   { success: false, error: { code, message, details? } }
 */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options?: { status?: number; meta?: PageMeta | Record<string, unknown> },
): Response {
  const body: Record<string, unknown> = { success: true as const, data };
  if (options?.meta) body.meta = options.meta;
  return res.status(options?.status ?? 200).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: PageMeta,
): Response {
  return res.status(200).json({ success: true as const, data, meta });
}
