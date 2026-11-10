import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../utils/jwt.js";

export type Role = "ADMIN" | "MANAGER" | "OPERATOR";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
}

export function getAuthenticatedUser(req: Request): AuthenticatedRequest["user"] | null {
  return (req as AuthenticatedRequest).user ?? null;
}

/**
 * Verifies the session JWT from the httpOnly cookie AND re-checks the user
 * against the database, so deactivation / role changes take effect
 * immediately instead of at token expiry.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
      if (!token) {
        throw ApiError.unauthorized();
      }

      let payload;
      try {
        payload = verifySessionToken(token);
      } catch {
        throw ApiError.unauthorized("Session is invalid or expired");
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw ApiError.unauthorized("Account is no longer active");
      }

      (req as AuthenticatedRequest).user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
};

/**
 * Role-based authorization. Usage: requireRoles("ADMIN", "MANAGER").
 * Must run after requireAuth.
 */
export function requireRoles(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(user.role)) {
      return next(
        ApiError.forbidden(`This action requires one of the following roles: ${roles.join(", ")}`),
      );
    }
    next();
  };
}
