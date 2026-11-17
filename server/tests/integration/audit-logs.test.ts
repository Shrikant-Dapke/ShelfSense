import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import type { Prisma } from "@prisma/client";
import { writeAudit, sanitizeAuditMetadata } from "../../src/services/audit.service.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let operatorCookie: string;

/** Deterministic controlled createdAt helper. */
function at(day: number, hour = 10, minute = 0): Date {
  return new Date(Date.UTC(2026, 10, day, hour, minute, 0, 0)); // Nov 2026
}

async function seedAudit(rows: Array<Prisma.AuditLogCreateInput>) {
  await prisma.auditLog.createMany({ data: rows as never });
}

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  operatorCookie = await loginAs("operator");
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
});

describe("GET /api/v1/audit-logs — RBAC", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/audit-logs");
    expect(res.status).toBe(401);
  });

  it("rejects non-ADMIN roles with 403", async () => {
    const res = await request(app).get("/api/v1/audit-logs").set("Cookie", operatorCookie);
    expect(res.status).toBe(403);
  });

  it("allows ADMIN", async () => {
    const res = await request(app).get("/api/v1/audit-logs").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/v1/audit-logs — listing, ordering and pagination", () => {
  beforeEach(async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      actorEmail: "actor@test.shelfsense.local",
      userId: null,
      action: "waste.recorded",
      entityType: "waste_record",
      entityId: null,
      createdAt: at(10 + Math.floor(i / 5), 8 + (i % 5)), // 5 rows per day, distinct hours
    }));
    await seedAudit(rows);
  });

  it("returns the newest first with stable meta", async () => {
    const res = await request(app)
      .get("/api/v1/audit-logs?pageSize=10")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });

    const times = res.body.data.map((r: { createdAt: string }) => r.createdAt);
    const sorted = [...times].sort().reverse();
    expect(times).toEqual(sorted);
  });

  it("paginates deterministically across pages", async () => {
    const p1 = await request(app)
      .get("/api/v1/audit-logs?page=1&pageSize=10")
      .set("Cookie", adminCookie);
    const p2 = await request(app)
      .get("/api/v1/audit-logs?page=2&pageSize=10")
      .set("Cookie", adminCookie);
    const p3 = await request(app)
      .get("/api/v1/audit-logs?page=3&pageSize=10")
      .set("Cookie", adminCookie);
    expect(p3.body.data).toHaveLength(5);
    const ids = new Set([
      ...p1.body.data.map((r: { id: string }) => r.id),
      ...p2.body.data.map((r: { id: string }) => r.id),
      ...p3.body.data.map((r: { id: string }) => r.id),
    ]);
    expect(ids.size).toBe(25); // no overlap, no loss
  });

  it("ties rows with identical createdAt by id desc", async () => {
    await prisma.auditLog.deleteMany();
    const same = at(12, 9, 0);
    await seedAudit([
      { action: "x.first", entityType: "t", createdAt: same },
      { action: "x.second", entityType: "t", createdAt: same },
    ]);
    const res = await request(app)
      .get("/api/v1/audit-logs?pageSize=10")
      .set("Cookie", adminCookie);
    const ids = res.body.data.map((r: { id: string }) => r.id) as string[];
    // Descending id order — deterministic regardless of insertion order.
    expect(ids).toEqual([...ids].sort().reverse());
  });
});

