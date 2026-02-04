import { PoolClient, transaction } from "../../config/database";
import logger from "../../utils/logger";
import { ProfileRelatedDataQueue } from "./profileRelatedDataQueue.service";
import { ProfileRelatedDataQueueProcessor } from "./profileRelatedDataQueueProcessor.service";
import { ProfileRelatedData, InsertionResult, ProvenanceRecord } from "./types";

const TABLE_LOYALTY_PROGRAMS = "profiles.loyalty_programs";
const TABLE_EMERGENCY_CONTACTS = "profiles.emergency_contacts";
const TABLE_TRAVEL_DOCUMENTS = "profiles.travel_documents";
const TABLE_PAYMENT_METHODS = "profiles.payment_methods";
const TABLE_ADDRESSES = "profiles.addresses";
const TABLE_EMAILS = "profiles.emails";
const TABLE_PHONES = "profiles.phones";

/**
 * Profile Related Data Job Service
 * Handles insertion of profile-related data into various tables
 */
export class ProfileRelatedDataJobService {
  private static instance: ProfileRelatedDataJobService;
  private queue: ProfileRelatedDataQueue;
  private processor: ProfileRelatedDataQueueProcessor;
  private readonly BATCH_SIZE = 50;
  private readonly PROCESS_INTERVAL = 5000; // 5 seconds

  private constructor() {
    // Initialize queue and processor
    this.queue = new ProfileRelatedDataQueue(this.BATCH_SIZE);
    this.processor = new ProfileRelatedDataQueueProcessor(
      this.queue,
      (data) => this.processProfileRelatedData(data),
      this.PROCESS_INTERVAL,
    );

    // Start the background processor
    this.processor.start();
  }

  public static getInstance(): ProfileRelatedDataJobService {
    if (!this.instance) {
      this.instance = new ProfileRelatedDataJobService();
    }
    return this.instance;
  }

  /* ---------------------------------------------------
   * Public Queue Management Interface
   * --------------------------------------------------- */

  /**
   * Add a single profile to the processing queue
   */
  public enqueueProfile(data: ProfileRelatedData): void {
    this.queue.enqueue(data);
  }

  /**
   * Add multiple profiles to the processing queue
   */
  public enqueueBatch(dataList: ProfileRelatedData[]): void {
    this.queue.enqueueBatch(dataList);
  }

  /**
   * Get current queue size
   */
  public getQueueSize(): number {
    return this.queue.getSize();
  }

  /**
   * Get detailed queue and processor statistics
   */
  public getStats(): ReturnType<ProfileRelatedDataQueueProcessor["getStats"]> {
    return this.processor.getStats();
  }

