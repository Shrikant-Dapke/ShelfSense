import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, TEST_USERS, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let operatorCookie: string;

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  operatorCookie = await loginAs("operator");
});

beforeEach(async () => {
  // Keep users; clear operational data between tests.
  await prisma.auditLog.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
});

describe("POST /api/v1/auth/login", () => {
  it("returns 200 with a session cookie and the user payload", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: TEST_USERS.admin.email,
      password: TEST_USERS.admin.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(TEST_USERS.admin.email);
    expect(res.body.data.user.role).toBe("ADMIN");
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    const cookies = res.headers["set-cookie"];
    expect(Array.isArray(cookies)).toBe(true);
    const raw = (cookies as string[]).find((c) => c.startsWith("shelfsense_session="));
    expect(raw).toBeDefined();
    expect((raw as string)).toMatch(/HttpOnly/i);
  });

  it("normalizes email case on login", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: TEST_USERS.admin.email.toUpperCase(),
      password: TEST_USERS.admin.password,
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: TEST_USERS.admin.email,
      password: "definitely-wrong",
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for an unknown email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ghost@nowhere.local", password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("returns 422 for malformed payloads", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" })]),
    );
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the authenticated user", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(TEST_USERS.admin.email);
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 without a session cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with a tampered cookie", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", "shelfsense_session=forged.token.value");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as string[];
    expect(cookies.some((c) => c.includes("shelfsense_session=;"))).toBe(true);
  });
});

describe("deactivated accounts", () => {
  it("cannot log in and live sessions are rejected", async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_USERS.operator.email } });
    await prisma.user.update({ where: { id: user!.id }, data: { isActive: false } });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: TEST_USERS.operator.email,
      password: TEST_USERS.operator.password,
    });
    expect(loginRes.status).toBe(403);

    // An existing session must also stop working immediately.
    const meRes = await request(app).get("/api/v1/auth/me").set("Cookie", operatorCookie);
    expect(meRes.status).toBe(401);
  });
});
