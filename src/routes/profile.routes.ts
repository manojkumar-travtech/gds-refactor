import { Router, Request, Response } from "express";
import { CreateProfileService } from "../services/profile/createProfile.service";
import logger from "../utils/logger";
import { query } from "../config/database";
import { ProfileSearchService } from "../services/profile/searchProfile.service";

const router = Router();
const profileService = CreateProfileService.getInstance();
const profileSearchService = ProfileSearchService.getInstance();

/**
 * POST /api/profiles/create
 */
router.post("/profiles/create", async (req: Request, res: Response): Promise<Response> => {
  try {
    const profileData = req.body;

    const sabreUniqueId = await profileService.createProfile(profileData);

    const saveResult = await query(
      `INSERT INTO gds.gds_profiles 
        (profile_id, gds_profile_id, gds_provider, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [profileData.localProfileId || null, sabreUniqueId, "sabre"]
    );

    return res.status(201).json({
      success: true,
      message: "Profile created successfully in Sabre",
      data: {
        sabreUniqueId,
        localRecord: saveResult[0],
      },
    });
  } catch (error: any) {
    logger.error("Error creating profile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create profile",
      error: error.message,
    });
  }
});

/**
 * GET /api/profiles/:profileId
 */
router.get("/profiles/:profileId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { profileId } = req.params;

    const profiles = await profileSearchService.getProfileById(String(profileId));

    if (!profiles) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: profiles,
    });
  } catch (error: any) {
    logger.error("Error retrieving profile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
      error: error.message,
    });
  }
});

/**
 * POST /api/profiles/bulk
 */
router.post("/profiles/bulk", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { profileIds } = req.body;

    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "profileIds must be a non-empty array",
      });
    }

    const profiles = await profileService.getProfilesUnified(profileIds);

    return res.status(200).json({
      success: true,
      count: profiles.length,
      data: profiles,
    });
  } catch (error: any) {
    logger.error("Error retrieving profiles:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve profiles",
      error: error.message,
    });
  }
});

export default router;