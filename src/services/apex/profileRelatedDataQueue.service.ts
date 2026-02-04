import logger from "../../utils/logger";
import { ProfileRelatedData } from "./types";

/**
 * Queue Manager for Profile Related Data
 * Handles enqueueing, dequeuing, and queue state management
 */
export class ProfileRelatedDataQueue {
  private queue: ProfileRelatedData[] = [];
  private readonly BATCH_SIZE: number;

  constructor(batchSize: number = 50) {
    this.BATCH_SIZE = batchSize;
    logger.info("ProfileRelatedDataQueue initialized", {
      batchSize: this.BATCH_SIZE,
    });
  }

  /**
   * Add a single profile to the queue
   */
  public enqueue(data: ProfileRelatedData): void {
    this.queue.push(data);
    logger.debug(`Profile ${data.profileId} added to related data queue`, {
      queueSize: this.queue.length,
    });
  }

  /**
   * Add multiple profiles to the queue
   */
  public enqueueBatch(dataList: ProfileRelatedData[]): void {
    this.queue.push(...dataList);
    logger.info(`${dataList.length} profiles added to related data queue`, {
      queueSize: this.queue.length,
    });
  }

  /**
   * Remove and return a batch of items from the queue
   */
  public dequeueBatch(): ProfileRelatedData[] {
    const batch = this.queue.splice(0, this.BATCH_SIZE);
    logger.debug(`Dequeued batch of ${batch.length} items`, {
      remainingInQueue: this.queue.length,
    });
    return batch;
  }

  /**
   * Get current queue size
   */
  public getSize(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all items from the queue
   */
  public clear(): void {
    const previousSize = this.queue.length;
    this.queue = [];
    logger.info(`Queue cleared`, {
      itemsCleared: previousSize,
    });
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    size: number;
    batchSize: number;
    estimatedBatches: number;
  } {
    return {
      size: this.queue.length,
      batchSize: this.BATCH_SIZE,
      estimatedBatches: Math.ceil(this.queue.length / this.BATCH_SIZE),
    };
  }
}
