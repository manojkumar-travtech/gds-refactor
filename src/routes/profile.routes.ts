import { Router } from "express";
import { ProfileController } from "../controllers/Profile.controller";
import { UpdateProfileService } from "../services/profile/updateProfile.service";

const router = Router();
const profileController = new ProfileController();
const updateService = UpdateProfileService.getInstance();

/**
 * POST /api/profiles
 * Create a new Sabre profile
 *
 * Required body fields:
 * - givenName: string
 * - surname: string
 *
 * Optional body fields:
 * - phoneNumber: string
 * - email: string
 * - address: string
 * - city: string
 * - postalCode: string
 * - stateCode: string
 * - countryCode: string (default: "US")
 * - primaryLanguage: string (default: "EN-US")
 * - clientCode: string (default: "TN")
 * - profileStatusCode: string (default: "AC")
 */
router.post("/profiles", (req, res) =>
  profileController.createProfile(req, res),
);

/**
 * GET /api/profiles/:profileId
 * Get a single profile by Sabre ID
 *
 * @param profileId - The Sabre profile unique ID
 */
router.get("/profiles/:profileId", (req, res) =>
  profileController.getProfile(req, res),
);

/**
 * POST /api/profiles/batch
 * Get multiple profiles by IDs
 *
 * Body:
 * {
 *   "profileIds": ["id1", "id2", "id3"] // array or single string
 * }
 */
router.post("/profiles/batch", (req, res) =>
  profileController.getProfiles(req, res),
);

router.post("/profiles/update", async (req, res) => {
  try {
    const {
      profileId,
      clientCode,
      clientContext,
      domain,
      customer,
      remarks,
      preferences,
      ignoreSubjectAreas,
      ignoreTimeStampCheck,
    } = req.body;

    // Validate required fields
    if (!profileId || !clientCode || !clientContext || !domain) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: profileId, clientCode, clientContext, domain",
      });
    }

    const result = await updateService.updateProfile({
      profileId,
      clientCode,
      clientContext,
      domain,
      customer,
      remarks,
      preferences,
      ignoreSubjectAreas,
      ignoreTimeStampCheck,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Profile update error:", error);

    if (error.message?.includes("SIMULTANEOUS_UPDATE")) {
      return res.status(409).json({
        success: false,
        error:
          "Profile was modified by another user. Please refresh and try again.",
        errorType: "SIMULTANEOUS_UPDATE",
      });
    }

    if (error.message?.includes("Profile not found")) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        errorType: "NOT_FOUND",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update profile",
    });
  }
});

export default router;
