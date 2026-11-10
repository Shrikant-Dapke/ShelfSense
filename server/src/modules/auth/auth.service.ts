import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { verifyPassword } from "../../utils/password.js";
import { signSessionToken, SESSION_COOKIE_NAME } from "../../utils/jwt.js";
import { writeAudit } from "../../services/audit.service.js";
import type { LoginInput } from "./auth.validation.js";
import type { SessionUser } from "./auth.types.js";

const LOGIN_RATE_LIMIT_MS = 60_000;
const LOGIN_RATE_LIMIT_MAX = 10;

const failedLoginCounts = new Map<string, { count: number; windowStart: number }>();

function checkLoginAttemptGate(ip: string): void {
  const now = Date.now();
  const entry = failedLoginCounts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_RATE_LIMIT_MS) return;
  if (entry.count >= LOGIN_RATE_LIMIT_MAX) {
    throw ApiError.badRequest("Too many login attempts. Try again shortly.");
  }
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const entry = failedLoginCounts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_RATE_LIMIT_MS) {
    failedLoginCounts.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

export interface LoginResult {
  user: SessionUser;
  token: string;
  expiresInHours: number;
}

export async function login(input: LoginInput, ip?: string): Promise<LoginResult> {
  checkLoginAttemptGate(ip ?? "unknown");

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Compare against a dummy hash even when the user does not exist, so
  // response timing cannot be used to enumerate valid emails.
  const passwordOk = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyPassword(input.password, "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpQ0N3bJ0yY9XkQe6yUEuV9TkHn4i");

  if (!user || !passwordOk) {
    recordFailedLogin(ip ?? "unknown");
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  const { token, expiresInHours } = signSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  await writeAudit({
    userId: user.id,
    actorEmail: user.email,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ip,
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
    expiresInHours,
  };
}

export function sessionCookieOptions(expiresInHours: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: expiresInHours * 60 * 60 * 1000,
  };
}

export const sessionCookieName = SESSION_COOKIE_NAME;
