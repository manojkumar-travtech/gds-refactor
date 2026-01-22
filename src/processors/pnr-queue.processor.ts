import { ConfigManager } from "../config/config.manager";
import { query } from "../config/database";
import {
  sendQueueRequest,
  SendQueueRequestOptions,
} from "../connectors/Envelopes/buildSoapEnvelope";
import { buildQueueAccessRequest } from "../connectors/Envelopes/otherEnvelopes";
import { PnrDetailsService } from "../services/pnrDetails.service";
import { SabreQueueService } from "../services/queue/queueCount.service";
import { SabreSessionService } from "../services/sabreSessionService.service";
import logger from "../utils/logger";

interface PlaceQueueInterface {
  prefatoryInstructionCode?: string;
  pseudoCityCode?: string;
  removeFromSource?: boolean;
}

export class PNRQueueProcessor {
  private readonly queueConfig: ConfigManager["queue"];
  private readonly sabreConfig: ConfigManager["sabre"];
  private readonly sessionService = SabreSessionService.getInstance();
  private readonly pnrDetailsService = PnrDetailsService.getInstance();

  private sabreQueueService!: SabreQueueService;

  private isProcessing: boolean = false;
  private currentBatch: any[] = [];

  constructor(config: ConfigManager = ConfigManager.getInstance()) {
    this.queueConfig = config.queue;
    this.sabreConfig = config.sabre;
  }

  public async processQueue() {
    if (this.isProcessing) {
      logger.info("Queue processing is already in progress");
      return { processed: 0, errors: 0, total: 0 };
    }

    this.isProcessing = true;
    let retryCount = 0;
    const { maxRetries } = this.queueConfig;
    let result = { processed: 0, errors: 0, total: 0 };

    if (!this.queueConfig.sourceQueue) {
      const queueInfo = await this.getAllQueues();
      const nonEmptyQueues = queueInfo.filter((q) => q.count > 0);

      if (nonEmptyQueues.length === 0) {
        logger.info("No non-empty queues found to process");
        return { processed: 0, errors: 0, total: 0 };
      }

      logger.info(`Found ${nonEmptyQueues.length} non-empty queues to process`);

      for (const queue of nonEmptyQueues) {
      }
    }
    try {
    } catch (error) {
      this.cleanup();
    }
  }

  private async processSinglePNR() {}

  private transformPNRData(rawPNR: any) {
    return {
      ...rawPNR,
      processedAt: new Date().toISOString(),
    };
  }

  private async queueToDatapump(pnrData:any,) {

  }
  private async placeToQueue(
    recordLocator: string,
    prefatoryInstructionCode: string,
  ) {
    const { sourceQueue, targetQueue, removeFromSource } = this.queueConfig;
    const { pcc, endpoint, organization } = this.sabreConfig;

    try {
      if (removeFromSource && sourceQueue) {
        try {
          const accessRequest = buildQueueAccessRequest(pcc, sourceQueue);
          const sessionToken = await this.sessionService.getAccessToken();
          const reqObj: SendQueueRequestOptions = {
            action: "",
            body: accessRequest,
            endpoint: endpoint,
            organization: organization,
            service: "",
            sessionToken: sessionToken,
          };
          await sendQueueRequest(reqObj);
        } catch (accessError: any) {
          logger.error(
            `[placeToQueue][${recordLocator}] Error accessing source queue ${sourceQueue}:`,
            accessError,
          );
          throw new Error(
            `Failed to access source queue: ${accessError.message}`,
          );
        }
      }
    } catch (error) {}
  }
  private async processAllQueues() {
    const { targetQueue } = this.queueConfig;
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };
    try {
      const queues = await this.getAllQueues();
      logger.info(`Found ${queues.length} queues with PNRs`);
      logger.info("Queue details:", JSON.stringify(queues, null, 2));

      for (const queue of queues) {
        const queueNumber = queue.queueNumber;
        const queueCount = queue.count || 0;

        if (Number(queueCount) === 0) {
          logger.info(`Skipping empty queue ${queueNumber}`);
          results.skipped++;
          results.details.push({
            queue: queueNumber,
            status: "skipped",
            reason: "empty_queue",
          });
          continue;
        }
      }
    } catch (error) {}
  }

  private async getAllQueues() {
    try {
      const queueService = await this.getQueueService();
      const queueInfo = await queueService.getQueueCount();
      return queueInfo.queues || [];
    } catch (error) {
      logger.error("Error fetching queues:", error);
      throw error;
    }
  }
  private async logPnrError(recordLocator: string, error: any) {
    try {
      const executeQuery = `
                  INSERT INTO bookings.pnr_processing_errors 
                  (record_locator, error_message, error_stack, created_at)
                  VALUES ($1, $2, $3, NOW())
                  ON CONFLICT (record_locator) 
                  DO UPDATE SET 
                      error_message = EXCLUDED.error_message,
                      error_stack = EXCLUDED.error_stack,
                      updated_at = NOW()
              `;
      await query(executeQuery, [
        recordLocator,
        error.message || "Unknown error",
        error.stack || "",
      ]);
    } catch (error) {
      logger.error("Failed to insert pnr error record:", error);
    }
  }

  private async retrievePNRDetails(pnrNumber: string) {
    if (!pnrNumber) {
      throw new Error("PNR Number is required");
    }
    logger.info(`Retrieving details for PNR: ${pnrNumber}`);
    const pnrDetails = await this.pnrDetailsService.getPnrDetails(pnrNumber);
    if (!pnrDetails) {
      throw new Error(`No details found for PNR: ${pnrNumber}`);
    }
    logger.info(`Successfully retrieved details for PNR: ${pnrNumber}`);
    return pnrDetails;
    try {
    } catch (error) {
      logger.error(`Error retrieving PNR ${pnrNumber}:`, error);
      throw error;
    }
  }

  private async getQueueService(): Promise<SabreQueueService> {
    if (!this.sabreQueueService) {
      this.sabreQueueService = await SabreQueueService.getInstance();
    }
    return this.sabreQueueService;
  }

  private async cleanup() {
    try {
      if (this.sessionService) {
        await this.sessionService.logout();
        console.log("PNRQueueProcessor session closed");
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
    } finally {
      this.isProcessing = false;
      this.currentBatch = [];
    }
  }
}
