import { transaction } from "../../config/database";
import logger from "../../utils/logger";
import { ProfileRelatedDataQueue } from "./profileRelatedDataQueue.service";
import { ProfileRelatedDataQueueProcessor } from "./profileRelatedDataQueueProcessor.service";
import { TABLE_ADDRESSES, TABLE_EMAILS, TABLE_EMERGENCY_CONTACTS, TABLE_LOYALTY_PROGRAMS, TABLE_PAYMENT_METHODS, TABLE_PHONES, TABLE_TRAVEL_DOCUMENTS } from "./profileTabes.constants";
import { ProfileRelatedData } from "./types";


/**
 * Optimized Profile Related Data Job Service
 * - Bulk inserts for maximum performance
 * - Smart soft delete: Only deletes records NOT in incoming data
 * - Minimal audit trail noise
 * - Full transaction rollback on any error
 */
export class ProfileRelatedDataJobService {
  private static instance: ProfileRelatedDataJobService;
  private queue: ProfileRelatedDataQueue;
  private processor: ProfileRelatedDataQueueProcessor;
  private readonly BATCH_SIZE = 100;
  private readonly PROCESS_INTERVAL = 1000;

  private constructor() {
    this.queue = new ProfileRelatedDataQueue(this.BATCH_SIZE);
    this.processor = new ProfileRelatedDataQueueProcessor(
      this.queue,
      (data) => this.processProfileRelatedData(data),
      this.PROCESS_INTERVAL,
    );
    this.processor.start();
  }

  public static getInstance(): ProfileRelatedDataJobService {
    if (!this.instance) {
      this.instance = new ProfileRelatedDataJobService();
    }
    return this.instance;
  }

  public enqueueProfile(data: ProfileRelatedData): void {
    this.queue.enqueue(data);
  }

  public enqueueBatch(dataList: ProfileRelatedData[]): void {
    this.queue.enqueueBatch(dataList);
  }

  public getQueueSize(): number {
    return this.queue.getSize();
  }

  public getStats(): ReturnType<ProfileRelatedDataQueueProcessor["getStats"]> {
    return this.processor.getStats();
  }

  /* ---------------------------------------------------
   * Optimized Provenance Builder - Pre-serialized JSON
   * --------------------------------------------------- */
  private buildProvenanceJSON(
    fields: string[],
    source: string,
    sourceId: string,
  ): string {
    const record = {
      source,
      source_id: sourceId,
      timestamp: new Date().toISOString(),
      confidence: 1.0,
    };

    const provenance: Record<string, typeof record> = {};
    for (let i = 0; i < fields.length; i++) {
      provenance[fields[i]] = record;
    }

    return JSON.stringify(provenance);
  }

  /* ---------------------------------------------------
   * Process Single Profile - Optimized with Bulk Inserts
   * Each table processes independently - failures don't affect others
   * --------------------------------------------------- */
  private async processProfileRelatedData(
    data: ProfileRelatedData,
  ): Promise<void> {
    const source = data.source || "SABRE";
    const sourceId = data.gdsProfileId;

    // Execute all inserts in parallel with individual error handling
    await Promise.allSettled([
      this.bulkInsertLoyaltyPrograms(data, source, sourceId),
      this.bulkInsertEmergencyContacts(data, source, sourceId),
      this.bulkInsertTravelDocuments(data, source, sourceId),
      this.bulkInsertPaymentMethods(data, source, sourceId),
      this.bulkInsertAddresses(data, source, sourceId),
      this.bulkInsertEmails(data, source, sourceId),
      this.bulkInsertPhones(data, source, sourceId),
    ]);
  }

