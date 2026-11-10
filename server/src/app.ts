import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { env, isTest } from "./config/env.js";
import { logger } from "./config/logger.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { warehousesRouter } from "./modules/warehouses/warehouses.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { receiptsRouter } from "./modules/receipts/receipts.routes.js";
import { dispatchesRouter } from "./modules/dispatches/dispatches.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const origins = env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin/no-origin tools (curl, health checks) and whitelisted frontends.
        if (!origin || origins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        redact: { paths: ["req.headers.cookie", "req.headers.authorization"] },
      }),
    );
  }

  // Global API rate limit (generous; the login endpoint has its own stricter limit).
  app.use(
    "/api/v1",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: () => isTest,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "shelfsense-api", timestamp: new Date().toISOString() });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/products", productsRouter);
  app.use("/api/v1/warehouses", warehousesRouter);
  app.use("/api/v1/inventory", inventoryRouter);
  app.use("/api/v1/receipts", receiptsRouter);
  app.use("/api/v1/dispatches", dispatchesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
