import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { signSessionToken, SESSION_COOKIE_NAME } from "../../utils/jwt.js";
import { writeAudit } from "../../services/audit.service.js";
import type { LoginInput, UpdateProfileInput, ChangePasswordInput } from "./auth.validation.js";
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
    sessionVersion: user.sessionVersion,
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

function toSafeUser(user: { id: string; name: string; email: string; role: string }): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role as SessionUser["role"] };
}

/**
 * Updates the authenticated user's own display name. The target user is
 * ALWAYS derived from the verified session — a userId in the request body is
 * ignored by design, so a user can only ever update their own profile.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  ip?: string,
): Promise<SessionUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Account is no longer active");
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { name: input.name } });

  await writeAudit({
    userId: updated.id,
    actorEmail: updated.email,
    action: "auth.profile_updated",
    entityType: "user",
    entityId: updated.id,
    metadata: { previousName: user.name },
    ip,
  });

  return toSafeUser(updated);
}

export interface ChangePasswordResult {
  user: SessionUser;
  token: string;
  expiresInHours: number;
}

/**
 * Changes the authenticated user's own password.
 *
 * - The current password must verify; failures are audited-free (rate limit
 *   is the brute-force defence) and return 401 without leaking which part
 *   was wrong.
 * - The new hash and `password_changed_at` are written in one update; the
 *   auth middleware rejects any JWT whose `iat` predates that instant, so
 *   every other session is invalidated immediately.
 * - The response carries a freshly signed session token (issued at/after the
 *   change instant) so the current client stays signed in via the new cookie.
 * - Passwords and hashes are never logged, audited or returned.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  ip?: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Account is no longer active");
  }

  const currentOk = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!currentOk) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  const passwordChangedAt = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      passwordChangedAt,
      sessionVersion: { increment: 1 },
    },
  });

  await writeAudit({
    userId: updated.id,
    actorEmail: updated.email,
    action: "auth.password_changed",
    entityType: "user",
    entityId: updated.id,
    ip,
  });

  const { token, expiresInHours } = signSessionToken({
    sub: updated.id,
    email: updated.email,
    role: updated.role,
    sessionVersion: updated.sessionVersion,
  });

  return { user: toSafeUser(updated), token, expiresInHours };
}
