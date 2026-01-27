import { buildNavigationRequest } from "../../connectors/Envelopes/otherEnvelopes";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "../profile/profilesBase.service";
import { sabreSessionPool } from "../sabreSessionPool";
import { SabreSessionService } from "../sabreSessionService.service";

export interface BatchQueueResult {
  recordLocator: string;
  success: boolean;
  error?: string;
}

export class PlaceQueueService extends ProfilesBaseService {
  private readonly QUEUE_PLACE_SERVICE = "OTA_QueuePlaceLLSRQ";
  private readonly QUEUE_PLACE_ACTION = "QueuePlaceLLSRQ";
  private readonly QUEUE_ACCESS_SERVICE = "OTA_QueueAccessRQ";
  private readonly QUEUE_ACCESS_ACTION = "QueueAccessLLSRQ";

  constructor() {
    super();
  }

  // ==========================================================
  // MAIN ENTRY — PLACE + REMOVE
  // ==========================================================
  public async moveQueueItem(
    recordLocator: string,
    prefatoryInstructionCode: string = "11",
  ): Promise<void> {
    let sessionToken: string | null = null;
    let pooledSessionService: SabreSessionService | null = null;

    try {
      const session = await sabreSessionPool.acquireSession();
      sessionToken = session.token;
      pooledSessionService = session.service;

      const { sourceQueue, targetQueue, removeFromSource } = this.queueConfig;

      logger.info(`[QUEUE MOVE] ${recordLocator} → ${targetQueue}`);

      // STEP 1 — Place on target queue
      await this.placeOnQueueViaAPI(
        recordLocator,
        targetQueue,
        prefatoryInstructionCode,
        pooledSessionService,
      );

      // STEP 2 — Remove from source queue
      if (sourceQueue && removeFromSource) {
        await this.removeFromQueue(
          sourceQueue,
          recordLocator,
          pooledSessionService,
        );
      }

      logger.info(`[QUEUE MOVE] ✅ ${recordLocator} successfully moved`);
    } catch (error: any) {
      logger.error(
        `[QUEUE MOVE] ❌ Failed to move ${recordLocator}: ${error.message}`,
      );
      throw error;
    } finally {
      if (sessionToken) {
        sabreSessionPool.releaseSession(sessionToken);
      }
    }
  }

  // ==========================================================
  // PLACE ON QUEUE — STATELESS API
  // ==========================================================
  private async placeOnQueueViaAPI(
    recordLocator: string,
    queueNumber: string,
    prefatoryInstructionCode: string,
    pooledSessionService?: SabreSessionService | null,
  ): Promise<void> {
    const sessionToken = pooledSessionService
      ? await pooledSessionService.getAccessToken()
      : await this.sessionService.getAccessToken();

    const requestBody = `
      <QueuePlaceRQ 
        xmlns="http://webservices.sabre.com/sabreXML/2011/10"
        Version="2.0.4">
        <QueueInfo>
          <QueueIdentifier 
            Number="${queueNumber}" 
            PrefatoryInstructionCode="${prefatoryInstructionCode}" 
            PseudoCityCode="${this.sabreConfig.pcc}"/>
          <UniqueID ID="${recordLocator}"/>
        </QueueInfo>
      </QueuePlaceRQ>`;

    const response: any = await this.soapExecutor.execute(
      {
        service: this.QUEUE_PLACE_SERVICE,
        action: this.QUEUE_PLACE_ACTION,
        body: requestBody,
        sessionToken,
      },
      "QueuePlaceRS",
    );

    const status = response?.["stl:ApplicationResults"]?.$?.status;

    if (status !== "Complete") {
      const errorText =
        response?.["stl:ApplicationResults"]?.Error?.SystemSpecificResults
          ?.Message?.[0]?._ || "Queue placement failed";
      throw new Error(errorText);
    }
  }

