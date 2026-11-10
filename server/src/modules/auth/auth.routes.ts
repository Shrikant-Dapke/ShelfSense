import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema } from "./auth.validation.js";
import { login, logout, me } from "./auth.controller.js";
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

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validate(loginSchema), login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