describe("GET /api/v1/audit-logs — filters", () => {
  beforeEach(async () => {
    await seedAudit([
      {
        action: "waste.recorded",
        entityType: "waste_record",
        actorEmail: "william@shelfsense.test",
        createdAt: at(10, 8),
      },
      {
        action: "inventory.adjusted",
        entityType: "stock_movement",
        actorEmail: "Wilma@shelfsense.test",
        createdAt: at(11, 9),
      },
      {
        action: "stockcount.approved",
        entityType: "stock_count",
        actorEmail: "admin@shelfsense.test",
        createdAt: at(12, 10),
      },
    ]);
  });

  it("filters by exact action", async () => {
    const res = await request(app)
      .get("/api/v1/audit-logs?action=waste.recorded")
      .set("Cookie", adminCookie);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].action).toBe("waste.recorded");
  });

  it("filters by exact entity type", async () => {
    const res = await request(app)
      .get("/api/v1/audit-logs?entityType=stock_movement")
      .set("Cookie", adminCookie);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].entityType).toBe("stock_movement");
  });

  it("filters by actor email case-insensitively as a substring", async () => {
    const res = await request(app)
      .get("/api/v1/audit-logs?actorEmail=WILMA")
      .set("Cookie", adminCookie);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].actorEmail).toBe("Wilma@shelfsense.test");
  });

  it("filters by date range with inclusive day boundaries", async () => {
    const res = await request(app)
      .get("/api/v1/audit-logs?dateFrom=2026-11-10&dateTo=2026-11-11")
      .set("Cookie", adminCookie);
    expect(res.body.meta.total).toBe(2); // Nov 10 and Nov 11 rows
    const days = res.body.data.map((r: { createdAt: string }) => r.createdAt.slice(0, 10));
    expect(days.every((d: string) => d === "2026-11-10" || d === "2026-11-11")).toBe(true);
  });

  it("combines filters", async () => {
    const res = await request(app)
      .get(
        "/api/v1/audit-logs?action=stockcount.approved&actorEmail=admin@shelfsense.test&dateFrom=2026-11-12&dateTo=2026-11-12",
      )
      .set("Cookie", adminCookie);
    expect(res.body.meta.total).toBe(1);
  });

  it("validates query parameters with 422", async () => {
    const bad = [
      "page=0",
      "pageSize=101",
      "pageSize=nope",
      "dateFrom=not-a-date",
      "dateFrom=2026-11-12&dateTo=2026-11-10",
      "actorEmail=a",
    ];
    for (const q of bad) {
      const res = await request(app)
        .get(`/api/v1/audit-logs?${q}`)
        .set("Cookie", adminCookie);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("GET /api/v1/audit-logs — data safety", () => {
  it("returns only safe audit metadata fields", async () => {
    await seedAudit([
      {
        action: "auth.password_changed",
        entityType: "user",
        entityId: "11111111-1111-4111-8111-111111111111",
        actorEmail: "someone@shelfsense.test",
        metadata: { harmless: "ids-only" },
        ip: "10.0.0.1",
        createdAt: at(10, 8),
      },
    ]);
    const res = await request(app)
      .get("/api/v1/audit-logs?pageSize=5")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(Object.keys(item).sort()).toEqual(
      [
        "action",
        "actorEmail",
        "createdAt",
        "entityId",
        "entityType",
        "id",
        "ip",
        "metadata",
        "userId",
      ].sort(),
    );
    // The action NAME may legitimately contain "password" (auth.password_changed);
    // what must never appear is password MATERIAL — plaintext secrets or a
    // bcrypt hash fragment.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("$2");
    expect(raw).not.toMatch(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/);
  });

  it("does not include user relation data (no email/name leak beyond actorEmail)", async () => {
    await seedAudit([
      {
        action: "waste.recorded",
        entityType: "waste_record",
        actorEmail: "op@shelfsense.test",
        createdAt: at(10, 8),
      },
    ]);
    const res = await request(app)
      .get("/api/v1/audit-logs")
      .set("Cookie", adminCookie);
    const raw = JSON.stringify(res.body);
    // The seeded users' personal emails must not leak through relations.
    expect(raw).not.toContain("@test.shelfsense.local");
  });

  it("writeAudit automatically strips sensitive credentials, tokens, and hashes from metadata", async () => {
    await writeAudit({
      actorEmail: "sec-test@shelfsense.test",
      action: "user.updated",
      entityType: "user",
      entityId: "22222222-2222-4222-8222-222222222222",
      metadata: {
        safeField: "safe-value",
        warehouseCode: "WH-01",
        password: "plaintext-password-leak",
        passwordHash: "$2a$12$e8kZ1q6W5h.qY7O8m6kZ1q6W5h.qY7O8m6kZ1q6W5h.qY7O8m6kZ1",
        userToken: "ey12345.ey67890.signature",
        clientSecret: "very-secret-token",
        authHeader: "Bearer ey12345",
        cookie: "session=xyz",
        credentialPayload: "sensitive",
      },
    });

    const written = await prisma.auditLog.findFirst({
      where: { action: "user.updated", actorEmail: "sec-test@shelfsense.test" },
    });
    expect(written).not.toBeNull();
    const meta = written!.metadata as Record<string, unknown>;
    expect(meta).toEqual({
      safeField: "safe-value",
      warehouseCode: "WH-01",
    });

    // Ensure none of the sensitive values exist in the database record
    const raw = JSON.stringify(written);
    expect(raw).not.toContain("plaintext-password-leak");
    expect(raw).not.toContain("very-secret-token");
    expect(raw).not.toContain("ey12345");
    expect(raw).not.toContain("$2a$");
  });

  it("sanitizeAuditMetadata unit tests: cleanly handles edge cases and null inputs", () => {
    expect(sanitizeAuditMetadata(null)).toBeNull();
    expect(sanitizeAuditMetadata(undefined)).toBeNull();
    expect(sanitizeAuditMetadata({} as never)).toBeNull();
    expect(sanitizeAuditMetadata({ password: "123" })).toBeNull();
    expect(
      sanitizeAuditMetadata({
        allowed: 42,
        secret: "shh",
        nestedHash: "$2b$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567",
      }),
    ).toEqual({ allowed: 42 });
  });
});
