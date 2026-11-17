import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "./auth.validation.js";
import {
  login,
  logout,
  me,
  updateProfile,
  changePassword,
} from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again shortly." },
  },
});

/**
 * Sensitive account mutations (password change). Stricter than login because
 * each attempt triggers a bcrypt verification against the live account.
 * Unlike the global limiter this stays active under test — integration tests
 * key requests by distinct X-Forwarded-For values (trust proxy is enabled)
 * so unrelated tests never collide with the rate-limit test.
 */
const passwordLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many password change attempts. Try again shortly." },
  },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validate(loginSchema), login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/profile", requireAuth, validate(updateProfileSchema), updateProfile);
authRouter.patch("/password", passwordLimiter, requireAuth, validate(changePasswordSchema), changePassword);
