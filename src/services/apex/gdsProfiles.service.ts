import { PoolClient, transaction } from "../../config/database";
import { getDefaultOrganizationId } from "../../connectors/helpers/otherHelpers";
import logger from "../../utils/logger";
import { ProfileRelatedDataJobService } from "./completeProfileInsertToApexDb.service";

const TABLE_USERS = "core.users";
const TABLE_PROFILES = "profiles.profiles";
const TABLE_GDS_PROFILES = "gds.gds_profiles";

/* ---------------------------------------------------
 * Configuration
 * --------------------------------------------------- */
const BATCH_SIZE = 10; // Reduced for faster transactions
const CONCURRENCY_LIMIT = 5; // Parallel transactions (adjust based on DB pool size)

/* ---------------------------------------------------
 * Types
 * --------------------------------------------------- */
interface ProcessBatchStats {
  created: number;
  updated: number;
  failed?: number;
  totalProcessed?: number;
  relatedDataQueued?: number;
}

interface NormalizedSabreProfile {
  gdsProfileId: string;
  profileName: string | null;
  profileType: string | null;
  pcc: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  raw: any;
}

interface BatchResult {
  created: number;
  failed: number;
  batchIndex: number;
  profilesCreated: Array<{
    profileId: string;
    organizationId: string;
    gdsProfileId: string;
    rawData: any;
    source?: string;
  }>;
}

export class GdsProfileService {
  private static instance: GdsProfileService;
  private relatedDataJobService: ProfileRelatedDataJobService;

  private constructor() {
    this.relatedDataJobService = ProfileRelatedDataJobService.getInstance();
  }

  public static getInstance(): GdsProfileService {
    if (!this.instance) {
      this.instance = new GdsProfileService();
    }
    return this.instance;
  }

  /* ---------------------------------------------------
   * Public entry - Parallel Batch Processing
   * --------------------------------------------------- */
  public async processProfileBatchBulk(
    sabreResponses: any[],
  ): Promise<ProcessBatchStats> {
    const startTime = Date.now();

    // Normalize all profiles
    const profiles = sabreResponses
      .map((r) => this.normalizeSabreProfile(r))
      .filter(Boolean) as NormalizedSabreProfile[];

    if (!profiles.length) {
      logger.info("No valid Sabre profiles to process");
      return {
        created: 0,
        updated: 0,
        failed: 0,
        totalProcessed: 0,
        relatedDataQueued: 0,
      };
    }

    logger.info(
      `Starting parallel batch processing for ${profiles.length} profiles`,
      {
        batchSize: BATCH_SIZE,
        concurrency: CONCURRENCY_LIMIT,
        estimatedBatches: Math.ceil(profiles.length / BATCH_SIZE),
      },
    );

    // Split into batches
    const batches = this.createBatches(profiles, BATCH_SIZE);
    logger.info(`Created ${batches.length} batches`);

    // Process batches with concurrency control
    const results = await this.processBatchesWithConcurrency(batches);

    // Aggregate results
    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    // Queue all successfully created profiles for related data insertion
    const allProfilesCreated = results.flatMap((r) => r.profilesCreated);

    if (allProfilesCreated.length > 0) {
      this.relatedDataJobService.enqueueBatch(allProfilesCreated);
      logger.info(
        `Queued ${allProfilesCreated.length} profiles for related data processing`,
        {
          currentQueueSize: this.relatedDataJobService.getQueueSize(),
        },
      );
    }

    const duration = Date.now() - startTime;
    logger.info(`Batch processing completed`, {
      totalProfiles: profiles.length,
      created: totalCreated,
      failed: totalFailed,
      relatedDataQueued: allProfilesCreated.length,
      duration: `${duration}ms`,
      avgTimePerProfile: `${(duration / profiles.length).toFixed(2)}ms`,
    });

    return {
      created: totalCreated,
      updated: 0,
      failed: totalFailed,
      totalProcessed: profiles.length,
      relatedDataQueued: allProfilesCreated.length,
    };
  }

  /* ---------------------------------------------------
   * Batch Management
   * --------------------------------------------------- */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatchesWithConcurrency(
    batches: NormalizedSabreProfile[][],
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    // Process in chunks with concurrency limit
    for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
      const chunk = batches.slice(i, i + CONCURRENCY_LIMIT);

      logger.info(
        `Processing chunk ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(batches.length / CONCURRENCY_LIMIT)}`,
        {
          batches: `${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, batches.length)}`,
          totalBatches: batches.length,
        },
      );

      // Process batches in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map((batch, index) => this.processSingleBatch(batch, i + index)),
      );

