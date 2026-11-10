import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { env, isProduction } from "../config/env.js";
import { logger } from "../config/logger.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

/**
 * Centralized error handler — the ONLY place errors are serialized.
 * ApiErrors that are safe (expose=true) send their real message; everything
 * else is logged and reported as a generic 500 to avoid leaking internals.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.originalUrl }, err.message);
    }
    res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.expose ? err.message : "Internal server error",
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Defense in depth: any ZodError that escapes validation middleware is
  // reported as a 422, never a 500.
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join(".") || "unknown",
      message: issue.message,
    }));
    res.status(422).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details },
    });
    return;
  }

  // Prisma unique-constraint violations surface here if a service forgets
  // to translate them — map to a safe 409 rather than leaking SQL details.
  const prismaCode = (err as { code?: string } | null)?.code;
  if (prismaCode === "P2002") {
    res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "A record with the same unique value already exists" },
    });
    return;
  }

  logger.error({ err, path: req.originalUrl }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction || env.NODE_ENV === "test" ? "Internal server error" : String(err),
    },
  });
}
