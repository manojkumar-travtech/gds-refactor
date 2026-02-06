import { Request, Response } from "express";
import logger from "../utils/logger";
import {
  CreateProfileRequest,
  ProfileValidator,
} from "../services/profile/Profile.types";
import { ProfileService } from "../services/profile/profile.service";
import { GdsProfileService } from "../services/apex/gdsProfiles.service";
import { getProfilesFromApexService } from "../services/apex/getProfilesFromApex.service";
import { profileToSabreFormatter } from "../services/apex/profileToSabreFormatter.service";

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
      const profileData =
        await getProfilesFromApexService.getCompleteProfileData(
          String(profileId),
        );

      // Get Sabre formatted data
      const sabreProfile =
        profileToSabreFormatter.formatToSabreProfile(profileData);

      res.status(200).json({
        success: true,
        data: sabreProfile,
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
  public async getProfilesFromSabre(
    _req: Request,
    res: Response,
  ): Promise<void> {
    try {
      let totalProcessed = 0;

      logger.info("Starting profile sync from Sabre");

      const result = await this.profileService.searchProfilesStreaming(
        { pageSize: 250, profileName: "*" },
        async (profiles, pageInfo) => {
          logger.info(`Processing page ${pageInfo.pageNumber}`, {
            profilesInPage: profiles.length,
            hasMore: pageInfo.hasMore,
          });

          // 🔒 This blocks next page until DB insert finishes
          await this.insertProfilesToDatabase(profiles);

          totalProcessed += profiles.length;

          logger.info(`✅ Page inserted`, {
            page: pageInfo.pageNumber,
            processedSoFar: totalProcessed,
          });
        },
      );

      res.status(200).json({
        success: true,
        message: "Profiles synced successfully",
        totalProcessed: result.totalProcessed,
        totalPages: result.totalPages,
      });
    } catch (error: any) {
      logger.error("Error syncing profiles from Sabre", {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: "Failed to sync profiles from Sabre",
        message: error.message,
      });
    }
  }

  /**
   * Insert profiles to database with error handling
   */
  private async insertProfilesToDatabase(profiles: any[]): Promise<void> {
    try {
      if (!profiles.length) {
        logger.info("No profiles to insert");
        return;
      }

      const gdsProfileService = GdsProfileService.getInstance();

      const result = await gdsProfileService.processProfileBatchBulk(profiles);

      logger.info("Profiles synced successfully", {
        total: profiles.length,
        created: result.created,
        updated: result.updated,
      });
    } catch (error: any) {
      logger.error("Database insert failed", {
        profileCount: profiles.length,
        error: error.message,
      });
      throw error;
    }
  }
}