      // Collect results and handle failures
      chunkResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          const batchIndex = i + index;
          logger.error(`Batch ${batchIndex} failed completely`, {
            error:
              result.reason instanceof Error
                ? result.reason.message
                : result.reason,
            profileCount: chunk[index].length,
          });
          results.push({
            created: 0,
            failed: chunk[index].length,
            batchIndex,
            profilesCreated: [],
          });
        }
      });
    }

    return results;
  }

  /* ---------------------------------------------------
   * Single Batch Processing (runs in transaction)
   * --------------------------------------------------- */
  private async processSingleBatch(
    profiles: NormalizedSabreProfile[],
    batchIndex: number,
  ): Promise<BatchResult> {
    const batchStartTime = Date.now();

    try {
      const result = await transaction(async (client) => {
        let created = 0;
        let failed = 0;
        const profilesCreated: Array<{
          profileId: string;
          organizationId: string;
          gdsProfileId: string;
          rawData: any;
          source?: string;
        }> = [];

        for (const p of profiles) {
          try {
            const organizationId = await getDefaultOrganizationId();

            const userId = await this.getOrCreateUser(
              client,
              p,
              organizationId,
            );
            const profileId = await this.getOrCreateProfile(
              client,
              p,
              userId,
              organizationId,
            );
            const inserted = await this.insertGdsProfile(client, p, profileId);

            if (inserted) {
              created++;
              // Track successfully created profiles for job queue
              profilesCreated.push({
                profileId,
                organizationId,
                gdsProfileId: p.gdsProfileId,
                rawData: p.raw,
                source: "SABRE", // Can be made configurable if needed
              });
            }
          } catch (error) {
            failed++;
            logger.error(`Failed to process profile in batch ${batchIndex}`, {
              email: p.email,
              gdsProfileId: p.gdsProfileId,
              error: error instanceof Error ? error.message : error,
            });
            // Continue processing other profiles in the batch
          }
        }

        return { created, failed, profilesCreated };
      });

      const duration = Date.now() - batchStartTime;
      logger.info(`Batch ${batchIndex} completed`, {
        profileCount: profiles.length,
        created: result.created,
        failed: result.failed,
        duration: `${duration}ms`,
      });

      return {
        created: result.created,
        failed: result.failed,
        batchIndex,
        profilesCreated: result.profilesCreated,
      };
    } catch (error) {
      const duration = Date.now() - batchStartTime;
      logger.error(`Transaction failed for batch ${batchIndex}`, {
        error: error instanceof Error ? error.message : error,
        duration: `${duration}ms`,
        profileCount: profiles.length,
      });
      throw error; // Will be caught by Promise.allSettled
    }
  }

  /* ---------------------------------------------------
   * Normalizer
   * --------------------------------------------------- */
  private normalizeSabreProfile(input: any): NormalizedSabreProfile | null {
    const p = input?.profile;
    if (!p?.id) return null;

    const email = p.contact?.emails?.[0]?.address?.toLowerCase().trim() || null;

    if (!email || !this.isValidEmail(email)) return null;

    return {
      gdsProfileId: p.id,
      profileName: p.profileName || null,
      profileType: p.type || null,
      pcc: p.metadata?.sourcePCC || p.domain || null,
      email,
      firstName: p.personal?.firstName || null,
      lastName: p.personal?.lastName || null,
      phone: p.contact?.phones?.[0]?.number || null,
      raw: input,
    };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* ---------------------------------------------------
   * core.users
   * --------------------------------------------------- */
  private async getOrCreateUser(
    client: PoolClient,
    p: NormalizedSabreProfile,
    organizationId: string,
  ): Promise<string> {
    const existing = await client.query(
      `
      SELECT id
      FROM ${TABLE_USERS}
      WHERE organization_id = $1
        AND email = $2
      LIMIT 1
      `,
      [organizationId, p.email],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const inserted = await client.query(
      `
      INSERT INTO ${TABLE_USERS} (
        organization_id,
        email,
        first_name,
        last_name,
        phone,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
      `,
      [organizationId, p.email, p.firstName, p.lastName, p.phone],
    );

    return inserted.rows[0].id;
  }

  /* ---------------------------------------------------
   * profiles.profiles
   * --------------------------------------------------- */
  private async getOrCreateProfile(
    client: PoolClient,
    p: NormalizedSabreProfile,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const existing = await client.query(
      `
      SELECT id
      FROM ${TABLE_PROFILES}
      WHERE user_id = $1
        AND organization_id = $2
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [userId, organizationId],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const inserted = await client.query(
      `
      INSERT INTO ${TABLE_PROFILES} (
        user_id,
        organization_id,
        first_name,
        last_name,
        email,
        phone,
        profile_type,
        metadata,
        contact_info,
        provenance,
        completeness_score,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        'personal',
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10,
        NOW(),
        NOW()
      )
      RETURNING id
      `,
      [
        userId,
        organizationId,
        p.firstName,
        p.lastName,
        p.email,
        p.phone,
        p.raw,
        p.raw?.profile?.contact || {},
        {
          source: "SABRE",
          sourceProfileId: p.gdsProfileId,
          pcc: p.pcc,
        },
        this.calculateCompletenessScore(p),
      ],
    );

    return inserted.rows[0].id;
  }

  /* ---------------------------------------------------
   * gds.gds_profiles
   * --------------------------------------------------- */
  private async insertGdsProfile(
    client: PoolClient,
    p: NormalizedSabreProfile,
    profileId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
    INSERT INTO ${TABLE_GDS_PROFILES} (
      profile_id,
      gds_provider,
      gds_profile_id,
      gds_pcc,
      gds_profile_type,
      gds_profile_name,
      gds_raw_data,
      gds_metadata,
      sync_status,
      last_synced_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      'sabre',
      $2,
      $3,
      $4,
      $5,
      $6::jsonb,
      $7::jsonb,
      'completed',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (gds_provider, gds_pcc, gds_profile_id) DO NOTHING
    `,
      [
        profileId,
        p.gdsProfileId,
        p.pcc,
        p.profileType,
        p.profileName,
        p.raw,
        { synced_at: new Date().toISOString() },
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /* ---------------------------------------------------
   * Completeness
   * --------------------------------------------------- */
  private calculateCompletenessScore(p: NormalizedSabreProfile): number {
    const fields = [p.email, p.firstName, p.lastName, p.phone];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }

  /* ---------------------------------------------------
   * Get Job Service (for monitoring/testing)
   * --------------------------------------------------- */
  public getRelatedDataJobService(): ProfileRelatedDataJobService {
    return this.relatedDataJobService;
  }
}
