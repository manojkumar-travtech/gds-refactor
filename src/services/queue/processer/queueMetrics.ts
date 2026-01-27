import {
  QueueProcessConfig,
  ErrorRecord,
  WarningRecord,
} from "../../../constants/QueueConstant";

/**
 * Processing summary returned by metrics
 */
interface ProcessingSummary {
  queueNumber: number;
  expectedItems: number;
  processedItems: number;
  skippedItems: number;
  failedItems: number;
  totalRetries: number;
  successRate: string;
  duration: string;
  averageProcessingTime: string;
  rate: string;
  errors: ErrorRecord[];
  warnings: WarningRecord[];
}

/**
 * Tracks metrics and progress for queue processing
 */
export class QueueMetrics {
  readonly queueNumber: number;
  readonly expectedItems: number;
  private startTime: number;

  itemsProcessed: number = 0;
  itemsSkipped: number = 0;
  itemsFailed: number = 0;
  totalRetries: number = 0;

  private processingTimes: number[] = [];
  errors: ErrorRecord[] = [];
  warnings: WarningRecord[] = [];

  constructor(queueNumber: number, expectedItems: number) {
    this.queueNumber = queueNumber;
    this.expectedItems = expectedItems;
    this.startTime = Date.now();
  }

  /**
   * Record successful item processing
   */
  recordSuccess(processingTime: number): void {
    this.itemsProcessed++;
    this.processingTimes.push(processingTime);
  }

  /**
   * Record skipped item
   */
  recordSkip(reason: string): void {
    this.itemsSkipped++;
    this.warnings.push({
      type: "skip",
      reason,
      timestamp: new Date(),
    });
  }

  /**
   * Record failed item
   */
  recordFailure(itemNumber: number, error: Error | string): void {
    this.itemsFailed++;
    this.errors.push({
      queueNumber: this.queueNumber,
      itemNumber,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
    });
  }

  /**
   * Record retry attempt
   */
  recordRetry(): void {
    this.totalRetries++;
  }

  /**
   * Get current progress percentage
   */
  getProgress(): number {
    return this.expectedItems > 0
      ? (this.itemsProcessed / this.expectedItems) * 100
      : 0;
  }

  /**
   * Get processing rate (items per second)
   */
  getRate(): number {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return elapsedSeconds > 0 ? this.itemsProcessed / elapsedSeconds : 0;
  }

  /**
   * Get estimated time to completion (in seconds)
   */
  getETA(): number | null {
    const rate = this.getRate();
    const remaining = this.expectedItems - this.itemsProcessed;
    return rate > 0 ? remaining / rate : null;
  }

  /**
   * Get average processing time per item (in milliseconds)
   */
  getAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    return sum / this.processingTimes.length;
  }

  /**
   * Log current progress
   */
  logProgress(current: number): void {
    if (!QueueProcessConfig.ENABLE_PROGRESS_LOGGING) return;

    const progress = this.getProgress();
    const rate = this.getRate();
    const eta = this.getETA();
    const avgTime = this.getAverageProcessingTime();

    console.log(
      `[QUEUE ${this.queueNumber}] Progress: ${current}/${this.expectedItems} ` +
        `(${progress.toFixed(1)}%) | Rate: ${rate.toFixed(2)}/s | ` +
        `Avg Time: ${avgTime.toFixed(0)}ms | ` +
        `ETA: ${eta ? this.formatETA(eta) : "N/A"} | ` +
        `Retries: ${this.totalRetries} | Failed: ${this.itemsFailed}`,
    );
  }

  /**
   * Format ETA in human-readable format
   */
  private formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.ceil(seconds)}s`;
    } else if (seconds < 3600) {
      return `${Math.ceil(seconds / 60)}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.ceil((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Get final summary
   */
  getSummary(): ProcessingSummary {
    const duration = Date.now() - this.startTime;
    const successRate =
      this.expectedItems > 0
        ? (this.itemsProcessed / this.expectedItems) * 100
        : 0;

    return {
      queueNumber: this.queueNumber,
      expectedItems: this.expectedItems,
      processedItems: this.itemsProcessed,
      skippedItems: this.itemsSkipped,
      failedItems: this.itemsFailed,
      totalRetries: this.totalRetries,
      successRate: successRate.toFixed(2) + "%",
      duration: this.formatDuration(duration),
      averageProcessingTime: this.getAverageProcessingTime().toFixed(0) + "ms",
      rate: this.getRate().toFixed(2) + "/s",
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
