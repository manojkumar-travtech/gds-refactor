import { query } from "../../config/database";
import { SabreProfileParser } from "../../parsers/sabre-profile.parser";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "./profilesBase.service";

export class CreateProfileService extends ProfilesBaseService {
  private static instance: CreateProfileService;

  private constructor() {
    super();
  }

  public static getInstance(): CreateProfileService {
    if (!CreateProfileService.instance) {
      CreateProfileService.instance = new CreateProfileService();
    }
    return CreateProfileService.instance;
  }

  /**
   * Creates a Sabre profile and returns the UniqueID
   * @param profile - The profile object to create
   * @throws Error if profile creation fails or UniqueID is missing
   */
  public async createProfile(profile: any): Promise<string> {
    try {
      // Get a valid session token
      const sessionToken = await this.sessionService.getAccessToken();

      // Convert JS object to XML
      const bodyXml = this.xmlBuilder.buildObject(profile);

      // Execute SOAP request
      const response = await this.soapExecutor.execute<any>(
        {
          service: "Sabre_OTA_ProfileCreateRQ",
          action: "EPS_EXT_ProfileCreateRQ",
          body: bodyXml,
          sessionToken,
        },
        "Sabre_OTA_ProfileCreateRS",
      );

      // Handle errors from response
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

      // Extract UniqueID from possible paths
      const uniqueId =
        response?.TPA_Identity?.UniqueID ||
        response?.TPA_Identity?.$?.UniqueID ||
        response?.Profile?.$?.UniqueID;

      if (!uniqueId) {
        logger.error(
          "CreateProfileService.createProfile missing UniqueID:",
          JSON.stringify(response, null, 2),
        );
        throw new Error("Sabre profile created but no UniqueID returned");
      }

      logger.info(`Sabre profile created successfully: ${uniqueId}`);
      return uniqueId;
    } catch (error: any) {
      // Catch unexpected errors
      logger.error("CreateProfileService.createProfile failed:", error);
      throw new Error(
        error?.message || "Unexpected error during profile creation",
      );
    }
  }

  private async getProfile(profileId: string) {
    try {
      const isUuid = this.isUuid(profileId);

      // Fetch gds_profile_id from DB
      const gdsProfileId = await this.fetchGdsProfileId(profileId, isUuid);
      if (!gdsProfileId) {
        logger.info(
          `No GDS profile found for ${isUuid ? "UUID" : "Sabre ID"}: ${profileId}`,
        );
        return null;
      }

      logger.info(
        `Found GDS profile ID: ${gdsProfileId} for ${isUuid ? "UUID" : "Sabre ID"}: ${profileId}`,
      );

      // Fetch full profile(s) from Sabre
      const profiles = await this.getMultipleProfiles([gdsProfileId]);
      return profiles.length > 0 ? profiles[0] : null;
    } catch (error) {
      console.error("Error in getProfile:", error);
      throw error;
    }
  }
  private async getMultipleProfiles(profileIds: string[]): Promise<any[]> {
    if (profileIds.length === 0) return [];

    const sessionToken = await this.sessionService.getAccessToken();
    const BATCH_SIZE = 10;
    const allProfiles: any[] = [];

    for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
      const batchIds = profileIds.slice(i, i + BATCH_SIZE);
      const bodyContent = this.buildBulkProfileRequest(batchIds);

      // Execute SOAP request
      const bulkReadRS = await this.soapExecutor.execute(
        {
          service: "Sabre_OTA_ProfileBulkReadRQ",
          action: "EPS_EXT_ProfileBulkReadRQ",
          body: bodyContent,
          sessionToken,
        },
        "Sabre_OTA_ProfileBulkReadRS",
      );

      // Handle errors gracefully
      if (!bulkReadRS?.Profiles?.Profile) {
        console.error(
          "❌ No Profiles.Profile in response",
          JSON.stringify(bulkReadRS, null, 2),
        );
        continue;
      }

      // Normalize to array and parse profiles
      const rawProfiles = Array.isArray(bulkReadRS.Profiles.Profile)
        ? bulkReadRS.Profiles.Profile
        : [bulkReadRS.Profiles.Profile];

      const batchProfiles = rawProfiles.map((raw: any) =>
        new SabreProfileParser().parse(raw),
      );
      allProfiles.push(...batchProfiles);
    }

    return allProfiles;
  }

  private isUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    );
  }

  private async fetchGdsProfileId(
    profileId: string,
    isUuid: boolean,
  ): Promise<string | null> {
    const queryStr = `
    SELECT gds_profile_id
    FROM gds.gds_profiles
    WHERE ${isUuid ? "profile_id" : "gds_profile_id"} = $1
      AND gds_provider = 'sabre'
    ORDER BY updated_at DESC
    LIMIT 1
  `;
    const result = await query(queryStr, [profileId]);
    return result.length > 0 ? result[0].gds_profile_id : null;
  }

  private buildBulkProfileRequest(profileIds: string[]): string {
    const profileElements = profileIds
      .map(
        (id) => `
        <Profile ProfileTypeCode="TVL">
          <Identity ClientCode="${this.sabreConfig.clientCode}" DomainID="${this.sabreConfig.pcc}">
            <UniqueID>${id}</UniqueID>
          </Identity>
        </Profile>
      `,
      )
      .join("");

    return `
    <Sabre_OTA_ProfileBulkReadRQ
        ClientContextCode="${this.sabreConfig.clientContext}"
        Target="Production"
        TimeStamp="${new Date().toISOString()}"
        Version="6.90.1"
        xmlns="http://www.sabre.com/eps/schemas">
      <Profiles>
        ${profileElements}
      </Profiles>
    </Sabre_OTA_ProfileBulkReadRQ>
  `;
  }
}
