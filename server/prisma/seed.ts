/**
 * Reproducible Milestone 1 seed: initial users and the three sample
 * warehouses. The full synthetic operational dataset (products, batches,
 * movements, ...) is generated in Milestone 5's seed extension.
 *
 * Idempotent: uses upsert-style logic keyed on unique fields (email, code).
 */
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@shelfsense.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "ShelfSense Admin";

const USERS: Array<{ name: string; email: string; password: string; role: UserRole }> = [
  { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: UserRole.ADMIN },
  { name: "Maya Iyer", email: "manager@shelfsense.local", password: "Manager123!", role: UserRole.MANAGER },
  { name: "Ravi Kulkarni", email: "operator@shelfsense.local", password: "Operator123!", role: UserRole.OPERATOR },
];

const WAREHOUSES = [
  { name: "Pune Central Warehouse", code: "PUNE-CENTRAL", location: "Pune, Maharashtra, IN" },
  { name: "Mumbai Distribution Warehouse", code: "MUMBAI-DIST", location: "Mumbai, Maharashtra, IN" },
  { name: "Nashik Storage Warehouse", code: "NASHIK-STORAGE", location: "Nashik, Maharashtra, IN" },
];

async function main(): Promise<void> {
  console.log("Seeding ShelfSense (Milestone 1: users + warehouses)...");

  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      // Do not overwrite an already-seeded user's password silently;
      // only fill in missing metadata.
      await prisma.user.update({
        where: { email: user.email },
        data: { name: user.name, role: user.role },
      });
      console.log(`  user exists: ${user.email} (${user.role})`);
    } else {
      const { name, email, role } = user;
      await prisma.user.create({ data: { name, email, role, passwordHash } });
      console.log(`  created user: ${user.email} (${user.role})`);
    }
  }

  for (const warehouse of WAREHOUSES) {
    const existing = await prisma.warehouse.findUnique({ where: { code: warehouse.code } });
    if (existing) {
      console.log(`  warehouse exists: ${warehouse.code}`);
    } else {
      await prisma.warehouse.create({ data: warehouse });
      console.log(`  created warehouse: ${warehouse.code}`);
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
