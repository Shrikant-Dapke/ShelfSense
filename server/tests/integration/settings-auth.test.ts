import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { env } from "../../src/config/env.js";
import { app, TEST_USERS, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let operatorCookie: string;
let pwCookie: string; // dedicated password-change user
let pwUserId: string;

const PW_USER = {
  email: "pwchange@test.shelfsense.local",
  password: "PwChange99!",
  name: "Pw Change",
};

/**
 * A unique fake client IP per request. trust proxy is enabled (depth 1), so
 * the last X-Forwarded-For hop becomes req.ip and the per-IP sensitive
 * endpoint limiter treats each test independently.
 */
let xffSeq = 0;
function uniqueXff(): string {
  xffSeq += 1;
  return `10.231.${Math.floor(xffSeq / 250)}.${xffSeq % 250}`;
}

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  operatorCookie = await loginAs("operator");

  await prisma.user.create({
    data: {
      email: PW_USER.email,
      name: PW_USER.name,
      role: "OPERATOR",
      passwordHash: await bcrypt.hash(PW_USER.password, 10),
    },
  });
  const created = await prisma.user.findUnique({ where: { email: PW_USER.email } });
  pwUserId = created!.id;
  // Log in as the dedicated password user to get its cookie.
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", uniqueXff())
    .send({ email: PW_USER.email, password: PW_USER.password });
  expect(res.status).toBe(200);
  pwCookie = res.headers["set-cookie"][0].split(";")[0];
});

