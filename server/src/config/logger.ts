import pino from "pino";
import { env, isTest } from "./env.js";

export const logger = pino({
  level: isTest ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
    ],
    censor: "[REDACTED]",
  },
});
