import { SabreQueueClientAdapter } from "../adapters/sabreQueueClient.adapter";
import { CallbackAction } from "../../../constants/QueueConstant";
import { QueueProcessor } from "../processer/queueProcesser";
import { SabreQueueService } from "../queueCount.service";
import { PnrDetailsService } from "../pnr/pnrDetails.service";
import { sabreSessionPool } from "../../../sessionManagement/sabreSessionPool";
import { PlaceQueueService } from "../placeToQueue.service";
import { ConfigManager } from "../../../config/config.manager";

const pnrBuffer: string[] = [];
const BATCH_SIZE = 10;
let currentSourceQueue: string | null = null;
/**
 * Main worker function to process Sabre queues
 */
export async function runSabreQueueWorker() {
  const sabreQueueService = await SabreQueueService.getInstance();
  const queueClient = new SabreQueueClientAdapter(sabreQueueService);
  const processor = new QueueProcessor(queueClient);
  const config = ConfigManager.getInstance().queue;

  const extractPNR = (response: any): string | null => {
    return (
      response?.QueueAccessRS?.Line?.UniqueID?.$?.ID ||
      response?.Envelope?.Body?.QueueAccessRS?.Line?.UniqueID?.$?.ID ||
      null
    );
  };

  const callback = async (response: any, progress: any) => {
    const pnr = extractPNR(response);

    console.log(`[QUEUE] ${progress.current}/${progress.total} → ${pnr}`);

    if (!pnr) {
      return {
        action: CallbackAction.SKIP,
        reason: "Missing PNR",
      };
    }

    await processPNR(pnr);
    return { action: CallbackAction.CONTINUE };
  };

  try {
    // Get source queues from config (guaranteed to be an array, but may be empty)
    const sourceQueues: string[] = config.sourceQueue || [];

    if (sourceQueues.length === 0) {
      console.warn("[QUEUE WORKER] No source queues configured");
      return;
    }

    console.log(
      `[QUEUE WORKER] Processing ${sourceQueues.length} source queue(s):`,
      sourceQueues,
    );

    // Process each source queue
    for (const queueNumber of sourceQueues) {
      console.log(`[QUEUE WORKER] Starting queue: ${queueNumber}`);

      // Set current source queue for flush buffer to use
      currentSourceQueue = queueNumber;

      try {
        await processor.processQueueWithCount(Number(queueNumber), callback);
        console.log(`[QUEUE WORKER] Completed queue: ${queueNumber}`);
      } catch (queueError) {
        console.error(
          `[QUEUE WORKER] Error processing queue ${queueNumber}:`,
          queueError,
        );
        // Continue with next queue instead of failing completely
      }

      // Flush any remaining PNRs from this queue before moving to next
      await flushBuffer();
    }

    // Final flush (in case there are any remaining)
    await flushBuffer();

    console.log("[QUEUE WORKER] All queues processed successfully");
  } catch (error) {
    console.error("[QUEUE WORKER] Fatal error:", error);
    // Attempt to flush buffer even on error
    try {
      await flushBuffer();
    } catch (flushError) {
      console.error(
        "[QUEUE WORKER] Failed to flush buffer on error:",
        flushError,
      );
    }
    throw error;
  } finally {
    // Reset current source queue
    currentSourceQueue = null;
  }
}

/**
 * Add PNR to buffer and flush if batch size reached
 */
async function processPNR(pnr: string): Promise<void> {
  pnrBuffer.push(pnr);

  if (pnrBuffer.length >= BATCH_SIZE) {
    await flushBuffer();
  }
}

/**
 * Process all PNRs in buffer
 */
async function flushBuffer(): Promise<void> {
  if (pnrBuffer.length === 0) return;

  const batch = pnrBuffer.splice(0, BATCH_SIZE);
  const sourceQueue = currentSourceQueue;

  if (!sourceQueue) {
    console.warn("[FLUSH] No source queue set, skipping batch");
    return;
  }

  console.log(
    `[FLUSH] Processing batch of ${batch.length} PNRs from queue ${sourceQueue}:`,
    batch,
  );
  console.log("[FLUSH] Pool stats before:", sabreSessionPool.getStats());

  try {
    // Step 1: Fetch PNR details concurrently
    const fetchResults = await Promise.allSettled(
      batch.map(async (pnr) => {
        const pnrService = PnrDetailsService.getInstance();
        return await pnrService.getPnrDetails(pnr, String(currentSourceQueue));
      }),
    );

    // Step 2: Separate successful and failed PNRs
    const successfulPNRs: string[] = [];
    const failedPNRs: string[] = [];

    fetchResults.forEach((result, index) => {
      const pnr = batch[index];

      if (result.status === "fulfilled") {
        console.log(`✅ PNR ${pnr} fetched successfully`);
        successfulPNRs.push(pnr);
      } else {
        console.error(`❌ PNR ${pnr} fetch failed:`, result.reason);
        failedPNRs.push(pnr);
      }
    });

    // Step 3: Move successful PNRs to target queue
    if (successfulPNRs.length > 0) {
      const queueService = new PlaceQueueService();
      const queueResults = await queueService.batchMoveToQueue(
        sourceQueue, // Pass the source queue as first parameter
        successfulPNRs,
        undefined, // No target queue override - use default
        5, // Concurrency
      );

      console.log(`[TARGET QUEUE] Operations complete:`, {
        total: queueResults.length,
        succeeded: queueResults.filter((r) => r.success).length,
        failed: queueResults.filter((r) => !r.success).length,
      });

      // Log any failures
      const failedMoves = queueResults.filter((r) => !r.success);
      if (failedMoves.length > 0) {
        console.error(
          `[TARGET QUEUE] Failed to move ${failedMoves.length} PNRs:`,
          failedMoves,
        );
      }
    }

    // Step 4: Move failed PNRs to error queue
    if (failedPNRs.length > 0) {
      const queueService = new PlaceQueueService();
      const errorQueueResults = await queueService.batchMoveToErrorQueue(
        failedPNRs,
        "PNR fetch failed during processing",
        5, // Concurrency
      );

      console.log(`[ERROR QUEUE] Operations complete:`, {
        total: errorQueueResults.length,
        succeeded: errorQueueResults.filter((r) => r.success).length,
        failed: errorQueueResults.filter((r) => !r.success).length,
      });

      // Log any failures moving to error queue
      const failedErrorMoves = errorQueueResults.filter((r) => !r.success);
      if (failedErrorMoves.length > 0) {
        console.error(
          `[ERROR QUEUE] Failed to move ${failedErrorMoves.length} PNRs:`,
          failedErrorMoves,
        );
      }
    }

    console.log("[FLUSH] Pool stats after:", sabreSessionPool.getStats());
  } catch (error) {
    console.error("[FLUSH] Critical error during batch processing:", error);
    throw error;
  }
}
