import { Request, Response } from "express";
import logger from "../utils/logger";
import {
  CreateProfileRequest,
  ProfileValidator,
} from "../services/profile/Profile.types";
import { ProfileService } from "../services/profile/profile.service";

export class ProfileController {
  private profileService = ProfileService.getInstance();

  /**
   * POST /api/profiles
   * Creates a new Sabre profile with validation
   */
  public async createProfile(req: Request, res: Response): Promise<void> {
    try {
      // Extract profile data from request body
      const profileData: CreateProfileRequest = req.body;

      // Validate the request data
      const validation = ProfileValidator.validateCreateProfile(profileData);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          errors: validation.errors,
        });
        return;
      }

      // Call the service with dynamic data
      const uniqueId = await this.profileService.createProfile(profileData);

      // Return success response
      res.status(201).json({
        success: true,
        data: {
          uniqueId,
          message: "Profile created successfully",
        },
      });
    } catch (error: any) {
      logger.error("ProfileController.createProfile error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create profile",
      });
    }
  }

  /**
   * GET /api/profiles/:profileId
   * Gets a profile by Sabre ID
   */
  public async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: "profileId is required",
        });
        return;
      }

      const profile = await this.profileService.getProfileById(
        String(profileId),
      );

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      logger.error("ProfileController.getProfile error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch profile",
      });
    }
  }

  /**
   * POST /api/profiles/batch
   * Gets multiple profiles by IDs
   */
  public async getProfiles(req: Request, res: Response): Promise<void> {
    try {
      const { profileIds } = req.body;

      if (
        !profileIds ||
        (!Array.isArray(profileIds) && typeof profileIds !== "string")
      ) {
        res.status(400).json({
          success: false,
          error: "profileIds is required (string or array)",
        });
        return;
      }

      const profiles = await this.profileService.getProfilesUnified(profileIds);

      res.status(200).json({
        success: true,
        data: profiles,
        count: profiles.length,
      });
    } catch (error: any) {
      logger.error("ProfileController.getProfiles error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch profiles",
      });
    }
  }
}
