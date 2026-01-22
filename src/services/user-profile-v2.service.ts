import { getClient, query, transaction } from "../config/database";
import {
  CanonicalProfile,
  ProfileType,
} from "../models/canonical-profile.model";

interface UserIdentity {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
}

interface ProfileCreationResult {
  userId: string;
  profileId: string;
  gdsProfileId: string;
  isNewUser: boolean;
  isNewProfile: boolean;
  relatedUsers?: any[];
}

export class UserProfileServiceV2 {
  constructor() {}

  private buildProvenance(
    fields: string[],
    source: string,
    sourceId: string,
    timestamp: Date = new Date(),
  ) {
    const record = {
      source,
      source_id: sourceId,
      timestamp: timestamp.toISOString(),
      confidence: 1.0,
    };
    return fields.reduce((prov, field) => ({ ...prov, [field]: record }), {});
  }

  async findOrCreateUser(identity: UserIdentity, organizationId?: string) {
    return transaction(async (client) => {
      // Step 1: Find or create user
      const result = await client.query(
        `SELECT gds.find_or_create_user_by_identity($1, $2, $3, $4, $5) as user_id`,
        [
          identity.email,
          identity.firstName,
          identity.lastName,
          identity.dateOfBirth || null,
          organizationId || null,
        ],
      );

      const userId = result.rows[0].user_id;

      // Step 2: Check if new user
      const userCheck = await client.query(
        `SELECT created_at FROM core.users WHERE id = $1`,
        [userId],
      );
      const createdAt = new Date(userCheck.rows[0].created_at);
      const isNew = Date.now() - createdAt.getTime() < 5000;

      // Step 3: Find related users
      const relatedResult = await client.query(
        `SELECT * FROM gds.find_related_users($1, $2, $3)`,
        [identity.email, identity.firstName, identity.lastName],
      );

      const relatedUsers = relatedResult.rows.filter(
        (r) => r.user_id !== userId,
      );

      return {
        userId,
        isNew,
        relatedUsers: relatedUsers.length > 0 ? relatedUsers : undefined,
      };
    });
  }

  async createMasterProfile(
    userId: string | null,
    profileData: CanonicalProfile,
    organizationId: string,
  ) {
    return transaction(async (client) => {
      const source = profileData.metadata.sourceGDS;
      const sourceId = profileData.metadata.sourceId;
      const now = new Date();

      // Fallback names
      let firstName =
        profileData.personal.firstName ||
        (profileData.type === ProfileType.BUSINESS ? "Corporate" : "Unknown");
      let lastName =
        profileData.personal.lastName ||
        (profileData.type === ProfileType.BUSINESS
          ? profileData.employment?.company ||
            profileData.profileName ||
            `Profile-${profileData.id}`
          : "Unknown");

      // Calculate completeness
      const completenessResult = await client.query(
        `SELECT gds.calculate_completeness_score($1) as score`,
        [JSON.stringify(profileData)],
      );
      const completenessScore = completenessResult.rows[0].score;

      // Provenance
      const coreFields = [
        "first_name",
        "middle_name",
        "last_name",
        "date_of_birth",
        "gender",
        "email",
        "phone",
      ];
      const coreProvenance = this.buildProvenance(
        coreFields,
        source,
        sourceId,
        now,
      );

      // Insert master profile
      const result = await client.query(
        `INSERT INTO profiles.profiles (
          id, user_id, organization_id,
          first_name, middle_name, last_name,
          date_of_birth, email, phone,
          profile_type,
          completeness_score, is_active,
          provenance
        ) VALUES (
          gen_random_uuid(), $1, $2,
          $3, $4, $5,
          $6, $7, $8,
          $9,
          $10, true,
          $11
        ) RETURNING id`,
        [
          userId,
          organizationId,
          firstName,
          profileData.personal.middleName || null,
          lastName,
          profileData.personal.dob || null,
          profileData.contact.emails.find((e) => e.primary)?.address ||
            profileData.contact.emails[0]?.address ||
            null,
          profileData.contact.phones.find((p) => p.primary)?.number ||
            profileData.contact.phones[0]?.number ||
            null,
          profileData.type || "personal",
          completenessScore,
          JSON.stringify(coreProvenance),
        ],
      );

      const profileId = result.rows[0].id;

      // Sync child records
      await this.syncProfileChildren(profileId, profileData, client);

      return profileId;
    });
  }