  // ==========================================================
  // QUEUE REMOVE — FULLY SAFE HOST TRANSACTION HANDLING
  // ==========================================================
  public async removeFromQueue(
    queueNumber: string,
    recordLocator: string,
    pooledSessionService?: SabreSessionService | null,
  ): Promise<void> {
    const sessionToken = pooledSessionService
      ? await pooledSessionService.getAccessToken()
      : await this.sessionService.getAccessToken();

    logger.info(
      `[QUEUE REMOVE] Searching ${recordLocator} in queue ${queueNumber}`,
    );

    const MAX_ITERATIONS = 300;
    let iteration = 0;

    try {
      // START QUEUE SESSION
      const startQueueRequest = `
        <QueueAccessRQ 
          xmlns="http://webservices.sabre.com/sabreXML/2011/10"
          Version="2.0.3">
          <QueueIdentifier 
            Number="${queueNumber}" 
            PseudoCityCode="${this.sabreConfig.pcc}"/>
        </QueueAccessRQ>`;

      let response: any = await this.soapExecutor.execute({
        service: this.QUEUE_ACCESS_SERVICE,
        action: this.QUEUE_ACCESS_ACTION,
        body: startQueueRequest,
        sessionToken,
      });

      while (iteration++ < MAX_ITERATIONS) {
        const line = response?.QueueAccessRS?.Line;
        const currentPNR =
          line?.UniqueID?.$?.ID || line?.UniqueID?.ID || line?.$?.RecordLocator;

        if (!line || !currentPNR) {
          logger.info(
            `[QUEUE REMOVE] Queue exhausted — ${recordLocator} not found`,
          );
          return;
        }

        logger.debug(`[QUEUE REMOVE] Iteration ${iteration}: ${currentPNR}`);

        if (currentPNR.toUpperCase() === recordLocator.toUpperCase()) {
          logger.info(`[QUEUE REMOVE] Match found → Removing ${recordLocator}`);

          const removeRequest = buildNavigationRequest("QR");

          const removeResponse: any = await this.soapExecutor.execute({
            service: this.QUEUE_ACCESS_SERVICE,
            action: this.QUEUE_ACCESS_ACTION,
            body: removeRequest,
            sessionToken,
          });

          const status =
            removeResponse?.QueueAccessRS?.["stl:ApplicationResults"]?.$
              ?.status;

          if (status !== "Complete") {
            const errorText =
              removeResponse?.QueueAccessRS?.["stl:ApplicationResults"]?.Error
                ?.SystemSpecificResults?.Message?.[0]?._ ||
              "Sabre rejected QR remove command";
            throw new Error(errorText);
          }

          logger.info(
            `[QUEUE REMOVE] ✅ ${recordLocator} removed successfully`,
          );
          return;
        }

        // MOVE NEXT
        const nextRequest = buildNavigationRequest("I");

        response = await this.soapExecutor.execute({
          service: this.QUEUE_ACCESS_SERVICE,
          action: this.QUEUE_ACCESS_ACTION,
          body: nextRequest,
          sessionToken,
        });
      }

      logger.warn(
        `[QUEUE REMOVE] Safety stop — ${recordLocator} not found after ${MAX_ITERATIONS} scans`,
      );
    } catch (error: any) {
      logger.error(`[QUEUE REMOVE] Error: ${error.message}`);
      throw error;
    } finally {
      // ALWAYS EXIT QUEUE SESSION — CRITICAL
      await this.exitQueue(sessionToken);
    }
  }

  // ==========================================================
  // EXIT QUEUE — PREVENTS FIN OR IG
  // ==========================================================
  private async exitQueue(sessionToken: string): Promise<void> {
    try {
      const exitRequest = buildNavigationRequest("QXI");

      await this.soapExecutor.execute({
        service: "SabreCommandLLSRQ",
        action: "SabreCommandLLSRQ",
        body: exitRequest,
        sessionToken,
      });

      logger.debug("[QUEUE EXIT] QXI sent successfully");
    } catch (error) {
      logger.warn("[QUEUE EXIT] QXI failed, sending IG");

      try {
        const igRequest = buildNavigationRequest("IG");

        await this.soapExecutor.execute({
          service: "SabreCommandLLSRQ",
          action: "SabreCommandLLSRQ",
          body: igRequest,
          sessionToken,
        });
      } catch {
        logger.error("[QUEUE EXIT] IG also failed — session may reset");
      }
    }
  }

  // ==========================================================
  // BATCH MOVE
  // ==========================================================
  public async batchMoveToQueue(
    recordLocators: string[],
    concurrency: number = 1,
  ): Promise<BatchQueueResult[]> {
    const results: BatchQueueResult[] = [];
    const chunks = this.chunkArray(recordLocators, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((pnr) => this.moveQueueItem(pnr)),
      );

      for (let i = 0; i < chunkResults.length; i++) {
        const recordLocator = chunk[i];
        const result = chunkResults[i];

        if (result.status === "fulfilled") {
          results.push({ recordLocator, success: true });
        } else {
          results.push({
            recordLocator,
            success: false,
            error: result.reason?.message || "Unknown error",
          });
        }
      }
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
