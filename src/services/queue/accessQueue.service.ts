import {
  buildNavigationRequest,
  buildQueueAccessRequest,
} from "../../connectors/Envelopes/otherEnvelopes";
import {
  hasQueueItem,
  QueueResponse,
} from "../../connectors/helpers/hasQueueItem";
import { isValidPnr } from "../../connectors/helpers/otherHelpers";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "../profile/profilesBase.service";

// Type definitions
interface QueueInfo {
  queueNumber: string | number;
  pnrCount?: number;
}

interface RequestDetails {
  type: "initial" | "navigate";
  queueNumber: string | number;
  position?: number;
  timestamp: string;
  request: string;
}

interface ResponseDetails {
  status: string;
  timestamp: string;
  hasQueueItem: boolean;
  responseKeys: string[];
  envelopeKeys: string[];
  bodyKeys: string[];
}

interface QueueError {
  queueNumber: string | number;
  error: string;
  stack?: string;
  timestamp: Date;
}

interface AccessQueueResult {
  success: boolean;
  processedItems: number;
  errors: QueueError[];
  response: any;
  pnrs: string[];
  requestDetails: RequestDetails | Record<string, never>;
  responseDetails: ResponseDetails | Record<string, never>;
  endOfQueue?: boolean;
}

export class AccessQueueService extends ProfilesBaseService {
  constructor() {
    super();
  }

  /**
   * Access a queue at a specific position
   * @param queueInfo - Queue number or info object
   * @param position - Position in queue (0 for initial access)
   * @returns Result object with success status, PNRs, and details
   */
  public async accessQueue(
    queueInfo: string | number | QueueInfo,
    position: number = 0,
  ): Promise<AccessQueueResult> {
    const result: AccessQueueResult = {
      success: true,
      processedItems: 0,
      errors: [],
      response: null,
      pnrs: [],
      requestDetails: {},
      responseDetails: {},
    };

    try {
      const info: QueueInfo =
        typeof queueInfo === "object" ? queueInfo : { queueNumber: queueInfo };

      const sessionToken = await this.sessionService.getAccessToken();

      // If position is 0, this is the first access to the queue
      if (position === 0) {
        const accessRequest = buildQueueAccessRequest(
          this.sabreConfig.pcc,
          info.queueNumber,
        );
        logger.info(`Accessing queue ${info.queueNumber}...`);

        // Log the request details
        result.requestDetails = {
          type: "initial",
          queueNumber: info.queueNumber,
          timestamp: new Date().toISOString(),
          request: accessRequest,
        };

        const response: any = await this.soapExecutor.execute({
          service: "OTA_QueueAccessRQ",
          action: "QueueAccessLLSRQ",
          body: accessRequest,
          sessionToken,
        });

        // Log the response details
        result.responseDetails = {
          status: "received",
          timestamp: new Date().toISOString(),
          hasQueueItem: hasQueueItem(response as QueueResponse),
          responseKeys: Object.keys(response || {}),
          envelopeKeys: response?.Envelope
            ? Object.keys(response.Envelope)
            : [],
          bodyKeys: response?.Envelope?.Body
            ? Object.keys(response.Envelope.Body)
            : [],
        };

        result.response = response;
      } else {
        // For positions > 0, navigate to the next item
        logger.info(
          `Processing item ${position + 1} in queue ${info.queueNumber}`,
        );
        const navRequest = buildNavigationRequest("I");

        // Log the navigation request details
        result.requestDetails = {
          type: "navigate",
          queueNumber: info.queueNumber,
          position: position,
          timestamp: new Date().toISOString(),
          request: navRequest,
        };

        const response: any = await this.soapExecutor.execute({
          service: "OTA_QueueAccessRQ",
          action: "QueueAccessLLSRQ",
          body: navRequest,
          sessionToken,
        });

        // Log the response details
        result.responseDetails = {
          status: "received",
          timestamp: new Date().toISOString(),
          hasQueueItem: hasQueueItem(response as QueueResponse),
          responseKeys: Object.keys(response || {}),
          envelopeKeys: response?.Envelope
            ? Object.keys(response.Envelope)
            : [],
          bodyKeys: response?.Envelope?.Body
            ? Object.keys(response.Envelope.Body)
            : [],
        };

        result.response = response;
      }

      // Check if we have a valid queue item
      const hasItem = hasQueueItem(result.response);
      logger.info(
        `Queue ${info.queueNumber} position ${position}: hasQueueItem = ${hasItem}`,
      );

      if (hasItem) {
        result.processedItems = 1;

        // Parse the PNR from the response if available
        const pnr =
          result.response?.Envelope?.Body?.QueueAccessRS?.Line?.UniqueID?.$?.ID;
        if (pnr) {
          result.pnrs = [pnr];
          logger.info(`Found PNR in response: ${pnr}`);
        }

        // Check for any PNRs in the response
        const pnrs = this.extractPnrsFromResponse(result.response);
        if (pnrs && pnrs.length > 0) {
          result.pnrs = pnrs;
          result.processedItems = pnrs.length;
          logger.info(`Extracted ${pnrs.length} PNRs:`, pnrs);
        }
      } else if (this.isEndOfQueue(result.response)) {
        logger.info(`Reached end of queue ${info.queueNumber}`);
        // Return empty result to indicate end of queue
        return { ...result, endOfQueue: true };
      }

      // Log the final result
      logger.info(
        `Queue access result for ${info.queueNumber} position ${position}:`,
        {
          success: result.success,
          processedItems: result.processedItems,
          pnrsFound: result.pnrs.length,
          hasResponse: !!result.response,
          requestDetails: result.requestDetails,
        },
      );

      return result;
    } catch (error: any) {
      logger.error(
        `Error accessing queue ${
          typeof queueInfo === "object" ? queueInfo.queueNumber : queueInfo
        }:`,
        error,
      );
      result.success = false;
      result.errors.push({
        queueNumber:
          typeof queueInfo === "object" ? queueInfo.queueNumber : queueInfo,
        error: error.message,
        stack: error.stack,
        timestamp: new Date(),
      });
      return result;
    }
  }

