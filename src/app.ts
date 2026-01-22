import express, { Application } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config/config";

import healthRoutes from "./routes/health.routes";

import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import logger from "./utils/logger";

import routes from "./routes";

export const createApp = async (): Promise<Application> => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    }),
  );

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging
  const morganFormat = config.NODE_ENV === "production" ? "combined" : "dev";
  app.use(
    morgan(morganFormat, {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    }),
  );

  app.use((req, res, next) => {
    req.id =
      (req.headers["x-request-id"] as string) ||
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader("X-Request-ID", req.id);
    next();
  });

  // Routes
  app.use("/", healthRoutes);
  app.use("/api/v1", routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
};
