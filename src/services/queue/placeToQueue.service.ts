import {
  buildNavigationRequest,
  buildQueueAccessRequest,
} from "../../connectors/Envelopes/otherEnvelopes";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "../profile/profilesBase.service";

export interface QueuePlaceResponse {
  QueuePlaceRS?: {
    $?: {
      status?: string;
    };
    Text?: string | string[];
  };
}

export interface QueueAccessResponse {
  QueueAccessRS?: {
    $?: {
      status?: string;
    };
  };
}

export class PlaceQueueService extends ProfilesBaseService {
  private readonly QUEUE_PLACE_SERVICE = "OTA_QueuePlaceLLSRQ";
  private readonly QUEUE_PLACE_ACTION = "QueuePlaceLLSRQ";
  private readonly QUEUE_ACCESS_SERVICE = "OTA_QueueAccessRQ";
  private readonly QUEUE_ACCESS_ACTION = "QueueAccessLLSRQ";

  constructor() {
    super();
  }

  /**
   * Places a PNR into the target queue and optionally removes it from the source queue
   * @param recordLocator - The PNR record locator
   * @param prefatoryInstructionCode - Queue instruction code (default: "11")
   */
  public async placeToQueue(
    recordLocator: string,
    prefatoryInstructionCode: string = "11",
  ): Promise<void> {
    const { sourceQueue, targetQueue, removeFromSource } = this.queueConfig;

    try {
      // Step 1: Place PNR in target queue
      logger.info(
        `[placeToQueue][${recordLocator}] Placing in queue ${targetQueue}...`,
      );

      const response = await this.sendQueuePlaceRequest(
        recordLocator,
        prefatoryInstructionCode,
      );

      logger.info(
        `[placeToQueue][${recordLocator}] Successfully placed in queue ${targetQueue}`,
        { response: JSON.stringify(response) },
      );

      // Step 2: Remove from source queue if needed
      if (removeFromSource && sourceQueue) {
        logger.info(
          `[placeToQueue][${recordLocator}] Removing from source queue ${sourceQueue}...`,
        );

        try {
          await this.removeFromQueue(sourceQueue, recordLocator);
          logger.info(
            `[placeToQueue][${recordLocator}] Successfully removed from source queue ${sourceQueue}`,
          );
        } catch (removeError) {
          const errorMessage =
            removeError instanceof Error
              ? removeError.message
              : "Unknown error";
          logger.error(
            `[placeToQueue][${recordLocator}] Failed to remove from source queue ${sourceQueue}:`,
            removeError,
          );
          throw new Error(
            `Queue placement succeeded but removal from source queue failed: ${errorMessage}`,
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[placeToQueue][${recordLocator}] Error in queue placement workflow:`,
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          sourceQueue,
          targetQueue,
        },
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Sends a queue placement request to Sabre
   * @param recordLocator - The PNR record locator
   * @param prefatoryInstructionCode - Queue instruction code
   * @returns Queue placement response
   */
  private async sendQueuePlaceRequest(
    recordLocator: string,
    prefatoryInstructionCode: string,
  ): Promise<QueuePlaceResponse> {
    const timestamp = new Date().toISOString();
    const sessionToken = await this.sessionService.getAccessToken();
    const requestBody = `
        <QueuePlaceRQ 
          xmlns="http://webservices.sabre.com/sabreXML/2011/10" 
          NumResponses="5" 
          ReturnHostCommand="false" 
          TimeStamp="${timestamp}" 
          Version="2.0.4">
          <QueueInfo>
            <QueueIdentifier 
              Number="${this.queueConfig.targetQueue}" 
              PrefatoryInstructionCode="${prefatoryInstructionCode}" 
              PseudoCityCode="${this.sabreConfig.pcc}"/>
            <UniqueID ID="${recordLocator}"/>
          </QueueInfo>
        </QueuePlaceRQ>`;

    logger.info(
      `[sendQueuePlaceRequest][${recordLocator}] Sending queue placement request to Sabre...`,
    );

    const response = (await this.soapExecutor.execute<QueuePlaceResponse>(
      {
        service: this.QUEUE_PLACE_SERVICE,
        action: this.QUEUE_PLACE_ACTION,
        body: requestBody,
        sessionToken,
      },
      "QueuePlaceRS",
    )) as any;

    // Validate response
    if (response?.QueuePlaceRS?.$?.status !== "Success") {
      const errorText = Array.isArray(response?.QueuePlaceRS?.Text)
        ? response.QueuePlaceRS.Text.join(", ")
        : response?.QueuePlaceRS?.Text;
      throw new Error(
        `Queue placement failed: ${errorText || "Unknown error"}`,
      );
    }

    return response;
  }

  /**
   * Removes a PNR from the specified queue
   * @param queueNumber - The queue number to remove from
   * @param recordLocator - The PNR record locator
   */
  public async removeFromQueue(
    queueNumber: string | null | undefined,
    recordLocator: string,
  ): Promise<void> {
    if (!queueNumber) {
      throw new Error("Queue Number is Required");
    }
    try {
      const sessionToken = await this.sessionService.getAccessToken();

      // Access the queue
      const accessRequest = buildQueueAccessRequest(
        this.sabreConfig.pcc,
        queueNumber,
      );

      const accessResponse = await this.soapExecutor.execute({
        service: this.QUEUE_ACCESS_SERVICE,
        action: this.QUEUE_ACCESS_ACTION,
        body: accessRequest,
        sessionToken,
      });

      if (accessResponse) {
        logger.info(
          `[removeFromQueue][${recordLocator}] Successfully accessed queue ${queueNumber}`,
        );
      }

      const navRequest = buildNavigationRequest("QR");
      await this.soapExecutor.execute({
        service: this.QUEUE_ACCESS_SERVICE,
        action: this.QUEUE_ACCESS_ACTION,
        body: navRequest,
        sessionToken,
      });

      logger.info(
        `[removeFromQueue][${recordLocator}] Successfully removed from queue ${queueNumber}`,
      );

      try {
        const endRequest = buildNavigationRequest("QXI");
        await this.soapExecutor.execute({
          service: this.QUEUE_ACCESS_SERVICE,
          action: this.QUEUE_ACCESS_ACTION,
          body: endRequest,
          sessionToken,
        });
      } catch (endError) {
        const errorMessage =
          endError instanceof Error ? endError.message : "Unknown error";
        logger.warn(
          `[removeFromQueue][${recordLocator}] Warning: Could not end queue access:`,
          errorMessage,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[removeFromQueue][${recordLocator}] ${errorMessage} ${queueNumber}:`,
        error,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Moves a PNR to the error queue
   * @param recordLocator - The PNR record locator
   * @param errorMessage - Description of the error
   */
  public async moveToErrorQueue(
    recordLocator: string,
    errorMessage: string,
  ): Promise<void> {
    const queueNumber = this.queueConfig.errorQueue;

    if (!queueNumber) {
      throw new Error("Error queue not configured");
    }

    try {
      logger.info(
        `[moveToErrorQueue][${recordLocator}] Moving PNR to error queue ${queueNumber}: ${errorMessage}`,
      );

      const requestObj = this.queueBuilder.buildQueuePlaceRequest(
        recordLocator,
        queueNumber,
        this.sabreConfig.pcc,
      );

      const xml = this.xmlBuilder.buildObject(requestObj);

      await this.soapExecutor.execute({
        service: "QueuePlaceRQ",
        action: "OTA_QueuePlaceLLSRQ",
        sessionToken: await this.sessionService.getAccessToken(),
        body: xml,
      });

      logger.info(
        `[moveToErrorQueue][${recordLocator}] Successfully moved to error queue ${queueNumber}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[moveToErrorQueue][${recordLocator}] Failed to move to error queue:`,
        error,
      );
      throw new Error(`Failed to move to error queue: ${errorMessage}`);
    }
  }
}
