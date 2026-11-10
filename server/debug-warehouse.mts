import { prisma } from "./src/config/prisma.js";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "./src/app.js";

const app = createApp();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.warehouse.deleteMany();
  const hash = await bcrypt.hash("Admin123!", 10);
  const user = await prisma.user.upsert({
    where: { email: "debug@test.local" },
    update: {},
    create: { email: "debug@test.local", name: "Debug", passwordHash: hash, role: "ADMIN" },
  });
  const login = await request(app).post("/api/v1/auth/login").send({ email: "debug@test.local", password: "Admin123!" });
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  await prisma.warehouse.create({ data: { name: "W1", code: "W1" } });
  await prisma.warehouse.create({ data: { name: "Old Depot", code: "OLD-DEPOT", isActive: false } });
  const res = await request(app).get("/api/v1/warehouses?isActive=true").set("Cookie", cookie);
  console.log("STATUS:", res.status);
  console.log("BODY:", JSON.stringify(res.body, null, 2));
  await prisma.$disconnect();
}
main();
