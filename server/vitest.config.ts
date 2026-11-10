import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = "postgresql://postgres@localhost:5432/shelfsense_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Sequential execution keeps database truncation between tests safe.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "shelfsense-test-secret-0123456789",
      JWT_EXPIRES_IN_HOURS: "8",
      CORS_ORIGINS: "http://localhost:3000",
    },
    globalSetup: ["tests/global-setup.ts"],
  },
});
