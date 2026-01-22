import axios, { AxiosInstance } from "axios";

/**
 * Configuration for GDS connectors
 */
export interface GDSConfig {
  endpoint: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Profile sync options
 */
export interface SyncOptions {
  batchSize?: number;
  profileTypes?: string[];
  onProgress?: (progress: SyncProgress) => void;
  onError?: (error: SyncError) => void;
}

/**
 * Progress information for sync operations
 */
export interface SyncProgress {
  totalProfiles: number;
  processedProfiles: number;
  successCount: number;
  errorCount: number;
  currentBatch: number;
  percentage: number;
}

/**
 * Error information for sync operations
 */
export interface SyncError {
  profileId?: string;
  message: string;
  error: Error;
  timestamp: Date;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  totalProfiles: number;
  syncedProfiles: number;
  failedProfiles: number;
  errors: SyncError[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

/**
 * Search criteria for profiles
 */
export interface SearchCriteria {
  pageNumber?: number;
  pageSize?: number;
  profileType?: string;
  profileName?: string;
  email?: string;
}

/**
 * Search result for profiles
 */
export interface SearchResult<T> {
  profiles: T[];
  hasMore: boolean;
  numReturned: number;
  pageNumber: number;
  pageSize: number;
  totalCount?: number;
}

/**
 * Base class for GDS connectors
 */
export abstract class BaseGDSConnector<TProfile = any> {
  protected config: Required<GDSConfig>;
  protected isAuthenticated: boolean = false;
  protected sessionToken?: string;
  protected tokenExpiry?: Date;
  protected httpClient: AxiosInstance;

  constructor(config: GDSConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.httpClient = axios.create({
      baseURL: config.endpoint,
      timeout: this.config.timeout,
      headers: {
        "Content-Type": "text/xml",
        Accept: "application/xml",
      },
    });
  }

  /**
   * Authenticate with the GDS
   */
  abstract login(): Promise<void>;

  /**
   * Close the GDS session
   */
  abstract logout(): Promise<void>;

  /**
   * Search for profiles based on criteria
   */
  abstract searchProfiles(
    criteria: SearchCriteria,
  ): Promise<SearchResult<TProfile>>;

  /**
   * Get a single profile by ID
   */
  abstract getProfile(profileId: string): Promise<TProfile | null>;

  /**
   * Get multiple profiles by IDs
   */
  abstract getProfiles(profileIds: string[]): Promise<TProfile[]>;

  /**
   * Create a new profile
   */
  abstract createProfile(profile: TProfile): Promise<string>;

  /**
   * Update an existing profile
   */
  abstract updateProfile(profile: TProfile): Promise<any>;

  /**
   * Delete a profile
   */
  abstract deleteProfile(profileId: string): Promise<void>;

  /**
   * Get the GDS name
   */
  abstract getGDSName(): string;

  /**
   * Sync profiles with optional filtering and progress tracking
   */
  async syncProfiles(options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = new Date();
    const errors: SyncError[] = [];
    let totalProfiles = 0;
    let syncedProfiles = 0;
    let failedProfiles = 0;

    try {
      if (!this.isAuthenticated) {
        await this.login();
      }

      const batchSize = options.batchSize || 100;
      let pageNumber = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const result = await this.searchProfiles({
            pageNumber,
            pageSize: batchSize,
            profileType: options.profileTypes?.[0],
          });

          totalProfiles = result.totalCount || result.profiles.length;
          hasMore = result.hasMore;

          for (const profile of result.profiles) {
            try {
              syncedProfiles++;

              if (options.onProgress) {
                options.onProgress({
                  totalProfiles,
                  processedProfiles: syncedProfiles + failedProfiles,
                  successCount: syncedProfiles,
                  errorCount: failedProfiles,
                  currentBatch: pageNumber,
                  percentage:
                    ((syncedProfiles + failedProfiles) / totalProfiles) * 100,
                });
              }
            } catch (error) {
              failedProfiles++;
              const syncError: SyncError = {
                profileId: (profile as any).id,
                message:
                  error instanceof Error ? error.message : "Unknown error",
                error:
                  error instanceof Error ? error : new Error(String(error)),
                timestamp: new Date(),
              };

              errors.push(syncError);

              if (options.onError) {
                options.onError(syncError);
              }
            }
          }

          pageNumber++;
        } catch (error) {
          const syncError: SyncError = {
            message: `Batch ${pageNumber} failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: new Date(),
          };

          errors.push(syncError);

          if (options.onError) {
            options.onError(syncError);
          }

          hasMore = false;
        }
      }
    } catch (error) {
      errors.push({
        message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });
    }

    const endTime = new Date();

    return {
      success: failedProfiles === 0,
      totalProfiles,
      syncedProfiles,
      failedProfiles,
      errors,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
    };
  }

  /**
   * Ensure the session is valid, login if needed
   */
  protected async ensureSession(): Promise<void> {
    const now = new Date();

    // Only login if not authenticated or token is expired
    if (
      !this.isAuthenticated ||
      (this.tokenExpiry && now >= this.tokenExpiry)
    ) {
      await this.login();
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retryAttempts,
    delay: number = this.config.retryDelay,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries - 1) {
          const backoffDelay = delay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }
}
