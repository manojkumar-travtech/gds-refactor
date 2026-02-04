import logger from "../../utils/logger";
import { ProfileRelatedDataQueue } from "./profileRelatedDataQueue.service";
import { ProfileRelatedData, InsertionResult } from "./types";

/**
 * Background Processor for Profile Related Data Queue
 * Handles periodic processing of queued items
 */
export class ProfileRelatedDataQueueProcessor {
  private isProcessing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL: number;
  private readonly queue: ProfileRelatedDataQueue;
  private readonly processFunction: (
    data: ProfileRelatedData,
  ) => Promise<InsertionResult>;

  constructor(
    queue: ProfileRelatedDataQueue,
    processFunction: (data: ProfileRelatedData) => Promise<InsertionResult>,
    processInterval: number = 5000,
  ) {
    this.queue = queue;
    this.processFunction = processFunction;
    this.PROCESS_INTERVAL = processInterval;
  }

  /**
   * Start the background processor
   */
  public start(): void {
    if (this.intervalId) {
      logger.warn("Background processor already running");
      return;
    }

    this.intervalId = setInterval(async () => {
      if (!this.isProcessing && !this.queue.isEmpty()) {
        await this.processBatch();
      }
    }, this.PROCESS_INTERVAL);

    logger.info("Profile related data background processor started", {
      interval: `${this.PROCESS_INTERVAL}ms`,
      queueStats: this.queue.getStats(),
    });
  }

  /**
   * Stop the background processor
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Background processor stopped");
    }
  }

  /**
   * Check if processor is currently running
   */
  public isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Check if processor is currently processing a batch
   */
  public isBusy(): boolean {
    return this.isProcessing;
  }

  /**
   * Process a batch from the queue
   */
  public async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.isEmpty()) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const batch = this.queue.dequeueBatch();

      logger.info(`Processing related data batch`, {
        batchSize: batch.length,
        remainingInQueue: this.queue.getSize(),
      });

      const results = await Promise.allSettled(
        batch.map((data) => this.processFunction(data)),
      );

      // Analyze results
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const duration = Date.now() - startTime;

      logger.info(`Related data batch completed`, {
        successful,
        failed,
        duration: `${duration}ms`,
        remaining: this.queue.getSize(),
      });

      // Log failures with details
      this.logFailures(results, batch);
    } catch (error) {
      logger.error("Error processing related data queue", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process all remaining items in the queue
   */
  public async processAll(): Promise<void> {
    logger.info("Processing all remaining items in queue", {
      queueSize: this.queue.getSize(),
    });

    while (!this.queue.isEmpty() && !this.isProcessing) {
      await this.processBatch();
    }

    logger.info("All queue items processed");
  }

  /**
   * Log failed processing attempts
   */
  private logFailures(
    results: PromiseSettledResult<InsertionResult>[],
    batch: ProfileRelatedData[],
  ): void {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(`Failed to process related data for profile`, {
          profileId: batch[index].profileId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : result.reason,
        });
      }
    });
  }

  /**
   * Get processor statistics
   */
  public getStats(): {
    isRunning: boolean;
    isProcessing: boolean;
    processInterval: number;
    queueStats: ReturnType<ProfileRelatedDataQueue["getStats"]>;
  } {
    return {
      isRunning: this.isRunning(),
      isProcessing: this.isProcessing,
      processInterval: this.PROCESS_INTERVAL,
      queueStats: this.queue.getStats(),
    };
  }
}
