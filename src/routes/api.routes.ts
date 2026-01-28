import express, { Request, Response, Router } from "express";
import { DeleteProfileService } from "../services/profile/deleteProfile.service";
import { AccessQueueService } from "../services/queue/accessQueue.service";
import { runSabreQueueWorker } from "../services/queue/workers/sabreQueue.worker";
import { ProfileSearchService } from "../services/profile/searchProfile.service";

const router: Router = express.Router();

// router.post("/sync-trips-to-apex", async (req: Request, res: Response) => {
//   const batchSize = process.env.PNR_BATCH_SIZE;
// });
// router.post("/process-queues");
// router.post("/profiles");
// router.post("/sync");

router.delete("/delete", async (req, res) => {
  try {
    const { profileId } = req.body;

    if (!profileId || typeof profileId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Profile ID is required and must be a string",
      });
    }

    const profileService = DeleteProfileService.getInstance();
    await profileService.deleteProfile(profileId);

    return res.status(200).json({
      success: true,
      message: `Profile ${profileId} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting profile:", error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete profile",
    });
  }
});

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "email query param is required",
      });
    }
    const profileIns = ProfileSearchService.getInstance();
    const resw = await profileIns.searchByEmail(email);
    return res.status(200).json({
      success: true,
      data: resw,
    });
  } catch (error: any) {
    console.error("Queue API Error:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch queue info",
    });
  }
});

router.get("/queues", async (_req: Request, res: Response) => {
  try {
    await runSabreQueueWorker();

    return res.status(200).json({
      success: true,
      data: [],
    });
  } catch (error: any) {
    console.error("Queue API Error:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch queue info",
    });
  }
});

router.post("/access", async (req: Request, res: Response) => {
  try {
    const { queueNumber, position = 0 } = req.body;

    if (!queueNumber) {
      return res.status(400).json({
        success: false,
        error: "queueNumber is required",
      });
    }

    const service = new AccessQueueService();

    const result = await service.accessQueue(queueNumber, position);

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
