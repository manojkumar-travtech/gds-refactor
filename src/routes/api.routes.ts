import express, { Request, Response, Router } from "express";
import { DeleteProfileService } from "../services/profile/deleteProfile.service";

const router: Router = express.Router();

router.post("/sync-trips-to-apex", async (req: Request, res: Response) => {
  const batchSize = process.env.PNR_BATCH_SIZE;
});
router.post("/process-queues");
router.post("/profiles");
router.post("/sync");

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
export default router;
