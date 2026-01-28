import { Router, Request, Response } from "express";
import logger from "../utils/logger";
import { SabreSessionService } from "../sessionManagement/sabreSessionService.service";

const router = Router();
const sabreSession = SabreSessionService.getInstance();

/**
 * POST /sabre/login
 * Establish Sabre session
 */
router.post("/login", async (_req: Request, res: Response) => {
  try {
    await sabreSession.login();

    res.status(200).json({
      status: "ok",
      message: "Sabre login successful",
    });
  } catch (error) {
    logger.error("Sabre login failed", error);

    res.status(500).json({
      status: "error",
      message: "Sabre login failed",
      error: (error as Error).message,
    });
  }
});

/**
 * POST /sabre/logout
 * Close Sabre session
 */
router.post("/logout", async (_req: Request, res: Response) => {
  try {
    await sabreSession.logout();

    res.status(200).json({
      status: "ok",
      message: "Sabre logout successful",
    });
  } catch (error) {
    logger.error("Sabre logout failed", error);

    res.status(500).json({
      status: "error",
      message: "Sabre logout failed",
      error: (error as Error).message,
    });
  }
});

/**
 * GET /sabre/token
 * Optional: inspect current token (for testing only)
 */
router.get("/token", async (_req: Request, res: Response) => {
  try {
    const token = await sabreSession.getAccessToken();

    res.status(200).json({
      status: "ok",
      token,
    });
  } catch (error) {
    res.status(401).json({
      status: "error",
      message: "No active Sabre session",
      error: (error as Error).message,
    });
  }
});

export default router;
