import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN_HOURS: z.coerce.number().int().positive().max(720).default(8),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Load .env from the package root (Node >= 20.12 built-in; no dotenv dep).
try {
  process.loadEnvFile();
} catch {
  // .env is optional (e.g. production injects real env vars).
}

export const env: Env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast and loudly — a misconfigured server must not start.
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
})();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
