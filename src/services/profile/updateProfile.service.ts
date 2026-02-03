import logger from "../../utils/logger";
import { ProfileDatabaseService } from "../apex/profileFromApex.service";
import { ProfileSearchService } from "./searchProfile.service";
import { UpdateProfilePayload, updateSabreProfile } from "./updateProfileRequest";


export class UpdateProfileService extends ProfileDatabaseService {
  private static instance: UpdateProfileService;

  private constructor() {
    super();
  }

  public static getInstance(): UpdateProfileService {
    if (!UpdateProfileService.instance) {
      UpdateProfileService.instance = new UpdateProfileService();
    }
    return UpdateProfileService.instance;
  }

  public async updateProfile(payload: UpdateProfilePayload) {
    try {
      logger.info(`Starting profile update for: ${payload.profileId}`);

      let currentProfile = null;

      if (!payload.ignoreTimeStampCheck) {
        const profileSearchService = ProfileSearchService.getInstance();
        currentProfile = await profileSearchService.getProfileById(
          String(payload.profileId),
        );

        if (!currentProfile) {
          throw new Error(`Profile not found: ${payload.profileId}`);
        }

        if (!currentProfile.UpdateDateTime) {
          logger.warn(
            `Profile ${payload.profileId} missing UpdateDateTime, will use current timestamp`,
          );
        }
      } else {
        logger.info(
          "Skipping timestamp validation (ignoreTimeStampCheck=true)",
        );
      }

      const requestObj = updateSabreProfile(payload, currentProfile);
      const bodyXml = this.xmlBuilder.buildObject(requestObj);

      logger.debug("Generated XML request:", bodyXml);

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

      const errors = this.extractErrors(response);

      if (errors) {
        logger.error("Sabre profile update error:", errors);

        if (errors.includes("SIMULTANEOUS_UPDATE")) {
          throw new Error(
            `Profile was updated by another user. Please refresh and try again.`,
          );
        }

        throw new Error(`Sabre profile update failed: ${errors}`);
      }

      const success = response?.ResponseMessage?.Success;

      if (!success) {
        logger.warn("No explicit success element in response");
      }

      logger.info(`Successfully updated profile ${payload.profileId}`);

      return {
        success: true,
        profileId: payload.profileId,
        uniqueId: response?.Profile?.UniqueID || payload.profileId,
        timestamp: new Date().toISOString(),
        response: response,
      };
    } catch (error) {
      logger.error("Profile update failed:", error);
      throw new Error(
        `Sabre profile update failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

}
