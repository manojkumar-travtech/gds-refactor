import logger from "../../utils/logger";
import { PnrDetailsService } from "../pnrDetails.service";
import { PlaceQueueService } from "./placeToQueue.service";
import { SabreQueueService } from "./queueCount.service";

export class ProcessQueueService extends PlaceQueueService {
  private readonly pnrDetailsService = PnrDetailsService.getInstance();
  private isProcessing: boolean = false;
  private currentBatch: any = [];
  private processedPNRs = new Set();
  private sabreQueueService!: SabreQueueService;

  constructor() {
    super();
  }

  async processQueue() {
    if (this.isProcessing) {
      logger.info("Queue processing is already in progress");
      return { processed: 0, errors: 0, total: 0 };
    }
    this.isProcessing = true;
    let retryCount = 0;
    const { maxRetries } = this.queueConfig;
    let result = { processed: 0, errors: 0, total: 0 };
    if (!this.queueConfig.sourceQueue) {
    }
    let hasMorePNRs = true;
    while (hasMorePNRs && retryCount < maxRetries) {
      try {
        logger.info(`Fetching queue ${this.queueConfig.sourceQueue}...`);
        const queueInfo = await this.getAllQueues();
        const queue = queueInfo.find(
          (q) => q.queueNumber === this.queueConfig.sourceQueue,
        );
        if (!queue) {
          throw new Error(`Queue ${this.queueConfig.sourceQueue} not found`);
        }
        if (queue.count === 0) {
          logger.info(`Queue ${queue.queueNumber} is empty`);
          return { processed: 0, errors: 0, total: 0 };
        }
      } catch (error) {}
    }
  }

  async removeProcessedPNRsFromQueue() {
    if (!this.currentBatch || this.currentBatch.length === 0) {
      return;
    }
    try {
      logger.info(
        `Removing ${this.currentBatch.length} processed PNRs from queue ${this.queueConfig.sourceQueue}...`,
      );
      for (const pnr of this.currentBatch) {
        if (this.processedPNRs.has(pnr.recordLocator)) {
          await this.removeFromQueue(
            this.queueConfig.sourceQueue,
            pnr.recordLocator,
          );
        }
      }
    } catch (error) {
      logger.error("Error removing PNRs from queue:", error);
      throw error;
    }
  }

  private async getQueueService(): Promise<SabreQueueService> {
    if (!this.sabreQueueService) {
      this.sabreQueueService = await SabreQueueService.getInstance();
    }
    return this.sabreQueueService;
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

  private async exponentialBackoff(attempt: number) {
  const delay = 1000 * Math.pow(2, attempt);
  console.log(`Retrying after ${delay}ms...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

}
