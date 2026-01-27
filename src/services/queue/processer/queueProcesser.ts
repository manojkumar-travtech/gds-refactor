import {
  QueueProcessConfig,
  QueueConfigOverrides,
  ErrorType,
  QueueAction,
  CallbackAction,
  QueueProcessingResult,
  QueueResponse,
  QueueData,
  ProcessCallback,
  IQueueClient,
} from "../../../constants/QueueConstant";
import { ResilienceExecutor } from "../../../executors/resilienceExecutor";
import { QueueState } from "./queueState";
import { QueueMetrics } from "./queueMetrics";
import { ErrorClassifier } from "./errorClassifier";

/**
 * Enhanced Queue Processor with robust error handling, retry logic, and metrics
 */
export class QueueProcessor {
  private client: IQueueClient;
  private resilienceExecutor: ResilienceExecutor;

  constructor(queueClient: IQueueClient) {
    this.client = queueClient;
    this.resilienceExecutor = new ResilienceExecutor();
  }

  /**
   * Process queue with count-based iteration
   * @param queueNumber - Queue number to process
   * @param processCallback - Callback function for each item
   * @param options - Processing options
   * @returns Processing results
   */
  async processQueueWithCount(
    queueNumber: number,
    processCallback?: ProcessCallback | null,
    options: QueueConfigOverrides = {},
  ): Promise<QueueProcessingResult> {
    const config = { ...QueueProcessConfig, ...options };

    try {
      // Get queue count - handle case where queue might be empty
      const queueData = await this.getQueueData(queueNumber);

      if (!queueData || queueData.count === 0) {
        console.log(`[QUEUE ${queueNumber}] Queue is empty or not found`);
        return this.createEmptyResult(queueNumber);
      }

      console.log(
        `[QUEUE ${queueNumber}] Starting processing: ${queueData.count} items`,
      );

      // Initialize state and metrics
      const state = new QueueState(queueNumber, queueData.count);
      const metrics = new QueueMetrics(queueNumber, queueData.count);

      // Process the queue
      const result = await this.processQueue(
        queueNumber,
        state,
        metrics,
        processCallback,
        config,
      );

      // Log final summary
      this.logSummary(metrics);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[QUEUE ${queueNumber}] Fatal error:`, errorMessage);
      throw error;
    }
  }

  /**
   * Process queue without pre-fetching count (processes until end)
   * Useful when queue count is unreliable or unavailable
   */
  async processQueueUntilEnd(
    queueNumber: number,
    processCallback?: ProcessCallback | null,
    options: QueueConfigOverrides = {},
  ): Promise<QueueProcessingResult> {
    const config = { ...QueueProcessConfig, ...options };

    try {
      console.log(`[QUEUE ${queueNumber}] Starting processing (unknown count)`);

      // Initialize state with unknown total (will be updated as we process)
      const state = new QueueState(queueNumber, config.MAX_ITERATIONS);
      const metrics = new QueueMetrics(queueNumber, 0); // Unknown count initially

      // Process the queue
      const result = await this.processQueue(
        queueNumber,
        state,
        metrics,
        processCallback,
        config,
      );

      // Update expected items with actual processed count
      result.expectedItems = metrics.itemsProcessed + metrics.itemsSkipped;

      // Log final summary
      this.logSummary(metrics);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[QUEUE ${queueNumber}] Fatal error:`, errorMessage);
      throw error;
    }
  }

  /**
   * Main queue processing loop
   */
  private async processQueue(
    queueNumber: number,
    state: QueueState,
    metrics: QueueMetrics,
    processCallback: ProcessCallback | null | undefined,
    config: typeof QueueProcessConfig,
  ): Promise<QueueProcessingResult> {
    let queueAccessStarted = false;

    try {
      // Access queue and get first item
      console.log(`[QUEUE ${queueNumber}] Accessing queue...`);
      const firstResponse = await this.accessQueue(queueNumber);
      queueAccessStarted = true;

      if (!this.hasQueueItem(firstResponse)) {
        console.log(`[QUEUE ${queueNumber}] No items in queue`);
        return this.createResult(state, metrics, true);
      }

      state.start();
      console.log(
        `[QUEUE ${queueNumber}] Queue accessed successfully, starting processing`,
      );

      // Process first item
      await this.processItem(
        firstResponse,
        state,
        metrics,
        processCallback,
        config,
      );

      // Process remaining items
      await this.processRemainingItems(
        queueNumber,
        state,
        metrics,
        processCallback,
        config,
      );

      return this.createResult(state, metrics, true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[QUEUE ${queueNumber}] Processing error:`, errorMessage);
      return this.createResult(state, metrics, false);
    } finally {
      // Always ensure queue access is ended (only if we started it)
      if (queueAccessStarted) {
        await this.cleanupQueueAccess(queueNumber, state);
      }
    }
  }

  /**
   * Process remaining queue items
   */
  private async processRemainingItems(
    queueNumber: number,
    state: QueueState,
    metrics: QueueMetrics,
    processCallback: ProcessCallback | null | undefined,
    config: typeof QueueProcessConfig,
  ): Promise<void> {
    const maxIterations = Math.min(config.MAX_ITERATIONS, state.totalItems);

    // Start from position 2 (first item already processed)
    for (let position = 2; position <= maxIterations; position++) {
      // Check if we should stop
      if (state.isEnded) {
        console.log(
          `[QUEUE ${queueNumber}] Processing ended at position ${position - 1}`,
        );
        break;
      }

      // Check consecutive failures
      if (state.shouldStopDueToFailures(config.MAX_CONSECUTIVE_FAILURES)) {
        console.error(
          `[QUEUE ${queueNumber}] Stopping due to ${config.MAX_CONSECUTIVE_FAILURES} ` +
            `consecutive failures at position ${position}`,
        );
        throw new Error(
          `Too many consecutive failures (${config.MAX_CONSECUTIVE_FAILURES})`,
        );
      }

      // Log progress
      if (position % config.PROGRESS_LOG_INTERVAL === 0) {
        metrics.logProgress(position);
      }

      try {
        // Navigate to next item with retry logic
        const response = await this.navigateToNext(
          queueNumber,
          state,
          metrics,
          config,
        );

        // Check for end of queue
        if (!response || !this.hasQueueItem(response)) {
          console.log(
            `[QUEUE ${queueNumber}] Reached end of queue at position ${position}`,
          );
          state.end();
          break;
        }

        // Process the item
        await this.processItem(
          response,
          state,
          metrics,
          processCallback,
          config,
        );
      } catch (error) {
        const classified = ErrorClassifier.classify(
          undefined,
          error instanceof Error ? error : new Error(String(error)),
        );

        if (classified.type === ErrorType.END_OF_QUEUE) {
          console.log(`[QUEUE ${queueNumber}] End of queue reached`);
          state.end();
          break;
        }

        if (classified.type === ErrorType.FATAL) {
          throw error;
        }

        // Record failure and continue
        metrics.recordFailure(
          position,
          error instanceof Error ? error : new Error(String(error)),
        );
        state.recordFailure();
        console.error(
          `[QUEUE ${queueNumber}] Error at position ${position}:`,
          classified.message,
        );
      }
    }
  }

  /**
   * Navigate to next queue item with retry logic
   */
  private async navigateToNext(
    queueNumber: number,
    state: QueueState,
    metrics: QueueMetrics,
    config: typeof QueueProcessConfig,
  ): Promise<QueueResponse | null> {
    const context = `Queue ${queueNumber} - Navigate to position ${state.currentPosition + 1}`;

    return await this.resilienceExecutor.execute(
      async (_attempt: number) => {
        const navRequest = this.buildNavigationRequest(QueueAction.NEXT);
        const response = await this.sendQueueRequest(
          "OTA_QueueAccessRQ",
          "QueueAccessLLSRQ",
          navRequest,
        );

        // Classify any errors in response
        const classified = ErrorClassifier.classify(response);

        if (classified.type === ErrorType.END_OF_QUEUE) {
          return null; // Signal end of queue
        }

        // Check if we should retry for other error types
        if (classified.shouldRetry) {
          throw new Error(classified.message);
        }

        if (!this.hasQueueItem(response)) {
          // This might be end of queue or an error
          const isEndOfQueue = this.isEndOfQueue(response);
          if (isEndOfQueue) {
            return null;
          }
          throw new Error("No queue item in response");
        }

        return response;
      },
      {
        context,
        shouldRetry: (error: Error, attempt: number) => {
          const classified = ErrorClassifier.classify(undefined, error);
          return classified.shouldRetry && attempt < config.MAX_RETRIES;
        },
        onRetry: () => metrics.recordRetry(),
      },
    );
  }

  /**
   * Process a single queue item
   */
  private async processItem(
    response: QueueResponse,
    state: QueueState,
    metrics: QueueMetrics,
    processCallback: ProcessCallback | null | undefined,
    _config: typeof QueueProcessConfig,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      if (!processCallback || typeof processCallback !== "function") {
        // No callback provided, just count it as processed
        state.advance();
        metrics.recordSuccess(Date.now() - startTime);
        return;
      }

      // Call the callback with progress info
      const callbackResult = await processCallback(
        response,
        state.getProgress(),
      );

      // Handle callback control signals
      if (callbackResult?.action === CallbackAction.STOP) {
        console.log(
          `[QUEUE ${state.queueNumber}] Stopped by callback at position ${state.currentPosition}`,
        );
        state.end();
        return;
      }

      if (callbackResult?.action === CallbackAction.SKIP) {
        metrics.recordSkip(callbackResult.reason || "Skipped by callback");
        state.advance();
        return;
      }

      // Success
      state.advance();
      metrics.recordSuccess(Date.now() - startTime);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[QUEUE ${state.queueNumber}] Error processing item at position ${state.currentPosition}:`,
        errorMessage,
      );
      throw error;
    }
  }

  /**
   * Get queue data (count and details)
   */
  private async getQueueData(
    queueNumber: number,
  ): Promise<QueueData | undefined> {
    try {
      const queueCount = await this.client.getQueueCount(queueNumber);
      const queueData = queueCount.queues.find(
        (q: QueueData) => q.queueNumber === String(queueNumber),
      );
      return queueData;
    } catch (error) {
      console.warn(
        `[QUEUE ${queueNumber}] Could not fetch queue count:`,
        error,
      );
      // Return undefined to allow processing without count
      return undefined;
    }
  }

  /**
   * Access queue initially
   */
  private async accessQueue(queueNumber: number): Promise<QueueResponse> {
    const accessRequest = this.buildQueueAccessRequest(queueNumber);
    console.log(`[QUEUE ${queueNumber}] Building access request`);

    const response = await this.sendQueueRequest(
      "OTA_QueueAccessRQ",
      "QueueAccessLLSRQ",
      accessRequest,
    );

    return response;
  }

  /**
   * Clean up queue access
   */
  private async cleanupQueueAccess(
    queueNumber: number,
    state: QueueState,
  ): Promise<void> {
    // Only cleanup if queue was actually started
    if (!state.isActive) {
      console.log(
        `[QUEUE ${queueNumber}] Queue was never started, skipping cleanup`,
      );
      return;
    }

    if (state.isEnded) {
      console.log(
        `[QUEUE ${queueNumber}] Queue already ended, skipping cleanup`,
      );
      return;
    }

    try {
      console.log(`[QUEUE ${queueNumber}] Ending queue access`);
      const endRequest = this.buildNavigationRequest(QueueAction.END);
      await this.sendQueueRequest(
        "OTA_QueueAccessRQ",
        "QueueAccessLLSRQ",
        endRequest,
      );
      state.end();
      console.log(`[QUEUE ${queueNumber}] Successfully ended queue access`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[QUEUE ${queueNumber}] Error ending queue access:`,
        errorMessage,
      );
      // Don't throw - this is best effort cleanup
    }
  }

  /**
   * Check if response has a queue item
   */
  private hasQueueItem(response: QueueResponse): boolean {
    return this.client.hasQueueItem(response);
  }

  /**
   * Check if response indicates end of queue
   */
  private isEndOfQueue(response: QueueResponse): boolean {
    try {
      const appResults = response?.Envelope?.Body?.QueueAccessRS
        ?.ApplicationResults as any;

      if (appResults?.$?.status === "Error") {
        const errors = appResults.Error || [];
        const errorMessages = Array.isArray(errors)
          ? errors.map((e: any) => e._ || e.$?.Message || "").join("; ")
          : errors._ || errors.$?.Message || "";

        return (
          errorMessages.includes("NO MORE QUEUE ITEMS") ||
          errorMessages.includes("END OF QUEUE") ||
          errorMessages.includes("QUEUE EMPTY")
        );
      }

      return false;
    } catch (error) {
      console.warn("Error checking for end of queue:", error);
      return false;
    }
  }

  /**
   * Build queue access request
   */
  private buildQueueAccessRequest(queueNumber: number): string {
    return this.client.buildQueueAccessRequest(queueNumber);
  }

  /**
   * Build navigation request
   */
  private buildNavigationRequest(action: string): string {
    return this.client.buildNavigationRequest(action);
  }

  /**
   * Send queue request
   */
  private async sendQueueRequest(
    requestType: string,
    elementName: string,
    request: string,
  ): Promise<QueueResponse> {
    return await this.client.sendQueueRequest(
      requestType,
      elementName,
      request,
    );
  }

  /**
   * Create result object
   */
  private createResult(
    state: QueueState,
    metrics: QueueMetrics,
    success: boolean,
  ): QueueProcessingResult {
    const summary = metrics.getSummary();

    return {
      success: success && metrics.itemsFailed === 0,
      queueNumber: state.queueNumber,
      expectedItems: state.totalItems,
      processedItems: metrics.itemsProcessed,
      skippedItems: metrics.itemsSkipped,
      failedItems: metrics.itemsFailed,
      totalRetries: metrics.totalRetries,
      endedNaturally: state.isEnded,
      duration: summary.duration,
      successRate: summary.successRate,
      averageProcessingTime: summary.averageProcessingTime,
      rate: summary.rate,
      errors: summary.errors,
      warnings: summary.warnings,
      finalPosition: state.currentPosition,
      circuitBreakerState: this.resilienceExecutor.getState(),
    };
  }

  /**
   * Create empty result for empty queue
   */
  private createEmptyResult(queueNumber: number): QueueProcessingResult {
    return {
      success: true,
      queueNumber,
      expectedItems: 0,
      processedItems: 0,
      skippedItems: 0,
      failedItems: 0,
      totalRetries: 0,
      endedNaturally: true,
      duration: "0s",
      successRate: "100%",
      averageProcessingTime: "0ms",
      rate: "0/s",
      errors: [],
      warnings: [],
      finalPosition: 0,
    };
  }

  /**
   * Log processing summary
   */
  private logSummary(metrics: QueueMetrics): void {
    const summary = metrics.getSummary();
    console.log("\n" + "=".repeat(80));
    console.log(`QUEUE ${summary.queueNumber} PROCESSING SUMMARY`);
    console.log("=".repeat(80));
    console.log(`Expected Items:     ${summary.expectedItems}`);
    console.log(`Processed Items:    ${summary.processedItems}`);
    console.log(`Skipped Items:      ${summary.skippedItems}`);
    console.log(`Failed Items:       ${summary.failedItems}`);
    console.log(`Success Rate:       ${summary.successRate}`);
    console.log(`Total Retries:      ${summary.totalRetries}`);
    console.log(`Duration:           ${summary.duration}`);
    console.log(`Avg Processing:     ${summary.averageProcessingTime}`);
    console.log(`Processing Rate:    ${summary.rate}`);

    if (summary.errors.length > 0) {
      console.log("\nERRORS:");
      summary.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. Item ${err.itemNumber}: ${err.error}`);
      });
    }

    if (summary.warnings.length > 0) {
      console.log("\nWARNINGS:");
      summary.warnings.forEach((warn, idx) => {
        console.log(`  ${idx + 1}. ${warn.type}: ${warn.reason}`);
      });
    }

    console.log("=".repeat(80) + "\n");
  }
}
