import { query } from "../../config/database";
import logger from "../../utils/logger";
import {
  TABLE_ADDRESSES,
  TABLE_EMAILS,
  TABLE_EMERGENCY_CONTACTS,
  TABLE_LOYALTY_PROGRAMS,
  TABLE_PAYMENT_METHODS,
  TABLE_PHONES,
  TABLE_PROFILES,
  TABLE_SABRE_PROFILES,
  TABLE_TRAVEL_DOCUMENTS,
} from "./profileTabes.constants";

export interface CompleteProfileData {
  profileId: string;
  sabreProfileId: string | null;
  loyaltyPrograms: any[];
  emergencyContacts: any[];
  travelDocuments: any[];
  paymentMethods: any[];
  addresses: any[];
  emails: any[];
  phones: any[];
}

export class GetProfilesFromApexService {
  /**
   * Get Sabre Profile ID for a given profile ID
   * @param profileId - The profile ID
   * @returns Sabre Profile ID or null if not found
   */
  public async getSabreProfileId(profileId: string): Promise<string | null> {
    try {
      const result = await query(
        `
        SELECT sp.gds_profile_id as sabre_profile_id
        FROM ${TABLE_PROFILES} p
        INNER JOIN ${TABLE_SABRE_PROFILES} sp ON p.id = sp.profile_id
        WHERE p.id = $1
        LIMIT 1
        `,
        [profileId],
      );

      return result[0].length > 0 ? result[0].sabre_profile_id : null;
    } catch (error) {
      logger.error("Error fetching Sabre Profile ID", {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  
  public async getProfileById(profileId: string): Promise<any> {
    const result = await query(
      ` 
        SELECT first_name , last_name , middle_name , date_of_birth , phone , profile_type ,known_traveler_number , readresss_number  FROM ${TABLE_PROFILES} WHERE id = $1
      `,
      [profileId],
    );  
    return result;
  }

  /**
   * Fetch all related data for a profile
   * @param profileId - The profile ID to fetch data for
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Complete profile data object
   */
  public async getCompleteProfileData(
    profileId: string,
    includeDeleted = false,
  ): Promise<CompleteProfileData> {
    try {
      logger.info("Fetching complete profile data", {
        profileId,
        includeDeleted,
      });

      const [
        sabreProfileId,
        loyaltyPrograms,
        emergencyContacts,
        travelDocuments,
        paymentMethods,
        addresses,
        emails,
        phones,
      ] = await Promise.all([
        this.getSabreProfileId(profileId),
        this.getLoyaltyPrograms(profileId, includeDeleted),
        this.getEmergencyContacts(profileId, includeDeleted),
        this.getTravelDocuments(profileId, includeDeleted),
        this.getPaymentMethods(profileId, includeDeleted),
        this.getAddresses(profileId, includeDeleted),
        this.getEmails(profileId, includeDeleted),
        this.getPhones(profileId, includeDeleted),
      ]);

      return {
        profileId,
        sabreProfileId,
        loyaltyPrograms,
        emergencyContacts,
        travelDocuments,
        paymentMethods,
        addresses,
        emails,
        phones,
      };
    } catch (error) {
      logger.error("Error fetching complete profile data", {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get loyalty programs for a profile
   */
  public async getLoyaltyPrograms(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        provider_type,
        provider_name,
        provider_code,
        program_name,
        member_number,
        member_name,
        tier_status,
        tier_level,
        points_balance,
        miles_balance,
        segment_count,
        member_since,
        tier_expiry_date,
        points_expiry_date,
        is_primary,
        auto_apply,
        login_username,
        login_password_encrypted,
        program_data,
        sync_enabled,
        notes,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_LOYALTY_PROGRAMS}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY is_primary DESC, provider_type, provider_code
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get emergency contacts for a profile
   */
  public async getEmergencyContacts(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        name,
        relationship,
        phone,
        email,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_EMERGENCY_CONTACTS}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY name
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get travel documents for a profile
   */
  public async getTravelDocuments(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        type,
        document_number,
        issuing_country,
        issuing_authority,
        issue_date,
        expiry_date,
        document_data,
        attachment_url,
        attachment_mime_type,
        attachment_size_bytes,
        notes,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_TRAVEL_DOCUMENTS}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY type, expiry_date DESC
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get payment methods for a profile
   */
  public async getPaymentMethods(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        organization_id,
        card_token,
        card_last_four,
        card_type,
        expiry_month,
        expiry_year,
        billing_name,
        billing_address,
        is_corporate,
        corporate_reference,
        is_default,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_PAYMENT_METHODS}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY is_default DESC, card_type
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get addresses for a profile
   */
  public async getAddresses(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        type,
        line1,
        line2,
        city,
        state,
        zip,
        country,
        is_primary,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_ADDRESSES}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY is_primary DESC, type
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get emails for a profile
   */
  public async getEmails(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        address,
        type,
        is_primary,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_EMAILS}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY is_primary DESC, type
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get phones for a profile
   */
  public async getPhones(
    profileId: string,
    includeDeleted = false,
  ): Promise<any[]> {
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

    const result = await query(
      `
      SELECT 
        id,
        profile_id,
        number,
        type,
        is_primary,
        provenance,
        created_at,
        updated_at,
        deleted_at
      FROM ${TABLE_PHONES}
      WHERE profile_id = $1 ${deletedFilter}
      ORDER BY is_primary DESC, type
      `,
      [profileId],
    );

    return result;
  }

  /**
   * Get specific data type for a profile
   */
  public async getProfileDataByType(
    profileId: string,
    dataType:
      | "loyalty"
      | "emergencyContacts"
      | "documents"
      | "payments"
      | "addresses"
      | "emails"
      | "phones",
    includeDeleted = false,
  ): Promise<any[]> {
    switch (dataType) {
      case "loyalty":
        return this.getLoyaltyPrograms(profileId, includeDeleted);
      case "emergencyContacts":
        return this.getEmergencyContacts(profileId, includeDeleted);
      case "documents":
        return this.getTravelDocuments(profileId, includeDeleted);
      case "payments":
        return this.getPaymentMethods(profileId, includeDeleted);
      case "addresses":
        return this.getAddresses(profileId, includeDeleted);
      case "emails":
        return this.getEmails(profileId, includeDeleted);
      case "phones":
        return this.getPhones(profileId, includeDeleted);
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }

  /**
   * Get profile data summary (counts only)
   */
  public async getProfileDataSummary(profileId: string): Promise<{
    profileId: string;
    sabreProfileId: string | null;
    counts: {
      loyaltyPrograms: number;
      emergencyContacts: number;
      travelDocuments: number;
      paymentMethods: number;
      addresses: number;
      emails: number;
      phones: number;
    };
  }> {
    const [sabreProfileId, countsResult] = await Promise.all([
      this.getSabreProfileId(profileId),
      query(
        `
        SELECT 
          (SELECT COUNT(*) FROM ${TABLE_LOYALTY_PROGRAMS} WHERE profile_id = $1 AND deleted_at IS NULL) as loyalty_programs_count,
          (SELECT COUNT(*) FROM ${TABLE_EMERGENCY_CONTACTS} WHERE profile_id = $1 AND deleted_at IS NULL) as emergency_contacts_count,
          (SELECT COUNT(*) FROM ${TABLE_TRAVEL_DOCUMENTS} WHERE profile_id = $1 AND deleted_at IS NULL) as travel_documents_count,
          (SELECT COUNT(*) FROM ${TABLE_PAYMENT_METHODS} WHERE profile_id = $1 AND deleted_at IS NULL) as payment_methods_count,
          (SELECT COUNT(*) FROM ${TABLE_ADDRESSES} WHERE profile_id = $1 AND deleted_at IS NULL) as addresses_count,
          (SELECT COUNT(*) FROM ${TABLE_EMAILS} WHERE profile_id = $1 AND deleted_at IS NULL) as emails_count,
          (SELECT COUNT(*) FROM ${TABLE_PHONES} WHERE profile_id = $1 AND deleted_at IS NULL) as phones_count
        `,
        [profileId],
      ),
    ]);

    const row = countsResult[0].rows[0];

    return {
      profileId,
      sabreProfileId,
      counts: {
        loyaltyPrograms: parseInt(row.loyalty_programs_count),
        emergencyContacts: parseInt(row.emergency_contacts_count),
        travelDocuments: parseInt(row.travel_documents_count),
        paymentMethods: parseInt(row.payment_methods_count),
        addresses: parseInt(row.addresses_count),
        emails: parseInt(row.emails_count),
        phones: parseInt(row.phones_count),
      },
    };
  }
}

export const getProfilesFromApexService = new GetProfilesFromApexService();
