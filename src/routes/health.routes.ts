import { Router } from "express";
import { getPoolStats, healthCheck } from "../config/database";
import logger from "../utils/logger";

const router = Router();

router.get("/health", async (_req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  };

  res.status(200).json(health);
});

router.get("/health/ready", async (_req, res) => {
  const checks: any = {
    database: "unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    const dbHealthy = await healthCheck();
    checks.database = dbHealthy ? "healthy" : "unhealthy";

    if (dbHealthy) {
      res.status(200).json({ status: "ready", checks });
    } else {
      res.status(503).json({ status: "not ready", checks });
    }
  } catch (err) {
    logger.error("Readiness check failed", { error: err });
    checks.database = "error";
    res.status(503).json({ status: "not ready", checks });
  }
});

router.get("/health/live", (_req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

router.get("/metrics", (_req, res) => {
  const poolStats = getPoolStats();
  const metrics = {
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
    database: poolStats,
  };

  res.status(200).json(metrics);
});

export default router;
