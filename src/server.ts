import { createApp } from "./app";
import { config } from "./config/config";
import { handleShutdown } from "./config/database";
import logger from "./utils/logger";

let server: any;

const startServer = async () => {
  try {
    const app = await createApp();

    server = app.listen(config.PORT, () => {
      console.log("", "sxdede");
      logger.info(`Server started successfully`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        nodeVersion: process.version,
      });
    });

    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${config.PORT} is already in use`);
      } else {
        logger.error("Server error", { error });
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed");

      await handleShutdown(signal);

      logger.info("Graceful shutdown completed");
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  } else {
    await handleShutdown(signal);
    process.exit(0);
  }
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error });
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason, promise });
  gracefulShutdown("UNHANDLED_REJECTION");
});

startServer();
