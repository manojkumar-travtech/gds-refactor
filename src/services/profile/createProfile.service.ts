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
   */
  public async createProfile(profile: any): Promise<string> {
    try {
      const sessionToken = await this.sessionService.getAccessToken();
      const now = new Date().toISOString();

      // Extract profile data with defaults
      const {
        givenName,
        surname,
        phoneNumber,
        email,
        address,
        city,
        postalCode,
        stateCode,
        countryCode = "US",
        primaryLanguage = "EN-US",
        clientCode = "TN",
        profileStatusCode = "AC",
      } = profile;

      // Validate required fields
      if (!givenName || !surname) {
        throw new Error(
          "First name (givenName) and last name (surname) are required",
        );
      }

      // Build profile name
      const profileName = `${givenName} ${surname}`;

      const requestBody = {
        Sabre_OTA_ProfileCreateRQ: {
          $: {
            xmlns: "http://www.sabre.com/eps/schemas",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            Target: "Production",
            TimeStamp: now,
            Version: "6.90.1",
          },

          Profile: {
            $: {
              CreateDateTime: now,
              UpdateDateTime: now,
              PrimaryLanguageIDCode: primaryLanguage,
            },

            TPA_Identity: {
              $: {
                UniqueID: "*",
                ProfileTypeCode: "TVL",
                ClientCode: clientCode,
                ClientContextCode: this.sabreConfig.clientCode,
                DomainID: this.sabreConfig.pcc,
                ProfileName: profileName,
                ProfileStatusCode: profileStatusCode,
                ProfileNameModifyIndicator: "Y",
              },
            },

            Traveler: {
              Customer: {
                PersonName: {
                  GivenName: givenName,
                  SurName: surname,
                },

                ...(phoneNumber && {
                  Telephone: {
                    FullPhoneNumber: phoneNumber,
                  },
                }),

                ...(email && {
                  Email: {
                    $: {
                      EmailAddress: email,
                    },
                  },
                }),

                ...(address &&
                  city && {
                    Address: {
                      AddressLine: address,
                      CityName: city,
                      ...(postalCode && { PostalCd: postalCode }),
                      ...(stateCode && { StateCode: stateCode }),
                      CountryCode: countryCode,
                    },
                  }),
              },
            },
          },
        },
      };

      const bodyXml = this.xmlBuilder.buildObject(requestBody);

      const response = await this.soapExecutor.execute<any>(
        {
          service: "Sabre_OTA_ProfileCreateRQ",
          action: "EPS_EXT_ProfileCreateRQ",
          body: bodyXml,
          sessionToken,
        },
        "Sabre_OTA_ProfileCreateRS",
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
          errors.ErrorMessage ||
          JSON.stringify(errors);
        throw new Error(`Sabre profile creation failed: ${errorMessage}`);
      }

      const uniqueId =
        response?.TPA_Identity?.UniqueID ||
        response?.TPA_Identity?.$?.UniqueID ||
        response?.Profile?.$?.UniqueID;

      if (!uniqueId) {
        throw new Error("Sabre profile created but no UniqueID returned");
      }

      logger.info(`Sabre profile created successfully: ${uniqueId}`);
      return uniqueId;
    } catch (error: any) {
      logger.error("CreateProfileService.createProfile failed:", error);
      throw new Error(
        error?.message || "Unexpected error during profile creation",
      );
    }
  }

  async getProfilesUnified(profileIds: string | string[]) {
    const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
    if (!ids.length) return [];

    try {
      const idMap = await this.fetchGdsProfileIdsBatch(ids);

      const resolvedIds: string[] = [];

      for (const id of ids) {
        const gdsId = idMap.get(id);
        if (!gdsId) continue;
        resolvedIds.push(gdsId);
      }

      if (!resolvedIds.length) return [];

      return await this.getMultipleProfiles(resolvedIds);
    } catch (error) {
      logger.error("Error in getProfilesUnified:", error);
      throw error;
    }
  }

  private async getMultipleProfiles(profileIds: string[]): Promise<any[]> {
    if (!profileIds.length) return [];

    const sessionToken = await this.sessionService.getAccessToken();
    const BATCH_SIZE = 10;
    const allProfiles: any[] = [];

    for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
      const batchIds = profileIds.slice(i, i + BATCH_SIZE);
      const bodyContent = this.buildBulkProfileRequest(batchIds);

      const bulkReadRS = await this.soapExecutor.execute(
        {
          service: "Sabre_OTA_ProfileBulkReadRQ",
          action: "EPS_EXT_ProfileBulkReadRQ",
          body: bodyContent,
          sessionToken,
        },
        "Sabre_OTA_ProfileBulkReadRS",
      );

      if (!bulkReadRS?.Profiles?.Profile) continue;

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

  public buildSingleProfileRequest(profileId: string): string {
    return `
      <Sabre_OTA_ProfileReadRQ
        Target="Production"
        TimeStamp="${new Date().toISOString()}"
        Version="6.90.1"
        xmlns="http://www.sabre.com/eps/schemas">
        <Profile>
          <Identity
            ClientCode="${this.sabreConfig.clientCode}"
            DomainID="${this.sabreConfig.pcc}">
            <UniqueID>${profileId}</UniqueID>
          </Identity>
        </Profile>
      </Sabre_OTA_ProfileReadRQ>
    `;
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

  private async fetchGdsProfileIdsBatch(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (!ids.length) return new Map();

    const queryStr = `
      SELECT
        profile_id,
        gds_profile_id
      FROM gds.gds_profiles
      WHERE (
          profile_id = ANY($1::uuid[])
          OR gds_profile_id = ANY($2::text[])
        )
        AND gds_provider = 'sabre'
      ORDER BY updated_at DESC
    `;

    const result = await query(queryStr, [ids, ids]);

    const map = new Map<string, string>();

    for (const row of result) {
      if (row.profile_id) map.set(row.profile_id, row.gds_profile_id);
      if (row.gds_profile_id) map.set(row.gds_profile_id, row.gds_profile_id);
    }

    return map;
  }
}
