import { query } from "../../config/database";
import { SabreProfileParser } from "../../parsers/sabre-profile.parser";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "./profilesBase.service";

export interface CreateProfileInput {
  givenName: string;
  surname: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  stateCode?: string;
  countryCode?: string;
  primaryLanguage?: string;
  clientCode?: string;
  profileStatusCode?: string;
}

function chunkArray<T>(arr: T[], size = 10): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function validateCreateProfile(input: CreateProfileInput) {
  if (!input.givenName || !input.surname) {
    throw new Error("givenName and surname are required");
  }
}

function buildCreateProfileRQ(
  profile: CreateProfileInput,
  config: { pcc: string; clientCode: string },
) {
  const now = new Date().toISOString();
  const profileName = `${profile.givenName} ${profile.surname}`;

  return {
    Sabre_OTA_ProfileCreateRQ: {
      $: {
        xmlns: "http://www.sabre.com/eps/schemas",
        Target: "Production",
        TimeStamp: now,
        Version: "6.90.1",
      },
      Profile: {
        $: {
          CreateDateTime: now,
          UpdateDateTime: now,
          PrimaryLanguageIDCode: profile.primaryLanguage ?? "EN-US",
        },
        TPA_Identity: {
          $: {
            UniqueID: "*",
            ProfileTypeCode: "TVL",
            ClientCode: profile.clientCode ?? "TN",
            ClientContextCode: config.clientCode,
            DomainID: config.pcc,
            ProfileName: profileName,
            ProfileStatusCode: profile.profileStatusCode ?? "AC",
            ProfileNameModifyIndicator: "Y",
          },
        },
        Traveler: {
          Customer: {
            PersonName: {
              GivenName: profile.givenName,
              SurName: profile.surname,
            },
            ...(profile.phoneNumber && {
              Telephone: { FullPhoneNumber: profile.phoneNumber },
            }),
            ...(profile.email && {
              Email: { $: { EmailAddress: profile.email } },
            }),
            ...(profile.address &&
              profile.city && {
                Address: {
                  AddressLine: profile.address,
                  CityName: profile.city,
                  PostalCd: profile.postalCode,
                  StateCode: profile.stateCode,
                  CountryCode: profile.countryCode ?? "US",
                },
              }),
          },
        },
      },
    },
  };
}

function buildBulkReadRQ(
  profileIds: string[],
  config: { pcc: string; clientCode: string },
): string {
  const profilesXml = profileIds
    .map(
      (id) => `
      <Profile ProfileTypeCode="TVL">
        <Identity ClientCode="${config.clientCode}" DomainID="${config.pcc}">
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
        ${profilesXml}
      </Profiles>
    </Sabre_OTA_ProfileBulkReadRQ>
  `;
}

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

  public async createProfile(profile: CreateProfileInput): Promise<string> {
    try {
      validateCreateProfile(profile);

      const requestObj = buildCreateProfileRQ(profile, {
        pcc: this.sabreConfig.pcc,
        clientCode: this.sabreConfig.clientCode,
      });

      const sessionToken = await this.sessionService.getAccessToken();
      const bodyXml = this.xmlBuilder.buildObject(requestObj);

      const response = await this.soapExecutor.execute<any>(
        {
          service: "Sabre_OTA_ProfileCreateRQ",
          action: "EPS_EXT_ProfileCreateRQ",
          body: bodyXml,
          sessionToken,
        },
        "Sabre_OTA_ProfileCreateRS",
      );

      const errors = this.extractErrors(response);
      if (errors) {
        logger.error("Sabre profile creation error:", errors);
        throw new Error(`Sabre profile creation failed: ${errors}`);
      }

      const uniqueId =
        response?.TPA_Identity?.UniqueID ||
        response?.TPA_Identity?.$?.UniqueID ||
        response?.Profile?.$?.UniqueID;

      if (!uniqueId) {
        throw new Error("Profile created but UniqueID missing");
      }

      logger.info(`Sabre profile created: ${uniqueId}`);
      return uniqueId;
    } catch (error: any) {
      logger.error("CreateProfileService.createProfile failed:", error);
      throw new Error(error?.message || "Unexpected profile creation error");
    }
  }

  async getProfilesUnified(profileIds: string | string[]) {
    const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
    if (!ids.length) return [];

    const idMap = await this.fetchGdsProfileIdsBatch(ids);
    const resolvedIds = ids
      .map((id) => idMap.get(id))
      .filter(Boolean) as string[];

    if (!resolvedIds.length) return [];
    return this.getMultipleProfiles(resolvedIds);
  }

  private async getMultipleProfiles(profileIds: string[]): Promise<any[]> {
    const sessionToken = await this.sessionService.getAccessToken();
    const allProfiles: any[] = [];

    for (const batch of chunkArray(profileIds, 10)) {
      const bodyXml = buildBulkReadRQ(batch, {
        pcc: this.sabreConfig.pcc,
        clientCode: this.sabreConfig.clientCode,
      });

      const rs = await this.soapExecutor.execute<any>(
        {
          service: "Sabre_OTA_ProfileBulkReadRQ",
          action: "EPS_EXT_ProfileBulkReadRQ",
          body: bodyXml,
          sessionToken,
        },
        "Sabre_OTA_ProfileBulkReadRS",
      );

      const profiles = rs?.Profiles?.Profile;
      if (!profiles) continue;

      const normalized = Array.isArray(profiles) ? profiles : [profiles];
      allProfiles.push(
        ...normalized.map((p: any) => new SabreProfileParser().parse(p)),
      );
    }

    return allProfiles;
  }

  private async fetchGdsProfileIdsBatch(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (!ids.length) return new Map();

    const sql = `
      SELECT profile_id, gds_profile_id
      FROM gds.gds_profiles
      WHERE (
        profile_id = ANY($1::uuid[])
        OR gds_profile_id = ANY($2::text[])
      )
      AND gds_provider = 'sabre'
      ORDER BY updated_at DESC
    `;

    const rows = await query(sql, [ids, ids]);
    const map = new Map<string, string>();

    for (const row of rows) {
      if (row.profile_id) map.set(row.profile_id, row.gds_profile_id);
      if (row.gds_profile_id) map.set(row.gds_profile_id, row.gds_profile_id);
    }

    return map;
  }
}
