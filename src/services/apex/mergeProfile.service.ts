// ═══════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════

import { getClient } from "../../config/database";
import {
  CanonicalProfile,
  CompleteProfile,
  Email,
  FindOrCreateUserResult,
  Identity,
  ImportResult,
  Phone,
  ProfileType,
  Provenance,
  ProvenanceRecord,
  RelationshipMetadata,
  UserUpdate,
} from "../../types/mergeProfile.types";
import logger from "../../utils/logger";

export class UserProfileServiceV2 {
  /**
   * Build provenance record for tracking data sources
   */
  private buildProvenance(
    fields: string[],
    source: string,
    sourceId: string,
    timestamp: Date = new Date(),
  ): Provenance {
    const provenance: Provenance = {};
    const record: ProvenanceRecord = {
      source,
      source_id: sourceId,
      timestamp: timestamp.toISOString(),
      confidence: 1.0,
    };

    fields.forEach((field) => {
      provenance[field] = record;
    });

    return provenance;
  }

  /**
   * Find or create a user by identity information
   */
  async findOrCreateUser(
    identity: Identity,
    organizationId?: string,
  ): Promise<FindOrCreateUserResult> {
    const client = await getClient();
    try {
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

      const userCheck = await client.query(
        `SELECT created_at FROM core.users WHERE id = $1`,
        [userId],
      );

      const createdAt = new Date(userCheck.rows[0].created_at);
      const isNew = Date.now() - createdAt.getTime() < 5000;

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
    } finally {
      client.release();
    }
  }

