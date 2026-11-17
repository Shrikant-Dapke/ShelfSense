import type { RequestHandler, Response } from "express";
import { sendSuccess } from "../../utils/api-response.js";
import {
  login as loginService,
  updateProfile as updateProfileService,
  changePassword as changePasswordService,
  sessionCookieName,
  sessionCookieOptions,
} from "./auth.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";

export const login: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const { user, token, expiresInHours } = await loginService(req.body, req.ip);
      res.cookie(sessionCookieName, token, sessionCookieOptions(expiresInHours));
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  })();
};

export const logout: RequestHandler = (_req, res, next) => {
  void (async () => {
    try {
      res.clearCookie(sessionCookieName, { path: "/" });
      sendSuccess(res, { loggedOut: true });
    } catch (err) {
      next(err);
    }
  })();
};

export const me: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const user = (req as AuthenticatedRequest).user;
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  })();
};

/**
 * Updates the signed-in user's own profile name. The target user comes from
 * the verified session — the request body never names the target user.
 */
export const updateProfile: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const user = await updateProfileService(
        (req as AuthenticatedRequest).user.id,
        req.body,
        req.ip,
      );
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  })();
};

/**
 * Changes the signed-in user's own password and re-issues the session: the
 * response sets a fresh cookie so the current client stays signed in, while
 * every previously issued token is invalidated by `password_changed_at`.
 */
export const changePassword: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const { user, token, expiresInHours } = await changePasswordService(
        (req as AuthenticatedRequest).user.id,
        req.body,
        req.ip,
      );
      res.cookie(sessionCookieName, token, sessionCookieOptions(expiresInHours));
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  })();
};