  /**
   * Checks if the response indicates the end of the queue
   * @param response - The API response
   * @returns True if end of queue reached
   */
  private isEndOfQueue(response: any): boolean {
    const appResults =
      response?.Envelope?.Body?.QueueAccessRS?.ApplicationResults;
    if (appResults?.$?.status === "Error") {
      const errors = appResults.Error || [];
      const errorMessages = Array.isArray(errors)
        ? errors.map((e: any) => e._ || e.$.Message || "").join("; ")
        : errors._ || errors.$.Message || "";
      return errorMessages.includes("NO MORE QUEUE ITEMS");
    }
    return false;
  }

  /**
   * Extracts PNRs from the queue access response
   * @param response - The API response
   * @returns Array of valid PNRs
   */
  private extractPnrsFromResponse(response: any): string[] {
    const pnrs = new Set<string>();
    logger.debug("Extracting PNRs from response...");

    try {
      // Log the structure of the response for debugging
      logger.debug(
        "Response structure for PNR extraction:",
        JSON.stringify(
          {
            hasEnvelope: !!response?.Envelope,
            hasBody: !!response?.Envelope?.Body,
            hasQueueAccessRS: !!response?.Envelope?.Body?.QueueAccessRS,
            hasLine: !!response?.Envelope?.Body?.QueueAccessRS?.Line,
            lineKeys: response?.Envelope?.Body?.QueueAccessRS?.Line
              ? Object.keys(response.Envelope.Body.QueueAccessRS.Line)
              : "No Line object",
          },
          null,
          2,
        ),
      );

      // 1. Check for PNR in the main response (UniqueID) - Most reliable source
      const mainPnr: string | undefined =
        response?.Envelope?.Body?.QueueAccessRS?.Line?.UniqueID?.$?.ID;
      if (mainPnr && isValidPnr(mainPnr)) {
        logger.debug("Found valid PNR in UniqueID:", mainPnr);
        pnrs.add(mainPnr);
      }

      // 2. Check for PNR in PNRBFManagement_RS section (if present) - Secondary source
      const pnrbfData =
        response?.Envelope?.Body?.QueueAccessRS?.Line?.PNRBFManagement_RS;
      if (pnrbfData) {
        const pnrList = Array.isArray(pnrbfData) ? pnrbfData : [pnrbfData];
        pnrList.forEach((pnrData: any) => {
          const pnr: string | undefined = pnrData?.UniqueID?.$?.ID;
          if (pnr && isValidPnr(pnr)) {
            logger.debug(`Found valid PNR in PNRBFManagement_RS: ${pnr}`);
            pnrs.add(pnr);
          }
        });
      }

      // 3. Only check Paragraph/Text content if no PNRs found in standard locations
      if (pnrs.size === 0) {
        const paragraphTexts =
          response?.Envelope?.Body?.QueueAccessRS?.Paragraph?.Text;
        if (paragraphTexts) {
          const textArray = Array.isArray(paragraphTexts)
            ? paragraphTexts
            : [paragraphTexts];
          logger.debug(
            `No PNRs found in standard locations, checking ${textArray.length} text entries in Paragraph`,
          );

          // Only look for PNRs in specific known patterns
          textArray.forEach((text: string) => {
            // Look for PNR in format "PNR/XXXXXX"
            const pnrSlashMatch = text.match(/PNR[\s\/]([A-Z0-9]{6})\b/i);
            if (pnrSlashMatch && isValidPnr(pnrSlashMatch[1])) {
              const pnr = pnrSlashMatch[1].toUpperCase();
              logger.debug(
                `Found PNR in PNR/ format: ${pnr} from text: ${text}`,
              );
              pnrs.add(pnr);
            }

            // Look for PNR in format "LOCATOR: XXXXXX"
            const locatorMatch = text.match(/LOCATOR[\s:]+([A-Z0-9]{6})\b/i);
            if (locatorMatch && isValidPnr(locatorMatch[1])) {
              const pnr = locatorMatch[1].toUpperCase();
              logger.debug(
                `Found PNR in LOCATOR format: ${pnr} from text: ${text}`,
              );
              pnrs.add(pnr);
            }
          });
        }
      }

      // Convert Set to Array and log the result
      const uniquePnrs = Array.from(pnrs);
      logger.info(`Extracted ${uniquePnrs.length} valid PNR(s):`, uniquePnrs);

      return uniquePnrs;
    } catch (error: any) {
      logger.error("Error extracting PNRs from response:", error);
      logger.error("Error stack:", error.stack);
      return [];
    }
  }
}
