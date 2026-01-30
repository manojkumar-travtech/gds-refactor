import logger from "../../utils/logger";
import { ProfileDatabaseService } from "../apex/profileFromApex.service";
import { CreateProfileService } from "./createProfile.service";

export class UpdateProfiles extends ProfileDatabaseService {
  private readonly createProfileService = CreateProfileService.getInstance();
  constructor() {
    super();
  }
  public async updateProfile(profile: any) {
    if (!profile.id) {
      throw new Error("Cannot update profile without ID");
    }
    logger.info("Processing profile update for ID:", profile.id);
    try {
      const dbProfile = await this.getCompleteProfileFromDatabase(profile.id);

      if (!dbProfile) {
        throw new Error(`Profile ${profile.id} not found in database`);
      }
      const currentProfile = await this.createProfileService.getProfilesUnified(
        profile.id,
      );
      if (!currentProfile) {
        logger.info(`Profile ${profile.id} not found in Sabre, cannot update`);
        throw new Error(`Profile ${profile.id} not found in Sabre`);
      }
      const updatedProfile = this.mergeProfileChanges(dbProfile, profile);

      // Step 4: Compare profiles to detect changes
      const changes = this.getProfileChanges(currentProfile, updatedProfile);

      if (changes.length === 0) {
        console.log(
          `No changes detected for profile ${profile.id}, skipping update`,
        );
        return { updated: false, changes: [] };
      }

      logger.info(
        `Found ${changes.length} changes for profile ${profile.id}, proceeding with update`,
      );

      const requestObj = this.profileBuilder.buildUpdateRequest(
        updatedProfile,
        currentProfile[0],
      );
      const bodyXml = this.xmlBuilder.buildObject(requestObj);
      const sessionToken = await this.sessionService.getAccessToken();

      const response = await this.soapExecutor.execute<any>(
        {
          service: "Sabre_OTA_ProfileUpdateRQ",
          action: "EPS_EXT_ProfileUpdateRQ",
          body: bodyXml,
          sessionToken,
        },
        "Sabre_OTA_ProfileUpdateRS",
      );

      const errors =
        response?.Errors ||
        response?.ResponseMessage?.Errors ||
        response?.Error;

      if (errors) {
        const errorMessage =
          errors.Error?._ ||
          errors.Error?.$?.ShortText ||
          errors.ErrorMessage?._ ||
          JSON.stringify(errors);
        logger.error("Sabre profile creation error:", errorMessage);
        throw new Error(`Sabre profile creation failed: ${errorMessage}`);
      }
      logger.info(
        `Successfully updated profile ${profile.id} with ${changes.length} changes`,
      );
      return {
        updated: true,
        changes,
        profileId: profile.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Sabre profile update failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