  /* ---------------------------------------------------
   * Bulk Insert Loyalty Programs - OPTIMIZED SOFT DELETE
   * Only deletes records NOT present in incoming data
   * --------------------------------------------------- */
  private async bulkInsertLoyaltyPrograms(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const loyaltyPrograms = data?.loyalty || [];

    await transaction(async (client) => {
      // Build list of current member_numbers from incoming data
      const currentMemberNumbers: string[] = [];
      for (const program of loyaltyPrograms) {
        const memberNumber = program.member_number || program.memberNumber;
        if (memberNumber) {
          currentMemberNumbers.push(memberNumber);
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentMemberNumbers.length > 0) {
        // Delete only missing records
        const placeholders = currentMemberNumbers
          .map((_, i) => `$${i + 4}`)
          .join(", ");
        await client.query(
          `
          UPDATE ${TABLE_LOYALTY_PROGRAMS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND member_number NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentMemberNumbers],
        );
      } else {
        // If no incoming data, delete all existing records
        await client.query(
          `
          UPDATE ${TABLE_LOYALTY_PROGRAMS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current loyalty programs
      if (!Array.isArray(loyaltyPrograms) || loyaltyPrograms.length === 0)
        return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
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

      for (const program of loyaltyPrograms) {
        if (!program.member_number && !program.memberNumber) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          program.provider_type || program.providerType || "airline",
          program.provider_name || program.providerName || null,
          program.provider_code || program.providerCode || program.programCode,
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
          JSON.stringify(program.program_data || program),
          program.sync_enabled !== undefined ? program.sync_enabled : true,
          program.notes || null,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_LOYALTY_PROGRAMS} (
          profile_id, provider_type, provider_name, provider_code, program_name,
          member_number, member_name, tier_status, tier_level,
          points_balance, miles_balance, segment_count,
          member_since, tier_expiry_date, points_expiry_date,
          is_primary, auto_apply, login_username, login_password_encrypted,
          program_data, sync_enabled, notes, provenance
        ) VALUES ${placeholders.join(", ")}
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
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Emergency Contacts - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertEmergencyContacts(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const contacts = data?.emergencyContacts || [];

    await transaction(async (client) => {
      // Build unique keys (name + phone) from incoming data
      const currentKeys: string[] = [];
      for (const contact of contacts) {
        if (contact.name && contact.phone) {
          currentKeys.push(`${contact.name}|${contact.phone}`);
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentKeys.length > 0) {
        const placeholders = currentKeys.map((_, i) => `$${i + 4}`).join(", ");
        await client.query(
          `
          UPDATE ${TABLE_EMERGENCY_CONTACTS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND (name || '|' || phone) NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentKeys],
        );
      } else {
        await client.query(
          `
          UPDATE ${TABLE_EMERGENCY_CONTACTS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current emergency contacts
      if (!Array.isArray(contacts) || contacts.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
        ["name", "relationship", "phone", "email"],
        source,
        sourceId,
      );

      for (const contact of contacts) {
        if (!contact.name || !contact.phone) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          contact.name,
          contact.relationship || null,
          contact.phone,
          contact.email || null,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_EMERGENCY_CONTACTS} (
          profile_id, name, relationship, phone, email, provenance
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (profile_id, name, phone)
        DO UPDATE SET
          relationship = EXCLUDED.relationship,
          email = EXCLUDED.email,
          provenance = EXCLUDED.provenance,
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Travel Documents - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertTravelDocuments(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const documents = data?.documents || [];

    await transaction(async (client) => {
      // Build unique keys (type + document_number) from incoming data
      const currentKeys: string[] = [];
      for (const doc of documents) {
        const type = doc.type || doc.documentType;
        const number = doc.document_number || doc.documentNumber || doc.number;
        if (type && number) {
          currentKeys.push(`${type}|${number}`);
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentKeys.length > 0) {
        const placeholders = currentKeys.map((_, i) => `$${i + 4}`).join(", ");
        await client.query(
          `
          UPDATE ${TABLE_TRAVEL_DOCUMENTS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND (type || '|' || document_number) NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentKeys],
        );
      } else {
        await client.query(
          `
          UPDATE ${TABLE_TRAVEL_DOCUMENTS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current travel documents
      if (!Array.isArray(documents) || documents.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
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

      for (const doc of documents) {
        if (!doc.type && !doc.documentType) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          doc.type || doc.documentType,
          doc.document_number || doc.documentNumber || doc.number,
          doc.issuing_country || doc.issuingCountry || null,
          doc.issuing_authority || doc.issuingAuthority || null,
          doc.issue_date || doc.issueDate || null,
          doc.expiry_date || doc.expiryDate || null,
          JSON.stringify(doc.document_data || doc),
          doc.attachment_url || doc.attachmentUrl || null,
          doc.attachment_mime_type || doc.attachmentMimeType || null,
          doc.attachment_size_bytes || doc.attachmentSizeBytes || null,
          doc.notes || null,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_TRAVEL_DOCUMENTS} (
          profile_id, type, document_number, issuing_country, issuing_authority,
          issue_date, expiry_date, document_data,
          attachment_url, attachment_mime_type, attachment_size_bytes, notes, provenance
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (profile_id, type, document_number)
        DO UPDATE SET
          issuing_country = EXCLUDED.issuing_country,
          issuing_authority = EXCLUDED.issuing_authority,
          issue_date = EXCLUDED.issue_date,
          expiry_date = EXCLUDED.expiry_date,
          document_data = EXCLUDED.document_data,
          provenance = EXCLUDED.provenance,
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Payment Methods - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertPaymentMethods(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const paymentMethods = data?.paymentMethods || [];

    await transaction(async (client) => {
      // Build unique keys (card_last_four + card_type) from incoming data
      const currentKeys: string[] = [];
      for (const payment of paymentMethods) {
        const lastFour = payment.card_last_four || payment.cardLastFour;
        const cardType = payment.card_type || payment.cardType;
        if (lastFour && cardType) {
          currentKeys.push(`${lastFour}|${cardType}`);
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentKeys.length > 0) {
        const placeholders = currentKeys.map((_, i) => `$${i + 4}`).join(", ");
        await client.query(
          `
          UPDATE ${TABLE_PAYMENT_METHODS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND (card_last_four || '|' || card_type) NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentKeys],
        );
      } else {
        await client.query(
          `
          UPDATE ${TABLE_PAYMENT_METHODS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current payment methods
      if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
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

      for (const payment of paymentMethods) {
        if (!payment.card_last_four && !payment.cardLastFour) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
            $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
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
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_PAYMENT_METHODS} (
          profile_id, organization_id, card_token, card_last_four, card_type,
          expiry_month, expiry_year, billing_name, billing_address,
          is_corporate, corporate_reference, is_default, provenance
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (profile_id, card_last_four, card_type)
        DO UPDATE SET
          card_token = EXCLUDED.card_token,
          expiry_month = EXCLUDED.expiry_month,
          expiry_year = EXCLUDED.expiry_year,
          billing_name = EXCLUDED.billing_name,
          billing_address = EXCLUDED.billing_address,
          provenance = EXCLUDED.provenance,
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Addresses - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertAddresses(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const addresses = data?.contact?.addresses || [];

    await transaction(async (client) => {
      const currentLine1s: string[] = [];
      for (const addr of addresses) {
        if (addr.line1) {
          currentLine1s.push(addr.line1);
        }
      }

      if (currentLine1s.length > 0) {
        const placeholders = currentLine1s
          .map((_, i) => `$${i + 4}`)
          .join(", ");
        await client.query(
          `
        UPDATE ${TABLE_ADDRESSES}
        SET 
          deleted_at = NOW(),
          provenance = jsonb_set(
            provenance,
            '{deleted_at}',
            to_jsonb(jsonb_build_object(
              'source', $2,
              'source_id', $3,
              'timestamp', NOW(),
              'confidence', 1.0
            ))
          )
        WHERE profile_id = $1 
          AND deleted_at IS NULL
          AND provenance->>'source' = $2
          AND provenance->>'source_id' = $3
          AND line1 NOT IN (${placeholders})
        `,
          [data.profileId, source, sourceId, ...currentLine1s],
        );
      } else {
        // No incoming addresses - delete all
        await client.query(
          `
        UPDATE ${TABLE_ADDRESSES}
        SET 
          deleted_at = NOW(),
          provenance = jsonb_set(
            provenance,
            '{deleted_at}',
            to_jsonb(jsonb_build_object(
              'source', $2,
              'source_id', $3,
              'timestamp', NOW(),
              'confidence', 1.0
            ))
          )
        WHERE profile_id = $1 
          AND deleted_at IS NULL
          AND provenance->>'source' = $2
          AND provenance->>'source_id' = $3
        `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert incoming addresses
      if (!Array.isArray(addresses) || addresses.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
        ["type", "line1", "line2", "city", "state", "zip", "country"],
        source,
        sourceId,
      );

      for (const addr of addresses) {
        if (!addr.line1) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          addr.type || "unknown",
          addr.line1,
          addr.line2 || null,
          addr.city || null,
          addr.state || null,
          addr.zip || null,
          addr.country || null,
          addr.primary || addr.is_primary || false,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
      INSERT INTO ${TABLE_ADDRESSES} (
        profile_id, type, line1, line2, city, state, zip, country, is_primary, provenance
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (profile_id, type, line1)
      DO UPDATE SET
        type = EXCLUDED.type,        -- Allow type to update
        line2 = EXCLUDED.line2,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        country = EXCLUDED.country,
        is_primary = EXCLUDED.is_primary,
        provenance = EXCLUDED.provenance,
        deleted_at = NULL,           -- Restore if was deleted
        updated_at = NOW()
      `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Emails - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertEmails(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const emails = data?.contact?.emails || [];

    await transaction(async (client) => {
      // Build list of email addresses from incoming data
      const currentEmails: string[] = [];
      for (const email of emails) {
        if (email.address) {
          currentEmails.push(email.address.toLowerCase().trim());
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentEmails.length > 0) {
        const placeholders = currentEmails
          .map((_, i) => `$${i + 4}`)
          .join(", ");
        await client.query(
          `
          UPDATE ${TABLE_EMAILS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND address NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentEmails],
        );
      } else {
        await client.query(
          `
          UPDATE ${TABLE_EMAILS}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current emails
      if (!Array.isArray(emails) || emails.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
        ["address", "type"],
        source,
        sourceId,
      );

      for (const email of emails) {
        if (!email.address) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          email.address.toLowerCase().trim(),
          email.type || "personal",
          email.primary || email.is_primary || false,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_EMAILS} (
          profile_id, address, type, is_primary, provenance
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (profile_id, address)
        DO UPDATE SET
          type = EXCLUDED.type,
          is_primary = EXCLUDED.is_primary,
          provenance = EXCLUDED.provenance,
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Bulk Insert Phones - OPTIMIZED SOFT DELETE
   * --------------------------------------------------- */
  private async bulkInsertPhones(
    data: ProfileRelatedData,
    source: string,
    sourceId: string,
  ): Promise<void> {
    const phones = data?.contact?.phones || [];

    await transaction(async (client) => {
      // Build list of phone numbers from incoming data
      const currentPhones: string[] = [];
      for (const phone of phones) {
        if (phone.number) {
          currentPhones.push(phone.number);
        }
      }

      // STEP 1: Soft delete ONLY records that are NOT in the incoming data
      if (currentPhones.length > 0) {
        const placeholders = currentPhones
          .map((_, i) => `$${i + 4}`)
          .join(", ");
        await client.query(
          `
          UPDATE ${TABLE_PHONES}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
            AND number NOT IN (${placeholders})
          `,
          [data.profileId, source, sourceId, ...currentPhones],
        );
      } else {
        await client.query(
          `
          UPDATE ${TABLE_PHONES}
          SET 
            deleted_at = NOW(),
            provenance = jsonb_set(
              provenance,
              '{deleted_at}',
              to_jsonb(jsonb_build_object(
                'source', $2,
                'source_id', $3,
                'timestamp', NOW(),
                'confidence', 1.0
              ))
            )
          WHERE profile_id = $1 
            AND deleted_at IS NULL
            AND provenance->>'source' = $2
            AND provenance->>'source_id' = $3
          `,
          [data.profileId, source, sourceId],
        );
      }

      // STEP 2: Upsert current phones
      if (!Array.isArray(phones) || phones.length === 0) return;

      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      const provenance = this.buildProvenanceJSON(
        ["number", "type"],
        source,
        sourceId,
      );

      for (const phone of phones) {
        if (!phone.number) continue;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::jsonb)`,
        );

        values.push(
          data.profileId,
          phone.number,
          phone.type || "mobile",
          phone.primary || phone.is_primary || false,
          provenance,
        );
      }

      if (placeholders.length === 0) return;

      await client.query(
        `
        INSERT INTO ${TABLE_PHONES} (
          profile_id, number, type, is_primary, provenance
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (profile_id, number)
        DO UPDATE SET
          type = EXCLUDED.type,
          is_primary = EXCLUDED.is_primary,
          provenance = EXCLUDED.provenance,
          deleted_at = NULL,
          updated_at = NOW()
        `,
        values,
      );
    });
  }

  /* ---------------------------------------------------
   * Shutdown gracefully
   * --------------------------------------------------- */
  public async shutdown(): Promise<void> {
    logger.info("Shutting down ProfileRelatedDataJobService", {
      remainingJobs: this.queue.getSize(),
    });

    this.processor.stop();
    await this.processor.processAll();

    logger.info("ProfileRelatedDataJobService shutdown complete");
  }
}
