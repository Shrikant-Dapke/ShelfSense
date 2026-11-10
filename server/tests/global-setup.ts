import { execSync } from "node:child_process";

/**
 * Runs once before the whole test run: applies all migrations to the
 * dedicated test database so integration tests exercise the real schema.
 */
export default function globalSetup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres@localhost:5432/shelfsense_test?schema=public",
    },
  });
}
