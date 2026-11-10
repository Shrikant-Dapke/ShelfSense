import bcrypt from "bcryptjs";
import request from "supertest";
import { prisma } from "../src/config/prisma.js";
import { createApp } from "../src/app.js";
import type { Role } from "../src/middleware/auth.middleware.js";

export const app = createApp();

export const TEST_USERS = {
  admin: { email: "admin@test.shelfsense.local", password: "Admin123!", name: "Test Admin", role: "ADMIN" as Role },
  manager: { email: "manager@test.shelfsense.local", password: "Manager123!", name: "Test Manager", role: "MANAGER" as Role },
  operator: { email: "operator@test.shelfsense.local", password: "Operator123!", name: "Test Operator", role: "OPERATOR" as Role },
};

/** Removes all rows from operational tables (users are re-created per file). */
export async function resetDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.wasteRecord.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.dispatchItem.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.receiptItem.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.batchAlias.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();
}

export async function seedTestUsers(): Promise<void> {
  for (const u of Object.values(TEST_USERS)) {
    await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }
}

/** Logs in as the given test user and returns the session cookie string. */
export async function loginAs(
  user: keyof typeof TEST_USERS,
): Promise<string> {
  const u = TEST_USERS[user];
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: u.email, password: u.password });
  if (res.status !== 200) {
    throw new Error(`Test login failed for ${u.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers["set-cookie"];
  if (!cookie || cookie.length === 0) {
    throw new Error(`No session cookie returned for ${u.email}`);
  }
  return cookie[0].split(";")[0] as string;
}