  /* ---------------------------------------------------
   * Provenance Builder
   * --------------------------------------------------- */
  private buildProvenance(
    fields: string[],
    source: string,
    sourceId: string,
    timestamp: Date = new Date(),
  ): Record<string, ProvenanceRecord> {
    const provenance: Record<string, ProvenanceRecord> = {};
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

  /* ---------------------------------------------------
   * Process Single Profile's Related Data
   * --------------------------------------------------- */
  private async processProfileRelatedData(
    data: ProfileRelatedData,
  ): Promise<InsertionResult> {
    const result: InsertionResult = {
      profileId: data.profileId,
      loyaltyPrograms: 0,
      emergencyContacts: 0,
      travelDocuments: 0,
      paymentMethods: 0,
      addresses: 0,
      emails: 0,
      phones: 0,
      errors: [],
    };

    try {
      await transaction(async (client) => {
        const source = data.source || "SABRE";
        const sourceId = data.gdsProfileId;

        // Insert loyalty programs
        try {
          result.loyaltyPrograms = await this.insertLoyaltyPrograms(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Loyalty Programs: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert emergency contacts
        try {
          result.emergencyContacts = await this.insertEmergencyContacts(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Emergency Contacts: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert travel documents
        try {
          result.travelDocuments = await this.insertTravelDocuments(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Travel Documents: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert payment methods
        try {
          result.paymentMethods = await this.insertPaymentMethods(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Payment Methods: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert addresses
        try {
          result.addresses = await this.insertAddresses(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Addresses: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert emails
        try {
          result.emails = await this.insertEmails(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Emails: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Insert phones
        try {
          result.phones = await this.insertPhones(
            client,
            data,
            source,
            sourceId,
          );
        } catch (error) {
          result.errors.push(
            `Phones: ${error instanceof Error ? error.message : error}`,
          );
        }
      });

      if (result.errors.length > 0) {
        logger.warn(`Partial success for profile ${data.profileId}`, {
          errors: result.errors,
        });
      } else {
        logger.debug(
          `Successfully processed all related data for profile ${data.profileId}`,
          {
            loyaltyPrograms: result.loyaltyPrograms,
            emergencyContacts: result.emergencyContacts,
            travelDocuments: result.travelDocuments,
            paymentMethods: result.paymentMethods,
            addresses: result.addresses,
            emails: result.emails,
            phones: result.phones,
          },
        );
      }

      return result;
    } catch (error) {
      logger.error(`Transaction failed for profile ${data.profileId}`, {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /* ---------------------------------------------------
   * Insert into profiles.loyalty_programs
   * --------------------------------------------------- */
  private async insertLoyaltyPrograms(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const loyaltyPrograms = data.rawData?.profile?.loyalty || [];

    if (!Array.isArray(loyaltyPrograms) || loyaltyPrograms.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const program of loyaltyPrograms) {
      if (!program.member_number && !program.memberNumber) {
        continue;
      }

      const provenance = this.buildProvenance(
        [
          "provider_type",
          "provider_name",
          "provider_code",
          "program_name",
          "member_number",
          "member_name",
          "tier_status",
          "tier_level",
          "points_balance",
          "miles_balance",
        ],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_LOYALTY_PROGRAMS} (
            profile_id, provider_type, provider_name, provider_code, program_name,
            member_number, member_name, tier_status, tier_level,
            points_balance, miles_balance, segment_count,
            member_since, tier_expiry_date, points_expiry_date,
            is_primary, auto_apply, login_username, login_password_encrypted,
            program_data, sync_enabled, notes, provenance
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23
          )
          ON CONFLICT (profile_id, provider_code, member_number) 
          DO UPDATE SET
            provider_name = EXCLUDED.provider_name,
            program_name = EXCLUDED.program_name,
            tier_status = EXCLUDED.tier_status,
            tier_level = EXCLUDED.tier_level,
            points_balance = EXCLUDED.points_balance,
            miles_balance = EXCLUDED.miles_balance,
            program_data = EXCLUDED.program_data,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            program.provider_type || program.providerType || "airline",
            program.provider_name || program.providerName || null,
            program.provider_code ||
              program.providerCode ||
              program.programCode,
            program.program_name || program.programName || null,
            program.member_number || program.memberNumber,
            program.member_name || program.memberName || null,
            program.tier_status || program.tierStatus || null,
            program.tier_level || program.tierLevel || null,
            program.points_balance || program.pointsBalance || null,
            program.miles_balance || program.milesBalance || null,
            program.segment_count || program.segmentCount || null,
            program.member_since || program.memberSince || null,
            program.tier_expiry_date || program.tierExpiryDate || null,
            program.points_expiry_date || program.pointsExpiryDate || null,
            program.is_primary || program.isPrimary || false,
            program.auto_apply || program.autoApply || true,
            program.login_username || program.loginUsername || null,
            program.login_password_encrypted ||
              program.loginPasswordEncrypted ||
              null,
            program.program_data || program,
            program.sync_enabled !== undefined ? program.sync_enabled : true,
            program.notes || null,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert loyalty program`, {
          profileId: data.profileId,
          providerCode: program.provider_code || program.providerCode,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(
        `Inserted ${inserted} loyalty programs for profile ${data.profileId}`,
      );
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.emergency_contacts
   * --------------------------------------------------- */
  private async insertEmergencyContacts(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const contacts = data.rawData?.profile?.emergencyContacts || [];

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const contact of contacts) {
      if (!contact.name || !contact.phone) {
        continue;
      }

      const provenance = this.buildProvenance(
        ["name", "relationship", "phone", "email"],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_EMERGENCY_CONTACTS} (
            profile_id, name, relationship, phone, email, provenance
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (profile_id, name, phone)
          DO UPDATE SET
            relationship = EXCLUDED.relationship,
            email = EXCLUDED.email,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            contact.name,
            contact.relationship || null,
            contact.phone,
            contact.email || null,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert emergency contact`, {
          profileId: data.profileId,
          contactName: contact.name,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(
        `Inserted ${inserted} emergency contacts for profile ${data.profileId}`,
      );
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.travel_documents
   * --------------------------------------------------- */
  private async insertTravelDocuments(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const documents = data.rawData?.profile?.documents || [];

    if (!Array.isArray(documents) || documents.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const doc of documents) {
      if (!doc.type && !doc.documentType) {
        continue;
      }

      const provenance = this.buildProvenance(
        [
          "type",
          "document_number",
          "issuing_country",
          "issuing_authority",
          "issue_date",
          "expiry_date",
        ],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_TRAVEL_DOCUMENTS} (
            profile_id, type, document_number, issuing_country, issuing_authority,
            issue_date, expiry_date, document_data,
            attachment_url, attachment_mime_type, attachment_size_bytes, notes, provenance
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (profile_id, type, document_number)
          DO UPDATE SET
            issuing_country = EXCLUDED.issuing_country,
            issuing_authority = EXCLUDED.issuing_authority,
            issue_date = EXCLUDED.issue_date,
            expiry_date = EXCLUDED.expiry_date,
            document_data = EXCLUDED.document_data,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            doc.type || doc.documentType,
            doc.document_number || doc.documentNumber,
            doc.issuing_country || doc.issuingCountry || null,
            doc.issuing_authority || doc.issuingAuthority || null,
            doc.issue_date || doc.issueDate || null,
            doc.expiry_date || doc.expiryDate || null,
            doc.document_data || doc,
            doc.attachment_url || doc.attachmentUrl || null,
            doc.attachment_mime_type || doc.attachmentMimeType || null,
            doc.attachment_size_bytes || doc.attachmentSizeBytes || null,
            doc.notes || null,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert travel document`, {
          profileId: data.profileId,
          documentType: doc.type || doc.documentType,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(
        `Inserted ${inserted} travel documents for profile ${data.profileId}`,
      );
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.payment_methods
   * --------------------------------------------------- */
  private async insertPaymentMethods(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const paymentMethods = data.rawData?.profile?.paymentMethods || [];

    if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const payment of paymentMethods) {
      if (!payment.card_last_four && !payment.cardLastFour) {
        continue;
      }

      const provenance = this.buildProvenance(
        [
          "card_token",
          "card_last_four",
          "card_type",
          "expiry_month",
          "expiry_year",
          "billing_name",
          "billing_address",
        ],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_PAYMENT_METHODS} (
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
            provenance
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (profile_id, card_last_four, card_type)
          DO UPDATE SET
            card_token = EXCLUDED.card_token,
            expiry_month = EXCLUDED.expiry_month,
            expiry_year = EXCLUDED.expiry_year,
            billing_name = EXCLUDED.billing_name,
            billing_address = EXCLUDED.billing_address,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            data.organizationId,
            payment.card_token || payment.cardToken || null,
            payment.card_last_four || payment.cardLastFour,
            payment.card_type || payment.cardType,
            payment.expiry_month || payment.expiryMonth,
            payment.expiry_year || payment.expiryYear,
            payment.billing_name || payment.billingName || null,
            payment.billing_address || payment.billingAddress || null,
            payment.is_corporate || payment.isCorporate || false,
            payment.corporate_reference || payment.corporateReference || null,
            payment.is_default || payment.isDefault || false,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert payment method`, {
          profileId: data.profileId,
          cardType: payment.card_type || payment.cardType,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(
        `Inserted ${inserted} payment methods for profile ${data.profileId}`,
      );
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.addresses
   * --------------------------------------------------- */
  private async insertAddresses(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const addresses = data.rawData?.profile?.addresses || [];

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const addr of addresses) {
      if (!addr.line1) {
        continue;
      }

      const provenance = this.buildProvenance(
        ["type", "line1", "line2", "city", "state", "zip", "country"],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_ADDRESSES} (
            profile_id, type, line1, line2, city, state, zip, country, is_primary, provenance
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (profile_id, type, line1)
          DO UPDATE SET
            line2 = EXCLUDED.line2,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            zip = EXCLUDED.zip,
            country = EXCLUDED.country,
            is_primary = EXCLUDED.is_primary,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            addr.type || "home",
            addr.line1,
            addr.line2 || null,
            addr.city || null,
            addr.state || null,
            addr.zip || null,
            addr.country || null,
            addr.primary || addr.is_primary || false,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert address`, {
          profileId: data.profileId,
          addressType: addr.type,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(
        `Inserted ${inserted} addresses for profile ${data.profileId}`,
      );
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.emails
   * --------------------------------------------------- */
  private async insertEmails(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const emails = data.rawData?.profile?.emails || [];

    if (!Array.isArray(emails) || emails.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const email of emails) {
      if (!email.address) {
        continue;
      }

      const provenance = this.buildProvenance(
        ["address", "type"],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_EMAILS} (
            profile_id, address, type, is_primary, provenance
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (profile_id, address)
          DO UPDATE SET
            type = EXCLUDED.type,
            is_primary = EXCLUDED.is_primary,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            email.address.toLowerCase().trim(),
            email.type || "personal",
            email.primary || email.is_primary || false,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert email`, {
          profileId: data.profileId,
          emailAddress: email.address,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(`Inserted ${inserted} emails for profile ${data.profileId}`);
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Insert into profiles.phones
   * --------------------------------------------------- */
  private async insertPhones(
    client: PoolClient,
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<number> {
    const phones = data.rawData?.profile?.phones || [];

    if (!Array.isArray(phones) || phones.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const phone of phones) {
      if (!phone.number) {
        continue;
      }

      const provenance = this.buildProvenance(
        ["number", "type"],
        source,
        sourceId,
      );

      try {
        const result = await client.query(
          `
          INSERT INTO ${TABLE_PHONES} (
            profile_id, number, type, is_primary, provenance
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (profile_id, number)
          DO UPDATE SET
            type = EXCLUDED.type,
            is_primary = EXCLUDED.is_primary,
            provenance = EXCLUDED.provenance,
            updated_at = NOW()
          RETURNING *
          `,
          [
            data.profileId,
            phone.number,
            phone.type || "mobile",
            phone.primary || phone.is_primary || false,
            provenance,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        }
      } catch (error) {
        logger.error(`Failed to insert phone`, {
          profileId: data.profileId,
          phoneNumber: phone.number,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (inserted > 0) {
      logger.debug(`Inserted ${inserted} phones for profile ${data.profileId}`);
    }
    return inserted;
  }

  /* ---------------------------------------------------
   * Manual Trigger (for testing or immediate processing)
   * --------------------------------------------------- */
  public async processImmediately(
    data: ProfileRelatedData,
  ): Promise<InsertionResult> {
    logger.info(`Immediate processing requested for profile ${data.profileId}`);
    return this.processProfileRelatedData(data);
  }

  /* ---------------------------------------------------
   * Shutdown gracefully
   * --------------------------------------------------- */
  public async shutdown(): Promise<void> {
    logger.info("Shutting down ProfileRelatedDataJobService", {
      remainingJobs: this.queue.getSize(),
    });

    // Stop accepting new items
    this.processor.stop();

    // Process remaining items
    await this.processor.processAll();

    logger.info("ProfileRelatedDataJobService shutdown complete");
  }
}