  /**
   * Create a master profile with all related data
   */
  async createMasterProfile(
    userId: string,
    profileData: CanonicalProfile,
    organizationId?: string,
  ): Promise<string> {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const source = profileData.metadata.sourceGDS;
      const sourceId = profileData.metadata.sourceId;
      const now = new Date();

      // Calculate completeness score
      const completenessResult = await client.query(
        `SELECT gds.calculate_completeness_score($1) as score`,
        [JSON.stringify(profileData)],
      );
      const completenessScore = completenessResult.rows[0].score;

      // Build provenance for core fields
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

      // Insert main profile
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
        )
        RETURNING id`,
        [
          userId,
          organizationId,
          profileData.personal.firstName,
          profileData.personal.middleName || null,
          profileData.personal.lastName,
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

      // Insert emails
      if (profileData.contact.emails) {
        for (const email of profileData.contact.emails) {
          const emailProv = this.buildProvenance(
            ["address", "type", "is_primary"],
            source,
            sourceId,
            now,
          );
          await client.query(
            `INSERT INTO profiles.emails (profile_id, address, type, is_primary, provenance)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              profileId,
              email.address,
              email.type,
              email.primary,
              JSON.stringify(emailProv),
            ],
          );
        }
      }

      // Insert phones
      if (profileData.contact.phones) {
        for (const phone of profileData.contact.phones) {
          const phoneProv = this.buildProvenance(
            ["number", "type", "is_primary"],
            source,
            sourceId,
            now,
          );
          await client.query(
            `INSERT INTO profiles.phones (profile_id, number, type, is_primary, provenance)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              profileId,
              phone.number,
              phone.type,
              phone.primary || false,
              JSON.stringify(phoneProv),
            ],
          );
        }
      }

      // Insert addresses
      if (profileData.contact.addresses) {
        for (const addr of profileData.contact.addresses) {
          const addrProv = this.buildProvenance(
            ["line1", "city", "state", "zip", "country"],
            source,
            sourceId,
            now,
          );
          await client.query(
            `INSERT INTO profiles.addresses (profile_id, type, line1, line2, city, state, zip, country, is_primary, provenance)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              profileId,
              addr.type,
              addr.line1,
              addr.line2,
              addr.city,
              addr.state,
              addr.zip,
              addr.country,
              addr.primary || false,
              JSON.stringify(addrProv),
            ],
          );
        }
      }

      // Insert travel documents
      if (profileData.documents) {
        for (const doc of profileData.documents) {
          const docProv = this.buildProvenance(
            ["document_number", "type", "expiry_date"],
            source,
            sourceId,
            now,
          );
          await client.query(
            `INSERT INTO profiles.travel_documents (profile_id, type, document_number, issuing_country, issue_date, expiry_date, provenance)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              profileId,
              doc.type,
              doc.number,
              doc.issuingCountry,
              doc.issueDate || null,
              doc.expirationDate || null,
              JSON.stringify(docProv),
            ],
          );
        }
      }

      // Insert loyalty programs
      if (profileData.loyalty) {
        for (const prog of profileData.loyalty) {
          const loyProv = this.buildProvenance(
            ["member_number", "program_name"],
            source,
            sourceId,
            now,
          );
          await client.query(
            `INSERT INTO profiles.loyalty_programs (profile_id, provider_type, provider_name, program_name, member_number, tier_status, points_expiry_date, provenance)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              profileId,
              prog.providerType || "AIRLINE",
              prog.providerName,
              prog.programName,
              prog.number,
              prog.tier,
              prog.expirationDate || null,
              JSON.stringify(loyProv),
            ],
          );
        }
      }

      // Insert travel preferences
      if (profileData.preferences) {
        // Airline preferences
        if (profileData.preferences.airlines) {
          for (const pref of profileData.preferences.airlines) {
            const prefProv = this.buildProvenance(
              ["airline", "seat", "meal"],
              source,
              sourceId,
              now,
            );
            await client.query(
              `INSERT INTO profiles.travel_preferences (profile_id, category, vendor_code, preference_level, details, provenance)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                profileId,
                "AIRLINE",
                pref.airline,
                pref.level,
                JSON.stringify({
                  seat: pref.seat,
                  meal: pref.meal,
                  specialService: pref.specialService,
                }),
                JSON.stringify(prefProv),
              ],
            );
          }
        }

        // Hotel preferences
        if (profileData.preferences.hotels) {
          for (const pref of profileData.preferences.hotels) {
            const prefProv = this.buildProvenance(
              ["chain", "room_type", "bed_type"],
              source,
              sourceId,
              now,
            );
            await client.query(
              `INSERT INTO profiles.travel_preferences (profile_id, category, vendor_code, preference_level, details, provenance)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                profileId,
                "HOTEL",
                pref.chain,
                pref.level,
                JSON.stringify({
                  roomType: pref.roomType,
                  bedType: pref.bedType,
                  smoking: pref.smokingPreference,
                }),
                JSON.stringify(prefProv),
              ],
            );
          }
        }

        // Car preferences
        if (profileData.preferences.cars) {
          for (const pref of profileData.preferences.cars) {
            const prefProv = this.buildProvenance(
              ["vendor", "vehicle_type"],
              source,
              sourceId,
              now,
            );
            await client.query(
              `INSERT INTO profiles.travel_preferences (profile_id, category, vendor_code, preference_level, details, provenance)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                profileId,
                "CAR",
                pref.vendor,
                pref.level,
                JSON.stringify({
                  vehicleType: pref.vehicleType,
                  transmission: pref.transmission,
                }),
                JSON.stringify(prefProv),
              ],
            );
          }
        }
      }

      // Insert employment details
      if (profileData.employment) {
        const emp = profileData.employment;
        const empProv = this.buildProvenance(
          ["company", "employee_id", "division"],
          source,
          sourceId,
          now,
        );
        await client.query(
          `INSERT INTO profiles.employment_details (
            profile_id, company_name, title, department, employee_id, 
            cost_center, division, business_unit, project_id, 
            hire_date, location, region, is_current, provenance
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            profileId,
            emp.company || null,
            emp.title || null,
            emp.department || null,
            emp.employeeId || null,
            emp.costCenter || null,
            emp.division || null,
            emp.businessUnit || null,
            emp.projectID || null,
            emp.hireDate || null,
            emp.location || null,
            emp.region || null,
            emp.isCurrent !== undefined ? emp.isCurrent : true,
            JSON.stringify(empProv),
          ],
        );
      }

      await client.query("COMMIT");
      return profileId;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error creating master profile:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create or update a GDS profile reference
   */
  async createGdsProfile(
    profileId: string,
    gdsProfile: CanonicalProfile,
    gdsPcc: string,
  ): Promise<string> {
    const client = await getClient();
    try {
      if (!profileId) {
        throw new Error("Profile ID is required to create GDS profile");
      }

      const completenessResult = await client.query(
        `SELECT gds.calculate_completeness_score($1) as score`,
        [JSON.stringify(gdsProfile)],
      );
      const completenessScore = completenessResult.rows[0].score;

      const result = await client.query(
        `INSERT INTO gds.gds_profiles (
          profile_id,
          gds_provider,
          gds_pcc,
          gds_profile_id,
          gds_profile_type,
          gds_profile_name,
          gds_raw_data,
          gds_metadata,
          sync_status,
          last_synced_at,
          completeness_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (gds_provider, gds_pcc, gds_profile_id) 
        DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          gds_profile_name = EXCLUDED.gds_profile_name,
          gds_raw_data = EXCLUDED.gds_raw_data,
          gds_metadata = EXCLUDED.gds_metadata,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at,
          completeness_score = EXCLUDED.completeness_score,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          profileId,
          gdsProfile.metadata.sourceGDS.toLowerCase(),
          gdsPcc,
          gdsProfile.id,
          gdsProfile.type === ProfileType.BUSINESS ? "TVL" : "CRP",
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
    } finally {
      client.release();
    }
  }

  /**
   * Ensure client organization and PCC mapping exist
   */
  async ensureClientAndMapping(
    companyName: string,
    pcc: string,
    tmcOrganizationId?: string,
  ): Promise<string | null> {
    if (!companyName || !pcc) return null;

    const client = await getClient();
    try {
      let clientId: string;

      // Check if organization exists
      const orgRes = await client.query(
        "SELECT id FROM core.organizations WHERE LOWER(name) = LOWER($1)",
        [companyName],
      );

      if (orgRes.rows.length > 0) {
        clientId = orgRes.rows[0].id;
      } else {
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const insertRes = await client.query(
          `INSERT INTO core.organizations (name, slug, type, is_active)
           VALUES ($1, $2, 'enterprise', true)
           RETURNING id`,
          [companyName, slug],
        );
        clientId = insertRes.rows[0].id;
      }

      // Check if PCC exists
      let pccId: string;
      const pccRes = await client.query(
        "SELECT id FROM core.pccs WHERE pcc = $1",
        [pcc],
      );

      if (pccRes.rows.length > 0) {
        pccId = pccRes.rows[0].id;
      } else {
        const insertPccRes = await client.query(
          `INSERT INTO core.pccs (pcc, organization_id, name, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [pcc, tmcOrganizationId, `PCC ${pcc}`],
        );
        pccId = insertPccRes.rows[0].id;
      }

      // Create mapping
      await client.query(
        `INSERT INTO core.client_pcc_mappings (client_id, pcc_id)
         VALUES ($1, $2)
         ON CONFLICT (client_id, pcc_id) DO NOTHING`,
        [clientId, pccId],
      );

      return clientId;
    } catch (error) {
      logger.error(`Error ensuring client mapping for ${companyName}:`, error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<any | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        "SELECT id, email, first_name, last_name FROM core.users WHERE email = $1",
        [email],
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Get complete profile with all related data
   */
  async getCompleteProfile(profileId: string): Promise<CompleteProfile | null> {
    const client = await getClient();
    try {
      // Get main profile
      const profileResult = await client.query(
        "SELECT * FROM profiles.profiles WHERE id = $1",
        [profileId],
      );

      if (profileResult.rows.length === 0) {
        return null;
      }

      const profile = profileResult.rows[0];

      // Get related data in parallel
      const [emails, phones, addresses, documents, loyaltyPrograms] =
        await Promise.all([
          client.query("SELECT * FROM profiles.emails WHERE profile_id = $1", [
            profileId,
          ]),
          client.query("SELECT * FROM profiles.phones WHERE profile_id = $1", [
            profileId,
          ]),
          client.query(
            "SELECT * FROM profiles.addresses WHERE profile_id = $1",
            [profileId],
          ),
          client.query(
            "SELECT * FROM profiles.travel_documents WHERE profile_id = $1",
            [profileId],
          ),
          client.query(
            "SELECT * FROM profiles.loyalty_programs WHERE profile_id = $1",
            [profileId],
          ),
        ]);

      return {
        ...profile,
        emails: emails.rows,
        phones: phones.rows,
        addresses: addresses.rows,
        documents: documents.rows,
        loyaltyPrograms: loyaltyPrograms.rows,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get user's profile by user ID
   */
  async getUserProfile(userId: string): Promise<any | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT 
          p.id, p.user_id, p.first_name, p.middle_name, p.last_name, 
          p.date_of_birth, p.email, p.phone, p.organization_id, 
          p.profile_type, p.preferences, p.is_active,
          p.created_at, p.updated_at,
          u.email as user_email, u.phone as user_phone
        FROM profiles.profiles p
        JOIN core.users u ON p.user_id = u.id
        WHERE p.user_id = $1
        LIMIT 1`,
        [userId],
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Update user information
   */
  async updateUser(
    userId: string,
    userData: UserUpdate,
  ): Promise<{ id: string; updated: boolean }> {
    const client = await getClient();
    try {
      // First, get the current user data
      const currentUser = await client.query(
        "SELECT first_name, last_name, date_of_birth, phone, preferences FROM core.users WHERE id = $1",
        [userId],
      );

      if (currentUser.rows.length === 0) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const currentData = currentUser.rows[0];
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Helper function to check if a field has changed
      const hasChanged = (field: string, newValue: any): boolean => {
        const currentValue = currentData[field];
        if (newValue === undefined || newValue === null) return false;
        if (field === "preferences") {
          return (
            JSON.stringify(newValue) !== JSON.stringify(currentValue || {})
          );
        }
        return currentValue !== newValue;
      };

      // Check each field for changes
      if (hasChanged("first_name", userData.firstName)) {
        updates.push(`first_name = $${paramIndex++}`);
        values.push(userData.firstName);
      }
      if (hasChanged("last_name", userData.lastName)) {
        updates.push(`last_name = $${paramIndex++}`);
        values.push(userData.lastName);
      }
      if (hasChanged("date_of_birth", userData.dateOfBirth)) {
        updates.push(`date_of_birth = $${paramIndex++}`);
        values.push(userData.dateOfBirth);
      }
      if (hasChanged("phone", userData.phone)) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(userData.phone);
      }
      if (hasChanged("preferences", userData.preferences)) {
        updates.push(`preferences = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(userData.preferences || {}));
      }

      // Only update if there are changes
      if (updates.length > 0) {
        updates.push("updated_at = NOW()");
        const queryText = `
          UPDATE core.users 
          SET ${updates.join(", ")}
          WHERE id = $${paramIndex}
          RETURNING id
        `;
        values.push(userId);

        await client.query(queryText, values);
        logger.debug(
          `[DEBUG] Updated ${updates.length - 1} fields for user ${userId}`,
        );
      } else {
        logger.debug(
          `[DEBUG] No changes detected for user ${userId}, skipping update`,
        );
      }

      // Handle contact updates
      if (userData?.contact) {
        // Update phone if available in contact info
        if (userData?.contact?.phones && userData.contact.phones?.length > 0) {
          const primaryPhone =
            userData.contact.phones.find((p) => p.primary) ||
            userData.contact.phones[0];
          if (primaryPhone && primaryPhone.phoneNumber !== currentData.phone) {
            await client.query(
              `UPDATE core.users 
               SET phone = $1, updated_at = NOW()
               WHERE id = $2 AND (phone IS DISTINCT FROM $1)`,
              [primaryPhone.phoneNumber, userId],
            );
          }
        }

        // Update address if needed
        if (
          userData?.contact?.addresses?.length &&
          userData.contact.addresses?.length > 0
        ) {
          const primaryAddress =
            userData.contact.addresses.find((a) => a.primary) ||
            userData.contact.addresses[0];
          const addressResult = await client.query(
            `SELECT address_line1, address_line2, city, state, country, postal_code 
             FROM profiles.profiles 
             WHERE user_id = $1`,
            [userId],
          );

          const currentAddress = addressResult.rows[0] || {};
          const addressChanges: string[] = [];
          const addressValues: any[] = [];
          let addrParamIndex = 1;

          const addAddressUpdate = (field: string, value: any) => {
            if (value !== undefined && value !== currentAddress[field]) {
              addressChanges.push(`${field} = $${addrParamIndex++}`);
              addressValues.push(value);
            }
          };

          addAddressUpdate("address_line1", primaryAddress.line1);
          addAddressUpdate("address_line2", primaryAddress.line2);
          addAddressUpdate("city", primaryAddress.city);
          addAddressUpdate("state", primaryAddress.state);
          addAddressUpdate("country", primaryAddress.country);
          addAddressUpdate("postal_code", primaryAddress.postalCode);

          if (addressChanges.length > 0) {
            addressChanges.push("updated_at = NOW()");
            addressValues.push(userId);

            await client.query(
              `UPDATE profiles.profiles 
               SET ${addressChanges.join(", ")}
               WHERE user_id = $${addrParamIndex}`,
              addressValues,
            );
          }
        }
      }

      return { id: userId, updated: updates.length > 0 };
    } catch (error) {
      logger.error("Error updating user:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update related profile data (employment, emergency contacts, loyalty, documents, payments)
   */
  async updateRelatedProfileData(
    profileId: string,
    gdsProfile: CanonicalProfile,
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // 1. Update/Create Employment Details
      if (gdsProfile.employment) {
        await client.query(
          `INSERT INTO profiles.employment_details (
            profile_id, company_name, title, department, employee_id,
            cost_center, division, business_unit, project_id,
            hire_date, location, region, is_current, provenance
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true,
            jsonb_build_object(
              'source', 'GDS',
              'sourceId', $13,
              'updatedAt', NOW()
            )
          ) ON CONFLICT (profile_id) 
          DO UPDATE SET
            company_name = EXCLUDED.company_name,
            title = EXCLUDED.title,
            department = EXCLUDED.department,
            employee_id = EXCLUDED.employee_id,
            cost_center = EXCLUDED.cost_center,
            division = EXCLUDED.division,
            business_unit = EXCLUDED.business_unit,
            project_id = EXCLUDED.project_id,
            hire_date = EXCLUDED.hire_date,
            location = EXCLUDED.location,
            region = EXCLUDED.region,
            is_current = true,
            provenance = profiles.employment_details.provenance || EXCLUDED.provenance,
            updated_at = NOW()`,
          [
            profileId,
            gdsProfile.employment.company,
            gdsProfile.employment.title,
            gdsProfile.employment.department,
            gdsProfile.employment.employeeId,
            gdsProfile.employment.costCenter,
            gdsProfile.employment.division,
            gdsProfile.employment.businessUnit,
            gdsProfile.employment.projectId,
            gdsProfile.employment.hireDate,
            gdsProfile.employment.location,
            gdsProfile.employment.region,
            gdsProfile.id,
          ],
        );
      }

      // 2. Update/Create Emergency Contacts
      if (
        gdsProfile.emergencyContacts &&
        gdsProfile.emergencyContacts.length > 0
      ) {
        await client.query(
          "UPDATE profiles.emergency_contacts SET is_primary = false WHERE profile_id = $1",
          [profileId],
        );

        for (const contact of gdsProfile.emergencyContacts) {
          await client.query(
            `INSERT INTO profiles.emergency_contacts (
              profile_id, name, relationship, phone, email, is_primary, notes
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7
            ) ON CONFLICT (profile_id, LOWER(REPLACE(phone, ' ', ''))) 
            DO UPDATE SET
              name = EXCLUDED.name,
              relationship = EXCLUDED.relationship,
              email = EXCLUDED.email,
              is_primary = EXCLUDED.is_primary,
              notes = EXCLUDED.notes,
              updated_at = NOW()
            RETURNING id`,
            [
              profileId,
              `${contact.firstName} ${contact.lastName}`.trim(),
              contact.relationship,
              contact.phone,
              contact.email,
              contact.isPrimary || false,
              contact.notes,
            ],
          );
        }
      }

      // 3. Update/Create Loyalty Programs
      if (gdsProfile.loyaltyPrograms && gdsProfile.loyaltyPrograms.length > 0) {
        for (const program of gdsProfile.loyaltyPrograms) {
          await client.query(
            `INSERT INTO profiles.loyalty_programs (
              profile_id, program_name, membership_number, tier_level, 
              points_balance, expiration_date, is_primary
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7
            ) ON CONFLICT (profile_id, program_name, membership_number) 
            DO UPDATE SET
              tier_level = EXCLUDED.tier_level,
              points_balance = EXCLUDED.points_balance,
              expiration_date = EXCLUDED.expiration_date,
              is_primary = EXCLUDED.is_primary,
              updated_at = NOW()`,
            [
              profileId,
              program.programName,
              program.memberNumber,
              program.tierLevel,
              program.pointsBalance,
              program.expirationDate,
              program.isPrimary || false,
            ],
          );
        }
      }

      // 4. Update/Create Travel Documents
      if (gdsProfile.travelDocuments && gdsProfile.travelDocuments.length > 0) {
        for (const doc of gdsProfile.travelDocuments) {
          await client.query(
            `INSERT INTO profiles.travel_documents (
              profile_id, document_type, document_number, issuing_country,
              expiration_date, nationality, given_name, surname,
              date_of_birth, gender, issue_date
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            ) ON CONFLICT (profile_id, document_type, document_number) 
            DO UPDATE SET
              issuing_country = EXCLUDED.issuing_country,
              expiration_date = EXCLUDED.expiration_date,
              nationality = EXCLUDED.nationality,
              given_name = EXCLUDED.given_name,
              surname = EXCLUDED.surname,
              date_of_birth = EXCLUDED.date_of_birth,
              gender = EXCLUDED.gender,
              issue_date = EXCLUDED.issue_date,
              updated_at = NOW()`,
            [
              profileId,
              doc.documentType,
              doc.documentNumber,
              doc.issuingCountry,
              doc.expirationDate,
              doc.nationality,
              doc.givenName,
              doc.surname,
              doc.dateOfBirth,
              doc.gender,
              doc.issueDate,
            ],
          );
        }
      }

      // 5. Update/Create Payment Methods
      if (gdsProfile.paymentMethods && gdsProfile.paymentMethods.length > 0) {
        await client.query(
          "UPDATE profiles.payment_methods SET is_primary = false WHERE profile_id = $1",
          [profileId],
        );

        for (const payment of gdsProfile.paymentMethods) {
          await client.query(
            `INSERT INTO profiles.payment_methods (
              profile_id, payment_type, card_type, last_four,
              expiry_month, expiry_year, card_holder_name, is_primary,
              billing_address, is_default
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            ) ON CONFLICT (profile_id, payment_type, last_four, card_holder_name) 
            DO UPDATE SET
              expiry_month = EXCLUDED.expiry_month,
              expiry_year = EXCLUDED.expiry_year,
              is_primary = EXCLUDED.is_primary,
              billing_address = EXCLUDED.billing_address,
              is_default = EXCLUDED.is_default,
              updated_at = NOW()`,
            [
              profileId,
              payment.paymentType,
              payment.cardType,
              payment.lastFour,
              payment.expiryMonth,
              payment.expiryYear,
              payment.cardHolderName,
              payment.isPrimary || false,
              JSON.stringify(payment.billingAddress || {}),
              payment.isDefault || false,
            ],
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error updating related profile data:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new profile as fallback (when GDS profile is deleted)
   */
  private async createNewProfile(
    primaryEmail: string,
    gdsProfile: CanonicalProfile,
    gdsPcc: string,
    organizationId?: string,
  ): Promise<ImportResult> {
    logger.debug("[DEBUG] Creating new profile as fallback...");

    const userResult = await this.findOrCreateUser(
      {
        email: primaryEmail,
        firstName: gdsProfile.personal?.firstName || "Unknown",
        lastName: gdsProfile.personal?.lastName || "Unknown",
        dateOfBirth: gdsProfile.personal?.dob,
      },
      organizationId,
    );

    const profileId = await this.createMasterProfile(
      userResult.userId,
      gdsProfile,
      organizationId,
    );

    if (gdsProfile.employment?.company) {
      await this.ensureClientAndMapping(
        gdsProfile.employment.company,
        gdsPcc,
        organizationId,
      );
    }

    const gdsProfileId = await this.createGdsProfile(
      profileId,
      gdsProfile,
      gdsPcc,
    );

    return {
      userId: userResult.userId,
      profileId,
      gdsProfileId,
      isNewUser: true,
      isNewProfile: true,
      relatedUsers: [],
    };
  }

  /**
   * Import a GDS profile with deduplication and optimization
   */
  async importGdsProfile(
    gdsProfile: CanonicalProfile,
    gdsPcc: string,
    organizationId?: string,
    processedProfiles: Map<string, ImportResult> = new Map(),
  ): Promise<ImportResult> {
    const profileId = gdsProfile.id;
    logger.debug(`[DEBUG] Starting import for profile ID: ${profileId}`);

    // Check if already processed in current batch
    const profileKey = `${gdsPcc}:${profileId}`;
    if (processedProfiles.has(profileKey)) {
      logger.debug(
        `[DEBUG] Profile ${profileId} already processed in this batch, skipping...`,
      );
      return processedProfiles.get(profileKey)!;
    }

    try {
      // Extract primary email
      const primaryEmail =
        gdsProfile.contact?.emails?.find((e) => e.primary)?.address ||
        gdsProfile.contact?.emails?.[0]?.address ||
        `no-email-${profileId}@example.com`;

      logger.debug(`[DEBUG] Primary email: ${primaryEmail}`);

      // Check if profile exists
      const existingGdsProfile = await this.getGdsProfileByExternalId(
        profileId,
        gdsPcc,
      );
      if (existingGdsProfile) {
        logger.debug(
          `[DEBUG] Found existing profile ${profileId}, proceeding with update...`,
        );
      }

      // Process the user
      logger.debug("[DEBUG] Finding or creating user...");
      const userResult = await this.findOrCreateUser(
        {
          email: primaryEmail,
          firstName: gdsProfile.personal?.firstName || "Unknown",
          lastName: gdsProfile.personal?.lastName || "Unknown",
          dateOfBirth: gdsProfile.personal?.dob,
        },
        organizationId,
      );

      // Process client mapping
      if (gdsProfile.employment?.company) {
        logger.debug("[DEBUG] Ensuring client and mapping...");
        await this.ensureClientAndMapping(
          gdsProfile.employment.company,
          gdsPcc,
          organizationId,
        );
      }

      // Create or update master profile
      logger.debug("[DEBUG] Creating or updating master profile...");
      const profile = await this.createOrUpdateMasterProfile(
        userResult.userId,
        gdsProfile,
        organizationId,
      );

      // Create or update GDS profile reference
      logger.debug("[DEBUG] Creating or updating GDS profile reference...");
      const gdsProfileId = await this.createGdsProfile(
        profile.id,
        gdsProfile,
        gdsPcc,
      );

      // Update related profile data
      logger.debug("[DEBUG] Updating related profile data...");
      await this.updateRelatedProfileData(profile.id, gdsProfile);

      const result: ImportResult = {
        userId: userResult.userId,
        profileId: profile.id,
        gdsProfileId,
        isNewUser: userResult.isNew,
        isNewProfile: !existingGdsProfile,
        relatedUsers: userResult.relatedUsers || [],
      };

      // Cache the result
      processedProfiles.set(profileKey, result);
      return result;
    } catch (error: any) {
      logger.error(
        `[ERROR] Error in importGdsProfile for profile ${profileId}:`,
        error,
      );

      // Handle deleted profile case
      if (
        error.message === "PROFILE_DELETED" ||
        error.message.includes("Cannot read object with status DL") ||
        error.message.includes(
          "Update RQ is not allowed for object in DL status",
        )
      ) {
        logger.debug(
          "[DEBUG] Profile is marked as deleted in GDS, creating new profile...",
        );
        const primaryEmail =
          gdsProfile.contact?.emails?.find((e) => e.primary)?.address ||
          gdsProfile.contact?.emails?.[0]?.address ||
          `no-email-${profileId}@example.com`;
        return this.createNewProfile(
          primaryEmail,
          gdsProfile,
          gdsPcc,
          organizationId,
        );
      }

      throw error;
    }
  }

  /**
   * Get profile by ID with all related data
   */
  async getProfileById(profileId: string): Promise<any | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT p.*, 
           u.email,
           (SELECT json_agg(e) FROM profiles.emails e WHERE e.profile_id = p.id) as emails,
           (SELECT json_agg(p2) FROM profiles.phones p2 WHERE p2.profile_id = p.id) as phones,
           (SELECT json_agg(a) FROM profiles.addresses a WHERE a.profile_id = p.id) as addresses,
           (SELECT json_agg(d) FROM profiles.travel_documents d WHERE d.profile_id = p.id) as documents,
           (SELECT json_agg(l) FROM profiles.loyalty_programs l WHERE l.profile_id = p.id) as loyalty_programs,
           (SELECT json_agg(gp) FROM gds.gds_profiles gp WHERE gp.profile_id = p.id) as gds_profiles
        FROM profiles.profiles p
        JOIN core.users u ON p.user_id = u.id
        WHERE p.id = $1`,
        [profileId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get all profiles for a user
   */
  async getUserProfiles(
    userId: string,
    organizationId: string,
  ): Promise<any[]> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT 
          p.*,
          COUNT(gp.id) as gds_profile_count,
          json_agg(
            json_build_object(  
              'id', gp.id,
              'provider', gp.gds_provider,
              'pcc', gp.gds_pcc,
              'profile_id', gp.gds_profile_id,
              'last_synced', gp.last_synced_at
            )
          ) FILTER (WHERE gp.id IS NOT NULL) as gds_profiles
        FROM profiles.profiles p
        LEFT JOIN gds.gds_profiles gp ON gp.profile_id = p.id
        WHERE p.user_id = $1 AND p.organization_id = $2
        GROUP BY p.id
        ORDER BY p.completeness_score DESC`,
        [userId, organizationId],
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Identify potential relationships between profiles
   */
  async identifyRelationships(): Promise<any[]> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM gds.identify_potential_relationships()`,
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Record a relationship between profiles
   */
  async recordRelationship(
    profileId: string,
    relatedProfileId: string,
    relationshipType: string,
    metadata: RelationshipMetadata = {},
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO gds.profile_relationships (
          profile_id,
          related_profile_id,
          relationship_type,
          relationship_subtype,
          confidence_score,
          confidence_reason,
          same_email,
          same_address,
          same_company,
          same_pcc
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (profile_id, related_profile_id) DO NOTHING`,
        [
          profileId,
          relatedProfileId,
          relationshipType,
          metadata.subtype || null,
          metadata.confidenceScore || 50,
          JSON.stringify(metadata.reason || {}),
          metadata.sameEmail || false,
          metadata.sameAddress || false,
          metadata.sameCompany || false,
          metadata.samePcc || false,
        ],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get user summary with all profiles
   */
  async getUserSummary(
    userId: string,
    organizationId: string,
  ): Promise<any | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM gds.v_user_profile_summary WHERE user_id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      const summary = result.rows[0];
      const profiles = await this.getUserProfiles(userId, organizationId);

      return {
        ...summary,
        profiles,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Sync profile data to GDS
   */
  async syncToGds(
    profileId: string,
    gdsProfile: CanonicalProfile,
    direction: string = "to_gds",
    fields: string[] = [],
  ): Promise<CanonicalProfile> {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Get complete local profile
      const localProfile = await this.getCompleteProfile(profileId);
      if (!localProfile) {
        throw new Error("Local profile not found");
      }

      // Get current GDS profile
      const currentGdsProfile =
        (await this.getGdsProfileByExternalId(
          gdsProfile.id,
          gdsProfile.metadata.sourcePcc!,
        )) || gdsProfile;

      // Prepare update data
      const updateData: CanonicalProfile = {
        ...currentGdsProfile,
        metadata: {
          ...currentGdsProfile.metadata,
          lastSyncedAt: new Date().toISOString(),
          syncDirection: direction,
          syncedFields: fields.length > 0 ? fields : ["all"],
        },
      };

      // Map local profile data to GDS format
      if (fields.length === 0 || fields.includes("personal")) {
        updateData.personal = {
          ...(updateData.personal || {}),
          firstName: localProfile.first_name,
          lastName: localProfile.last_name,
          middleName: localProfile.middle_name,
          dateOfBirth: localProfile.date_of_birth,
          gender: localProfile.gender || "U",
        };
      }

      if (fields.length === 0 || fields.includes("contact")) {
        updateData.contact = {
          ...(updateData.contact || {}),
          emails:
            localProfile.emails?.map((e: any) => ({
              address: e.address,
              type: e.type,
              primary: e.is_primary,
              id: e.id,
            })) || [],
          phones:
            localProfile.phones?.map((p: any) => ({
              number: p.number,
              type: p.type,
              primary: p.is_primary,
              countryCode: p.country_code,
              id: p.id,
            })) || [],
          addresses:
            localProfile.addresses?.map((a: any) => ({
              line1: a.line1 || a.address_line1,
              line2: a.line2 || a.address_line2,
              city: a.city,
              state: a.state,
              postalCode: a.postal_code || a.postalCode,
              country: a.country,
              type: a.type,
              primary: a.is_primary,
              id: a.id,
            })) || [],
        };
      }

      if (
        (fields.length === 0 || fields.includes("documents")) &&
        localProfile.documents
      ) {
        updateData.documents = localProfile.documents.map((doc: any) => ({
          type: doc.type,
          number: doc.document_number || doc.number,
          issuingCountry: doc.issuing_country || doc.issuingCountry,
          issueDate: doc.issue_date || doc.issueDate,
          expiryDate: doc.expiry_date || doc.expiryDate,
          isVerified: doc.is_verified || false,
          id: doc.id,
        }));
      }

      if (
        (fields.length === 0 || fields.includes("loyalty")) &&
        localProfile.loyaltyPrograms
      ) {
        updateData.loyaltyPrograms = localProfile.loyaltyPrograms.map(
          (program: any) => ({
            providerName: program.provider_name || program.providerName,
            providerCode: program.provider_code || program.providerCode,
            programName: program.program_name || program.programName,
            memberNumber: program.member_number || program.memberNumber,
            tierStatus: program.tier_status || program.tierStatus,
            tierLevel: program.tier_level || program.tierLevel,
            pointsBalance: program.points_balance || program.pointsBalance || 0,
            memberSince: program.member_since || program.memberSince,
            tierExpiryDate: program.tier_expiry_date || program.tierExpiryDate,
            isPrimary: program.is_primary || program.isPrimary || false,
            id: program.id,
          }),
        );
      }

      // Save updated GDS profile
      await this.createGdsProfile(
        profileId,
        updateData,
        gdsProfile.metadata.sourcePcc!,
      );

      // Log the sync
      await client.query(
        `INSERT INTO gds.profile_sync_logs (
          profile_id, 
          gds_profile_id, 
          direction, 
          synced_fields, 
          status, 
          metadata
        ) VALUES ($1, $2, $3, $4, 'completed', $5)`,
        [
          profileId,
          gdsProfile.id,
          direction,
          fields.length > 0 ? fields : ["all"],
          {
            sourcePcc: gdsProfile.metadata.sourcePcc,
            timestamp: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
          },
        ],
      );

      await client.query("COMMIT");
      return updateData;
    } catch (error: any) {
      await client.query("ROLLBACK");
      logger.error("Error syncing to GDS:", error);

      // Log the error
      await client.query(
        `INSERT INTO gds.profile_sync_logs (
          profile_id, 
          gds_profile_id, 
          direction, 
          status, 
          error_message,
          metadata
        ) VALUES ($1, $2, $3, 'failed', $4, $5)`,
        [
          profileId,
          gdsProfile?.id,
          direction,
          error.message,
          {
            sourcePcc: gdsProfile?.metadata?.sourcePcc,
            timestamp: new Date().toISOString(),
            error: error.toString(),
            stack: error.stack,
          },
        ],
      );

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update profile with new data
   */
  async updateProfile(profileData: any): Promise<any> {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Update main profile
      await client.query(
        `UPDATE profiles.profiles 
        SET 
          first_name = $1,
          middle_name = $2,
          last_name = $3,
          date_of_birth = $4,
          email = $5,
          phone = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
        [
          profileData.personal?.firstName,
          profileData.personal?.middleName || null,
          profileData.personal?.lastName,
          profileData.personal?.dob || null,
          profileData.contact?.emails?.find((e: Email) => e.primary)?.address ||
            profileData.contact?.emails?.[0]?.address ||
            null,
          profileData.contact?.phones?.find((p: Phone) => p.primary)?.number ||
            profileData.contact?.phones?.[0]?.number ||
            null,
          profileData.id,
        ],
      );

      // Update emails
      if (profileData.contact?.emails) {
        await client.query(
          "DELETE FROM profiles.emails WHERE profile_id = $1",
          [profileData.id],
        );

        for (const email of profileData.contact.emails) {
          await client.query(
            `INSERT INTO profiles.emails (
              profile_id, address, type, is_primary, provenance
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              profileData.id,
              email.address,
              email.type || "PERSONAL",
              email.primary || false,
              JSON.stringify(
                email.provenance || {
                  source: "SYSTEM",
                  timestamp: new Date().toISOString(),
                },
              ),
            ],
          );
        }
      }

      // Update phones
      if (profileData.contact?.phones) {
        await client.query(
          "DELETE FROM profiles.phones WHERE profile_id = $1",
          [profileData.id],
        );

        for (const phone of profileData.contact.phones) {
          await client.query(
            `INSERT INTO profiles.phones (
              profile_id, number, type, is_primary, country_code, provenance
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              profileData.id,
              phone.number,
              phone.type || "MOBILE",
              phone.primary || false,
              phone.countryCode || null,
              JSON.stringify(
                phone.provenance || {
                  source: "SYSTEM",
                  timestamp: new Date().toISOString(),
                },
              ),
            ],
          );
        }
      }

      // Update addresses
      if (profileData.contact?.addresses) {
        await client.query(
          "DELETE FROM profiles.addresses WHERE profile_id = $1",
          [profileData.id],
        );

        for (const address of profileData.contact.addresses) {
          await client.query(
            `INSERT INTO profiles.addresses (
              profile_id, type, line1, line2, city, state, 
              postal_code, country, is_primary, provenance
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              profileData.id,
              address.type || "HOME",
              address.line1,
              address.line2 || null,
              address.city,
              address.state || null,
              address.postalCode || null,
              address.country,
              address.primary || false,
              JSON.stringify(
                address.provenance || {
                  source: "SYSTEM",
                  timestamp: new Date().toISOString(),
                },
              ),
            ],
          );
        }
      }

      // Update travel documents
      if (profileData.documents) {
        await client.query(
          "DELETE FROM profiles.travel_documents WHERE profile_id = $1",
          [profileData.id],
        );

        for (const doc of profileData.documents) {
          await client.query(
            `INSERT INTO profiles.travel_documents (
              profile_id, type, document_number, issuing_country,
              issue_date, expiry_date, is_verified, provenance
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              profileData.id,
              doc.type,
              doc.number,
              doc.issuingCountry,
              doc.issueDate || null,
              doc.expiryDate || null,
              doc.isVerified || false,
              JSON.stringify(
                doc.provenance || {
                  source: "SYSTEM",
                  timestamp: new Date().toISOString(),
                },
              ),
            ],
          );
        }
      }

      // Update loyalty programs
      if (profileData.loyaltyPrograms) {
        await client.query(
          "DELETE FROM profiles.loyalty_programs WHERE profile_id = $1",
          [profileData.id],
        );

        for (const program of profileData.loyaltyPrograms) {
          await client.query(
            `INSERT INTO profiles.loyalty_programs (
              profile_id, provider_name, provider_code, program_name,
              member_number, tier_status, tier_level, points_balance,
              member_since, tier_expiry_date, is_primary, provenance
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              profileData.id,
              program.providerName,
              program.providerCode || null,
              program.programName || null,
              program.memberNumber,
              program.tierStatus || null,
              program.tierLevel || null,
              program.pointsBalance || 0,
              program.memberSince || null,
              program.tierExpiryDate || null,
              program.isPrimary || false,
              JSON.stringify(
                program.provenance || {
                  source: "SYSTEM",
                  timestamp: new Date().toISOString(),
                },
              ),
            ],
          );
        }
      }

      await client.query("COMMIT");
      return profileData;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error updating profile:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get GDS profile by external ID and PCC
   */
  async getGdsProfileByExternalId(
    externalId: string,
    gdsPcc: string,
  ): Promise<any | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM gds.gds_profiles 
         WHERE gds_profile_id = $1 AND gds_pcc = $2 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [externalId, gdsPcc],
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Create or update a master profile
   */
  async createOrUpdateMasterProfile(
    userId: string,
    gdsProfile: CanonicalProfile,
    organizationId?: string,
  ): Promise<{ id: string }> {
    const client = await getClient();
    try {
      // Try to get existing profile
      const existingProfile = await this.getUserProfile(userId);

      let profileId: string;
      if (existingProfile) {
        // Update existing profile
        const updatedProfile = await this.updateProfile({
          id: existingProfile.id,
          personal: {
            firstName:
              gdsProfile.personal?.firstName || existingProfile.first_name,
            lastName:
              gdsProfile.personal?.lastName || existingProfile.last_name,
            dob: gdsProfile.personal?.dob || existingProfile.date_of_birth,
          },
          contact: {
            emails: gdsProfile.contact?.emails || [
              {
                address: existingProfile.email,
                primary: true,
              },
            ],
            phones:
              gdsProfile.contact?.phones ||
              (existingProfile.phone
                ? [
                    {
                      number: existingProfile.phone,
                      primary: true,
                    },
                  ]
                : []),
          },
        });
        profileId = updatedProfile.id;
      } else {
        // Create new profile
        profileId = await this.createMasterProfile(
          userId,
          gdsProfile,
          organizationId,
        );
      }

      return { id: profileId };
    } finally {
      client.release();
    }
  }
}
