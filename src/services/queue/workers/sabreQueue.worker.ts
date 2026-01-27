import { SabreQueueClientAdapter } from "../adapters/sabreQueueClient.adapter";
import { CallbackAction } from "../../../constants/QueueConstant";
import { QueueProcessor } from "../processer/queueProcesser";
import { SabreQueueService } from "../queueCount.service";
import { PnrDetailsService } from "../pnr/pnrDetails.service";
import { sabreSessionPool } from "../../sabreSessionPool";
import { PlaceQueueService } from "../placeToQueue.service";

export async function runSabreQueueWorker(queueNumbers?: number[]) {
  const sabreQueueService = await SabreQueueService.getInstance();
  const queueClient = new SabreQueueClientAdapter(sabreQueueService);
  const processor = new QueueProcessor(queueClient);

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

  // If queueNumbers passed → process only those
  if (queueNumbers?.length) {
    for (const q of queueNumbers) {
      await processor.processQueueWithCount(q, callback);
    }
    return;
  }

  // Otherwise process all active queues
  const activeQueues = await sabreQueueService.getActiveQueues();
  console.log("activeQueues", activeQueues);

  for (const _q of ["490"]) {
    await processor.processQueueWithCount(Number(491), callback);
  }
}
const pnrBuffer: string[] = [];
const BATCH_SIZE = 1;

async function processPNR(pnr: string) {
  pnrBuffer.push(pnr);

  if (pnrBuffer.length >= BATCH_SIZE) {
    const batch = pnrBuffer.splice(0, BATCH_SIZE);

    console.log("Processing batch:", batch);
    console.log("Pool stats before:", sabreSessionPool.getStats());

    // Step 1: Fetch PNR details concurrently
    const fetchResults = await Promise.allSettled(
      batch.map(async (p) => {
        const pnrService = PnrDetailsService.getInstance();
        return await pnrService.getPnrDetails(p);
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
      const queueResults = await queueService.batchMoveToQueue(successfulPNRs);

      console.log(`Queue operations complete:`, {
        total: queueResults.length,
        succeeded: queueResults.filter((r) => r.success).length,
        failed: queueResults.filter((r) => !r.success).length,
      });
    }

    // Step 4: Move failed PNRs to error queue
    if (failedPNRs.length > 0) {
      //  const queueService = new PlaceQueueService();
      //   await queueService.batchMoveToQueue(
      //     failedPNRs,
      //     "PNR fetch failed during processing",
      //   );
    }

    console.log("Pool stats after:", sabreSessionPool.getStats());
  }
}
