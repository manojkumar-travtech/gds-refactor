import { SabreProfileParser } from "../../parsers/sabre-profile.parser";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "./profilesBase.service";

export interface ProfileSearchCriteria {
  profileName?: string;
  email?: string;
  profileType?: "ALL" | "TVL" | "OTH";
  pageNumber?: number;
  pageSize?: number;
}

export interface ProfileSearchResult {
  profiles: any[];
  hasMore: boolean;
  numReturned: number;
  pageNumber: number;
  pageSize: number;
}

interface SabreProfileSearchRS {
  Sabre_OTA_ProfileSearchRS: {
    ProfileInfo?: {
      ProfileList?: {
        $?: {
          HaveMore?: "Y" | "N";
          NumReturned?: string;
        };
        Profile?: any | any[];
      };
      Profile?: any;
    };
    Errors?: any;
  };
}

export class ProfileSearchService extends ProfilesBaseService {
  private static instance: ProfileSearchService;

  private constructor() {
    super();
  }

  public static getInstance(): ProfileSearchService {
    if (!ProfileSearchService.instance) {
      ProfileSearchService.instance = new ProfileSearchService();
    }
    return ProfileSearchService.instance;
  }

  /**
   * Search profiles with pagination
   */
  async searchProfiles(
    criteria: ProfileSearchCriteria,
  ): Promise<ProfileSearchResult> {
    const pageSize = criteria.pageSize || 250;
    const profileType = criteria.profileType || "TVL";
    const domain = this.sabreConfig.pcc;
    const profileName = criteria.profileName || "*";
    const email = criteria.email;

    let allProfiles: any[] = [];
    let currentPage = criteria.pageNumber || 1;
    let hasMore = false;
    let totalReturned = 0;

    logger.info("Starting profile search", {
      profileName,
      email,
      profileType,
      pageSize,
    });

    do {
      const pageResult = await this.fetchProfilePage({
        profileName,
        email,
        profileType,
        domain,
        currentPage,
        pageSize,
      });

      // Accumulate results
      allProfiles = [...allProfiles, ...pageResult?.profiles];
      totalReturned += pageResult.numReturned;
      hasMore = pageResult.hasMore;

      logger.info(`Fetched page ${currentPage}`, {
        profilesInPage: pageResult?.profiles.length,
        totalSoFar: allProfiles.length,
        hasMore,
      });

      // Move to next page if more results exist
      if (hasMore) {
        currentPage++;
        // Add small delay between pages to avoid rate limiting
        await this.delay(100);
      }
    } while (hasMore);

    logger.info("Profile search completed", {
      totalProfiles: allProfiles.length,
      totalPages: currentPage,
    });
    const parser = new SabreProfileParser();
    const parsedProfiles: any[] = [];

    for (const profile of allProfiles) {
      parsedProfiles.push(parser.parse(profile));
    }
    return {
      profiles: parsedProfiles,
      hasMore: false,
      numReturned: totalReturned,
      pageNumber: currentPage,
      pageSize: allProfiles.length,
    };
  }

  /**
   * Fetch a single page of profiles
   */
  private async fetchProfilePage(params: {
    profileName: string;
    email?: string;
    profileType: string;
    domain: string;
    currentPage: number;
    pageSize: number;
  }): Promise<{ profiles: any[]; hasMore: boolean; numReturned: number }> {
    const { profileName, email, profileType, domain, currentPage, pageSize } =
      params;

    // Build email condition if provided
    const emailCondition = email ? `<Email EmailAddress="${email}" />` : "";

    // Build request body
    const bodyContent = `
      <Sabre_OTA_ProfileSearchRQ Version="6.90.1" xmlns="http://www.sabre.com/eps/schemas">
        <ProfileSearchCriteria ProfileNameOnly="N" PageNumber="${currentPage}" ReturnCount="${pageSize}">
          <TPA_Identity 
            ProfileName="${profileName}" 
            DomainID="${domain}" 
            ProfileTypeCode="${profileType}" 
            ClientCode="${this.sabreConfig.clientCode}" 
            ClientContextCode="${this.sabreConfig.clientContext}" 
          />
          ${emailCondition}
        </ProfileSearchCriteria>
      </Sabre_OTA_ProfileSearchRQ>
    `;

    // Get session token
    const sessionToken = await this.sessionService.getAccessToken();

    logger.debug("Fetching profile page", {
      page: currentPage,
      pageSize,
    });

    // Execute SOAP request
    const response = await this.soapExecutor.execute<SabreProfileSearchRS>(
      {
        action: "EPS_EXT_ProfileSearchRQ",
        service: "Sabre_OTA_ProfileSearchRQ",
        body: bodyContent,
        sessionToken,
      },
      "Sabre_OTA_ProfileSearchRS",
    );
    return this.parseProfileSearchResponse(response);
  }

  /**
   * Parse profile search response
   */
  private parseProfileSearchResponse(
    searchRS: SabreProfileSearchRS["Sabre_OTA_ProfileSearchRS"],
  ): {
    profiles: any[];
    hasMore: boolean;
    numReturned: number;
  } {
    if (!searchRS || !searchRS.ProfileInfo) {
      logger.warn("No profile info in response");
      return {
        profiles: [],
        hasMore: false,
        numReturned: 0,
      };
    }

    const profileInfo = searchRS.ProfileInfo;
    let profiles: any[] = [];
    let hasMore = false;
    let numReturned = 0;

    if (profileInfo.ProfileList) {
      const profileList = profileInfo.ProfileList;
      hasMore = profileList?.$?.HaveMore === "Y";
      numReturned = parseInt(profileList?.$?.NumReturned || "0", 10);

      // Handle both single profile and array of profiles
      if (profileList.Profile) {
        profiles = Array.isArray(profileList.Profile)
          ? profileList.Profile
          : [profileList.Profile];
      }
    } else if (profileInfo.Profile) {
      // Single profile case (no ProfileList wrapper)
      hasMore = false;
      numReturned = 1;
      profiles = [profileInfo.Profile];
    }

    logger.debug("Parsed profile search response", {
      profileCount: profiles.length,
      hasMore,
      numReturned,
    });

    return {
      profiles,
      hasMore,
      numReturned,
    };
  }

  /**
   * Search profiles by email
   */
  async searchByEmail(
    email: string,
    pageSize: number = 250,
  ): Promise<ProfileSearchResult> {
    return this.searchProfiles({
      email,
      pageSize,
      profileType: "ALL",
    });
  }

  /**
   * Search profiles by name pattern
   */
  async searchByName(
    profileName: string,
    pageSize: number = 250,
  ): Promise<ProfileSearchResult> {
    return this.searchProfiles({
      profileName,
      pageSize,
      profileType: "TVL",
    });
  }
}
