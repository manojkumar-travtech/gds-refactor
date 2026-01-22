import cron, { ScheduledTask } from "node-cron";
import axios, { AxiosInstance, AxiosError } from "axios";
import axiosRetry from "axios-retry";

import { query } from "../config/database";

export type SyncDirection = "to_profiles" | "to_gds" | "merge_profiles";

export interface ProfileSyncOptions {
  direction?: SyncDirection;
  profileIds?: string[];
}

export class SyncScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private http: AxiosInstance;
  constructor() {
    this.http = axios.create({
      baseURL: `http://localhost:${process.env.PORT || 3000}`,
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    // Automatic retries for network / 5xx errors
    axiosRetry(this.http, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) =>
        axiosRetry.isNetworkError(error) ||
        axiosRetry.isRetryableError(error) ||
        (error.response?.status ?? 0) >= 500,
    });
  }

  // ----------------------
  // Job Scheduling
  // ----------------------
  public scheduleJob(
    name: string,
    schedule: string,
    task: () => Promise<void>,
  ): void {
    if (this.jobs.has(name)) throw new Error(`Job '${name}' already exists`);

    const job = cron.schedule(
      schedule,
      async () => {
        const startedAt = Date.now();
        console.log(`[${new Date().toISOString()}] ▶ ${name} started`);
        try {
          await task();
          console.log(
            `[${new Date().toISOString()}] ✔ ${name} finished in ${
              Date.now() - startedAt
            }ms`,
          );
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ✖ ${name} failed`, err);
        }
      },
      { timezone: "UTC" },
    );

    this.jobs.set(name, job);
    console.log(`Scheduled '${name}' -> ${schedule}`);
  }

  // ----------------------
  // DB Helpers
  // ----------------------
  private async getDefaultOrganizationId(): Promise<string> {
    const rows = await query<{ id: string }>(
      "SELECT id FROM core.organizations ORDER BY created_at LIMIT 1",
    );
    if (!rows.length) throw new Error("No organizations found in DB");
    return rows[0].id;
  }

  // ----------------------
  // API Calls
  // ----------------------
  private async callSyncApi(
    direction: SyncDirection,
    profileIds: string[],
  ): Promise<void> {
    const targetOrgId = await this.getDefaultOrganizationId();
    const payload = { syncDirection: direction, profileIds, targetOrgId };

    try {
      await this.http.post("/api/sync", payload);
    } catch (error) {
      this.handleAxiosError(error, "Profile Sync");
    }
  }

  private async callTripSyncApi(): Promise<void> {
    try {
      await this.http.post("/api/sync-trips-to-apex", {});
    } catch (error) {
      this.handleAxiosError(error, "Trip Sync");
    }
  }

  // ----------------------
  // Error Handling
  // ----------------------
  private handleAxiosError(error: unknown, context: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`[${context}] Axios Error`, {
        status,
        data,
        message: error.message,
      });
      throw new Error(
        `${context} failed${status ? ` (HTTP ${status})` : ""}: ${error.message}`,
      );
    }
    throw error;
  }

  // ----------------------
  // Scheduler Methods
  // ----------------------
  public scheduleProfileSync(
    schedule: string,
    options: ProfileSyncOptions = {},
  ): void {
    const { direction = "to_profiles", profileIds = [] } = options;

    this.scheduleJob(`profile-sync-${direction}`, schedule, async () => {
      if (direction === "merge_profiles" && profileIds.length === 0) {
        console.log("Skipping merge_profiles - no profile IDs");
        return;
      }
      await this.callSyncApi(direction, profileIds);
    });
  }

  public scheduleTripSync(schedule: string): void {
    this.scheduleJob("trip-sync", schedule, async () => {
      await this.callTripSyncApi();
    });
  }

  // ----------------------
  // Lifecycle
  // ----------------------
  public start(): void {
    console.log("--- Scheduler started ---");
  }

  public async stop(): Promise<void> {
    console.log("Stopping scheduler...");
    this.jobs.forEach((job) => job.stop());
  }
}

// ----------------------
// Execution Block
// ----------------------
if (require.main === module) {
  const scheduler = new SyncScheduler();

  if (process.env.SYNC_FROM_GDS_SCHEDULE) {
    scheduler.scheduleProfileSync(process.env.SYNC_FROM_GDS_SCHEDULE, {
      direction: "to_profiles",
    });
  }

  if (process.env.SYNC_TRIPS_SCHEDULE) {
    scheduler.scheduleTripSync(process.env.SYNC_TRIPS_SCHEDULE);
  }

  scheduler.start();

  process.on("SIGINT", async () => {
    await scheduler.stop();
    process.exit(0);
  });
}