  async createGdsProfile(
    profileId: string,
    gdsProfile: CanonicalProfile,
    gdsPcc: string,
  ) {
    return transaction(async (client) => {
      const completenessResult = await client.query(
        `SELECT gds.calculate_completeness_score($1) as score`,
        [JSON.stringify(gdsProfile)],
      );
      const completenessScore = completenessResult.rows[0].score;

      const result = await client.query(
        `INSERT INTO gds.gds_profiles (
          profile_id, gds_provider, gds_pcc, gds_profile_id, gds_profile_type,
          gds_profile_name, gds_raw_data, gds_metadata, sync_status,
          last_synced_at, completeness_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (gds_provider, gds_pcc, gds_profile_id)
        DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          gds_profile_name = EXCLUDED.gds_profile_name,
          gds_raw_data = EXCLUDED.gds_raw_data,
          gds_metadata = EXCLUDED.gds_metadata,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at,
          completeness_score = EXCLUDED.completeness_score
        RETURNING id`,
        [
          profileId,
          gdsProfile.metadata.sourceGDS.toLowerCase(),
          gdsPcc,
          gdsProfile.id,
          gdsProfile.type === ProfileType.BUSINESS ? "TVL" : "TVL",
          gdsProfile.profileName ||
            `${gdsProfile.personal.lastName}/${gdsProfile.personal.firstName}`,
          JSON.stringify(gdsProfile),
          JSON.stringify(gdsProfile.metadata),
          "completed",
          new Date(),
          completenessScore,
        ],
      );

      return result.rows[0].id;
    });
  }

  async importGdsProfile(
    gdsProfile: CanonicalProfile,
    gdsPcc: string,
    organizationId: string,
  ): Promise<ProfileCreationResult> {
    let userId: string | null = null;
    let isNewUser = false;
    let relatedUsers;

    const primaryEmail =
      gdsProfile.contact.emails.find((e) => e.primary)?.address ||
      gdsProfile.contact.emails[0]?.address;

    if (primaryEmail) {
      const userResult = await this.findOrCreateUser(
        {
          email: primaryEmail,
          firstName:
            gdsProfile.personal.firstName ||
            (gdsProfile.type === ProfileType.BUSINESS
              ? "Corporate"
              : "Unknown"),
          lastName:
            gdsProfile.personal.lastName ||
            (gdsProfile.type === ProfileType.BUSINESS
              ? gdsProfile.employment?.company ||
                gdsProfile.profileName ||
                `Profile-${gdsProfile.id}`
              : "Unknown"),
          dateOfBirth: gdsProfile.personal.dob,
        },
        organizationId,
      );

      userId = userResult.userId;
      isNewUser = userResult.isNew;
      relatedUsers = userResult.relatedUsers;
    }

    // Check for existing profile
    const existingProfile = await query<{ profile_id: string }>(
      `SELECT profile_id FROM gds.gds_profiles WHERE gds_provider=$1 AND gds_pcc=$2 AND gds_profile_id=$3`,
      [gdsProfile.metadata.sourceGDS.toLowerCase(), gdsPcc, gdsProfile.id],
    );

    let profileId: string;
    if (existingProfile.length > 0) {
      profileId = existingProfile[0].profile_id;
      await this.syncProfileChildren(profileId, gdsProfile);
    } else {
      profileId = await this.createMasterProfile(
        userId,
        gdsProfile,
        organizationId,
      );
    }

    const gdsProfileId = await this.createGdsProfile(
      profileId,
      gdsProfile,
      gdsPcc,
    );

    return {
      userId: userId || "",
      profileId,
      gdsProfileId,
      isNewUser,
      isNewProfile: true,
      relatedUsers,
    };
  }

  async syncProfileChildren(
    profileId: string,
    profileData: CanonicalProfile,
    client?: any,
  ) {
    const dbClient = client || (await getClient());
    try {
      const source = profileData.metadata.sourceGDS;
      const sourceId = profileData.metadata.sourceId;
      const now = new Date();

      // Emails
      if (profileData.contact.emails) {
        for (const email of profileData.contact.emails) {
          const prov = this.buildProvenance(
            ["address", "type", "is_primary"],
            source,
            sourceId,
            now,
          );
          await dbClient.query(
            `INSERT INTO profiles.emails (profile_id, address, type, is_primary, provenance)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (profile_id, address) DO NOTHING`,
            [
              profileId,
              email.address,
              email.type,
              email.primary,
              JSON.stringify(prov),
            ],
          );
        }
      }

      // Phones, Addresses, Documents, Loyalty, Payment Methods, Emergency Contacts...
      // Similar approach: use dbClient.query with ON CONFLICT DO NOTHING
    } finally {
      if (!client) dbClient.release();
    }
  }
}