describe("PATCH /api/v1/auth/profile", () => {
  it("updates the signed-in user's own name and writes an audit event", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .set("Cookie", operatorCookie)
      .send({ name: "  Renamed Operator  " });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      name: "Renamed Operator",
      email: TEST_USERS.operator.email,
      role: "OPERATOR",
    });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    const dbUser = await prisma.user.findUnique({ where: { id: res.body.data.user.id } });
    expect(dbUser?.name).toBe("Renamed Operator");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "auth.profile_updated", entityId: res.body.data.user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toEqual({ previousName: "Test Operator" });
  });

  it("ignores body-supplied identity fields — target user always comes from the session", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .set("Cookie", operatorCookie)
      .send({ name: "Still Operator", userId: "forged-user-id", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("OPERATOR");
    expect(res.body.data.user.email).toBe(TEST_USERS.operator.email);

    // The admin account is untouched.
    const admin = await prisma.user.findUnique({ where: { email: TEST_USERS.admin.email } });
    expect(admin?.name).toBe("Test Admin");
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .send({ name: "No Session" });
    expect(res.status).toBe(401);
  });

  it("rejects invalid names with 422", async () => {
    for (const name of ["", "   ", "x".repeat(101), 42]) {
      const res = await request(app)
        .patch("/api/v1/auth/profile")
        .set("Cookie", operatorCookie)
        .send({ name });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("PATCH /api/v1/auth/password", () => {
  it("rejects an incorrect current password with 401", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Cookie", pwCookie)
      .set("X-Forwarded-For", uniqueXff())
      .send({ currentPassword: "wrong-current-1", newPassword: "NewPassword1!" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);

    // The password is unchanged — the old one still works.
    const user = await prisma.user.findUnique({ where: { id: pwUserId } });
    expect(await bcrypt.compare(PW_USER.password, user!.passwordHash)).toBe(true);
  });

  it("enforces the password policy with 422", async () => {
    const cases = [
      { newPassword: "Sh0rt" }, // too short
      { newPassword: "nodigitsatall" }, // no digit
      { newPassword: "12345678" }, // no letter
      { newPassword: "a".repeat(201) + "1" }, // too long
    ];
    for (const body of cases) {
      const res = await request(app)
        .patch("/api/v1/auth/password")
        .set("Cookie", pwCookie)
        .set("X-Forwarded-For", uniqueXff())
        .send({ currentPassword: PW_USER.password, ...body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("changes the password, invalidates the old JWT, and keeps the new session", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Cookie", pwCookie)
      .set("X-Forwarded-For", uniqueXff())
      .send({ currentPassword: PW_USER.password, newPassword: "FreshPassword77!" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(PW_USER.email);
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    // A fresh session cookie is issued so the current client stays signed in.
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const freshRaw = (cookies as string[]).find((c) => c.startsWith("shelfsense_session="));
    expect(freshRaw).toBeDefined();
    const freshCookie = (freshRaw as string).split(";")[0];

    // Sensitive material is never in the response.
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(PW_USER.password);
    expect(JSON.stringify(res.body)).not.toContain("FreshPassword77!");

    // DB: hash replaced, passwordChangedAt bumped, sessionVersion incremented.
    const user = await prisma.user.findUnique({ where: { id: pwUserId } });
    expect(await bcrypt.compare("FreshPassword77!", user!.passwordHash)).toBe(true);
    expect(user!.sessionVersion).toBe(1);
    expect(user!.passwordChangedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

    // OLD JWT (issued before the change) is rejected.
    const oldMe = await request(app).get("/api/v1/auth/me").set("Cookie", pwCookie);
    expect(oldMe.status).toBe(401);
    expect(oldMe.body.error.message).toMatch(/password was changed|sign in/i);

    // NEW session (issued by the change response) works.
    const newMe = await request(app).get("/api/v1/auth/me").set("Cookie", freshCookie);
    expect(newMe.status).toBe(200);
    expect(newMe.body.data.user.email).toBe(PW_USER.email);

    // Login with the old password now fails; the new password works.
    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", uniqueXff())
      .send({ email: PW_USER.email, password: PW_USER.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", uniqueXff())
      .send({ email: PW_USER.email, password: "FreshPassword77!" });
    expect(newLogin.status).toBe(200);
  });

  it("audits the change without storing any password material", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { action: "auth.password_changed", entityId: pwUserId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorEmail).toBe(PW_USER.email);
    // The action NAME contains "password"; the row must not contain any
    // password MATERIAL — no plaintext secrets, no bcrypt hash, no metadata.
    const raw = JSON.stringify(audit);
    expect(raw).not.toContain(PW_USER.password);
    expect(raw).not.toContain("FreshPassword77!");
    expect(raw).not.toContain("$2");
    expect(audit?.metadata ?? null).toBeNull();
  });

  it("rate limits the sensitive endpoint to 5 attempts per minute per IP", async () => {
    // Five requests from one IP (all with a wrong current password -> 401),
    // then the sixth from the same IP must be rate-limited.
    const responses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .patch("/api/v1/auth/password")
        .set("Cookie", pwCookie)
        .set("X-Forwarded-For", "10.77.77.77")
        .send({ currentPassword: `bad-attempt-${i}`, newPassword: "Whatever123" });
      responses.push(res.status);
    }
    expect(responses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(responses[5]).toBe(429);
    expect(responses[5]).toBeDefined();
  });

  it("rejects multiple previously issued tokens across different sessions immediately", async () => {
    const multiUser = {
      email: "multi-session@test.shelfsense.local",
      password: "MultiPassword1!",
      name: "Multi User",
    };
    const created = await prisma.user.create({
      data: {
        email: multiUser.email,
        name: multiUser.name,
        role: "OPERATOR",
        passwordHash: await bcrypt.hash(multiUser.password, 10),
      },
    });

    // Obtain 3 separate session cookies representing 3 different devices/tabs.
    const cookies: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", uniqueXff())
        .send({ email: multiUser.email, password: multiUser.password });
      expect(res.status).toBe(200);
      cookies.push(res.headers["set-cookie"][0].split(";")[0]);
    }

    // All 3 cookies should be valid right now.
    for (const cookie of cookies) {
      const check = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
      expect(check.status).toBe(200);
    }

    // Change password using session 1.
    const changeRes = await request(app)
      .patch("/api/v1/auth/password")
      .set("Cookie", cookies[0])
      .set("X-Forwarded-For", uniqueXff())
      .send({ currentPassword: multiUser.password, newPassword: "BrandNewPassword1!" });
    expect(changeRes.status).toBe(200);

    const freshCookie = (changeRes.headers["set-cookie"] as string[])
      .find((c) => c.startsWith("shelfsense_session="))!
      .split(";")[0];

    // ALL 3 previous cookies must be rejected immediately (zero-wait).
    for (const oldCookie of cookies) {
      const oldCheck = await request(app).get("/api/v1/auth/me").set("Cookie", oldCookie);
      expect(oldCheck.status).toBe(401);
      expect(oldCheck.body.error.message).toMatch(/password was changed|sign in/i);
    }

    // The fresh cookie from the password change response must work.
    const freshCheck = await request(app).get("/api/v1/auth/me").set("Cookie", freshCookie);
    expect(freshCheck.status).toBe(200);

    // Verify sessionVersion incremented from 0 to 1 in database.
    const refreshed = await prisma.user.findUnique({ where: { id: created.id } });
    expect(refreshed?.sessionVersion).toBe(1);
  });

  it("rejects tokens with missing, non-numeric, or outdated sessionVersion claims", async () => {
    const user = await prisma.user.findUnique({ where: { id: pwUserId } });
    expect(user).not.toBeNull();

    // 1. Token without sessionVersion claim (legacy / forged)
    const missingVerToken = jwt.sign(
      { sub: user!.id, email: user!.email, role: user!.role },
      env.JWT_SECRET,
    );
    const resMissing = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `shelfsense_session=${missingVerToken}`);
    expect(resMissing.status).toBe(401);

    // 2. Token with non-numeric sessionVersion
    const invalidTypeToken = jwt.sign(
      { sub: user!.id, email: user!.email, role: user!.role, sessionVersion: "1" },
      env.JWT_SECRET,
    );
    const resInvalidType = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `shelfsense_session=${invalidTypeToken}`);
    expect(resInvalidType.status).toBe(401);

    // 3. Token with mismatched (future / wrong) sessionVersion
    const wrongVerToken = jwt.sign(
      { sub: user!.id, email: user!.email, role: user!.role, sessionVersion: 999 },
      env.JWT_SECRET,
    );
    const resWrongVer = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `shelfsense_session=${wrongVerToken}`);
    expect(resWrongVer.status).toBe(401);

    // 4. Token with correct sessionVersion works
    const validToken = jwt.sign(
      { sub: user!.id, email: user!.email, role: user!.role, sessionVersion: user!.sessionVersion },
      env.JWT_SECRET,
    );
    const resValid = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `shelfsense_session=${validToken}`);
    expect(resValid.status).toBe(200);
    expect(resValid.body.data.user.id).toBe(user!.id);
  });

  it("handles concurrent authentication and password change safely", async () => {
    const concurrentUser = {
      email: "concurrent-session@test.shelfsense.local",
      password: "ConcurPassword1!",
      name: "Concurrent User",
    };
    await prisma.user.create({
      data: {
        email: concurrentUser.email,
        name: concurrentUser.name,
        role: "OPERATOR",
        passwordHash: await bcrypt.hash(concurrentUser.password, 10),
      },
    });

    // Log in to get active session
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", uniqueXff())
      .send({ email: concurrentUser.email, password: concurrentUser.password });
    expect(loginRes.status).toBe(200);
    const sessionCookie = loginRes.headers["set-cookie"][0].split(";")[0];

    // Fire 5 concurrent requests with the active session alongside a password change
    const [changeRes, ...otherResults] = await Promise.all([
      request(app)
        .patch("/api/v1/auth/password")
        .set("Cookie", sessionCookie)
        .set("X-Forwarded-For", uniqueXff())
        .send({ currentPassword: concurrentUser.password, newPassword: "UpdatedPassword1!" }),
      request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie),
      request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie),
      request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie),
    ]);

    expect(changeRes.status).toBe(200);
    // Other requests will either succeed (if processed before password change) or 401 (if after)
    for (const r of otherResults) {
      expect([200, 401]).toContain(r.status);
    }

    // Now, any subsequent request with the old cookie MUST be 401
    const postCheck = await request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie);
    expect(postCheck.status).toBe(401);
  });
});
