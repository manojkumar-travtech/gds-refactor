import logger from "../../utils/logger";
import { ProfileRelatedDataQueue } from "./profileRelatedDataQueue.service";
import { ProfileRelatedData } from "./types";

/**
 * Optimized Background Processor for Profile Related Data Queue
 * - No return values needed
 * - Simplified error handling
 * - Faster processing
 */
export class ProfileRelatedDataQueueProcessor {
  private isProcessing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL: number;
  private readonly queue: ProfileRelatedDataQueue;
  private readonly processFunction: (data: ProfileRelatedData) => Promise<void>;

  constructor(
    queue: ProfileRelatedDataQueue,
    processFunction: (data: ProfileRelatedData) => Promise<void>,
    processInterval: number = 1000,
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

      logger.debug(`Processing batch`, {
        size: batch.length,
        remaining: this.queue.getSize(),
      });

      // Process all profiles in parallel
      const results = await Promise.allSettled(
        batch.map((data) => this.processFunction(data)),
      );

      // Count successes and failures
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const duration = Date.now() - startTime;

      if (failed > 0) {
        logger.warn(`Batch completed with failures`, {
          successful,
          failed,
          duration: `${duration}ms`,
        });
        
        // Log only failed profiles
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            logger.error(`Profile processing failed`, {
              profileId: batch[index].profileId,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        });
      } else {
        logger.debug(`Batch completed`, {
          successful,
          duration: `${duration}ms`,
        });
      }
    } catch (error) {
      logger.error("Batch processing error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process all remaining items in the queue
   */
  public async processAll(): Promise<void> {
    const queueSize = this.queue.getSize();
    
    if (queueSize === 0) {
      return;
    }

    logger.info("Processing all remaining items", { queueSize });

    while (!this.queue.isEmpty() && !this.isProcessing) {
      await this.processBatch();
    }

    logger.info("Queue fully processed");
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