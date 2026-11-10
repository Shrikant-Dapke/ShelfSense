import type { RequestHandler, Response } from "express";
import { sendSuccess } from "../../utils/api-response.js";
import { login as loginService, sessionCookieName, sessionCookieOptions } from "./auth.service.js";
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
