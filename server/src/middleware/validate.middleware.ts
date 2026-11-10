import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodType } from "zod";
import { ApiError } from "../utils/api-error.js";

type RequestLocations = "body" | "query" | "params";

/**
 * Validates and (optionally transforms) a request location with a Zod schema.
 * The parsed value replaces the original so handlers receive typed data.
 */
export function validate(schema: ZodType, location: RequestLocations = "body"): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[location]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || location,
        message: issue.message,
      }));
      return next(ApiError.validation(`Invalid request ${location}`, details));
    }
    // Express 5 declares req.query as read-only at the type level; assignment
    // is safe at runtime and gives handlers fully parsed/coerced values.
    Object.defineProperty(req, location, { value: result.data, writable: true, configurable: true });
    next();
  };
}
