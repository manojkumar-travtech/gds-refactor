import { buildGetReservationRequest } from "../connectors/Envelopes/otherEnvelopes";
import {
  sendQueueRequest,
  SendQueueRequestOptions,
} from "../connectors/Envelopes/buildSoapEnvelope";
import {
  parsePNRDetails,
  PNRDataFromParser,
  ReservationFromParser,
} from "../parsers/parsePNRDetails";
import logger from "../utils/logger";
import { BaseSabreService } from "./base-sabre.service";

interface ParsedPNRResult {
  pnrNumber?: string;
  passengerName?: string;
  profileId: string | null;
  flightInfo: any[];
  carRentalInfo: any[];
  hotelInfo: any[];
  rawData: PNRDataFromParser | ReservationFromParser;
  timestamp: string;
  travelers?: any[];
  trips?: any;
}

export class PnrDetailsService extends BaseSabreService {
  private static instance: PnrDetailsService;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000; // milliseconds

  private constructor() {
    super();
  }

  public static getInstance(): PnrDetailsService {
    if (!PnrDetailsService.instance) {
      PnrDetailsService.instance = new PnrDetailsService();
    }
    return PnrDetailsService.instance;
  }
  /**
   * Retrieves PNR details from Sabre with automatic retry logic
   * @param pnrNumber - The PNR record locator
   * @returns Parsed PNR details
   * @throws Error if PNR number is invalid or retrieval fails after all retries
   */
  async getPnrDetails(pnrNumber: string): Promise<ParsedPNRResult> {
    // Validate input
    if (!pnrNumber || typeof pnrNumber !== "string") {
      const error = new Error(
        "Invalid PNR number: PNR number must be a non-empty string",
      );
      logger.error("PNR validation failed", { pnrNumber });
      throw error;
    }

    // Trim and validate format
    const cleanPnr = pnrNumber.trim().toUpperCase();
    if (cleanPnr.length === 0) {
      const error = new Error("Invalid PNR number: PNR number cannot be empty");
      logger.error("PNR validation failed", { pnrNumber: cleanPnr });
      throw error;
    }

    logger.info("Fetching PNR details", { pnr: cleanPnr });

    let lastError: Error | null = null;

    // Retry loop
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        logger.debug("Attempting to fetch PNR details", {
          pnr: cleanPnr,
          attempt,
          maxRetries: this.MAX_RETRIES,
        });

        const sessionToken: string = await this.sessionService.getAccessToken();

        const request: string = buildGetReservationRequest(cleanPnr);

        const { endpoint, organization } = this.sabreConfig;

        const req: SendQueueRequestOptions = {
          service: "OTA_GetReservationRQ",
          action: "GetReservationRQ",
          body: request,
          endpoint,
          organization,
          sessionToken,
        };

        logger.debug("Sending request to Sabre", {
          pnr: cleanPnr,
          attempt,
          service: req.service,
          action: req.action,
        });

        const response = await sendQueueRequest(req);

        logger.debug("Received response from Sabre", {
          pnr: cleanPnr,
          attempt,
          hasResponse: !!response,
        });

        // Check if response is valid
        if (!response) {
          throw new Error("Empty response received from Sabre");
        }

        // Parse and return response
        return await this.parsePnrDetailsResponse(response, cleanPnr);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn("PNR fetch attempt failed", {
          pnr: cleanPnr,
          attempt,
          maxRetries: this.MAX_RETRIES,
          error: lastError.message,
        });

        // Don't retry on validation or configuration errors
        if (
          lastError.message.includes("Invalid PNR number") ||
          lastError.message.includes("Sabre configuration is incomplete") ||
          lastError.message.includes("Failed to build request") ||
          lastError.message.includes("Failed to parse PNR details")
        ) {
          logger.error("Non-retryable error encountered", {
            pnr: cleanPnr,
            attempt,
            error: lastError.message,
          });
          throw lastError;
        }

        // Wait before retrying (except on last attempt)
        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAY * attempt; // Exponential backoff
          logger.debug("Waiting before retry", {
            pnr: cleanPnr,
            attempt,
            delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    logger.error("All retry attempts exhausted for PNR fetch", {
      pnr: cleanPnr,
      maxRetries: this.MAX_RETRIES,
      lastError: lastError?.message,
    });

    throw new Error(
      `Failed to retrieve PNR ${cleanPnr} after ${this.MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  /**
   * Parses the PNR response from Sabre
   * @param response - Raw response from Sabre
   * @param pnrNumber - The PNR number for logging purposes
   * @returns Parsed and structured PNR data
   * @throws Error if parsing fails
   */
  private async parsePnrDetailsResponse(
    response: PNRDataFromParser | ReservationFromParser,
    pnrNumber: string,
  ): Promise<ParsedPNRResult> {
    logger.debug("Parsing PNR response", { pnr: pnrNumber });

    let parsedData: any;
    try {
      parsedData = await parsePNRDetails(response);
    } catch (error) {
      logger.error("Exception thrown during PNR parsing", {
        pnr: pnrNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to parse PNR details for ${pnrNumber}: ${error instanceof Error ? error.message : "Unknown parsing error"}`,
      );
    }

    // Check if parsing returned an error
    if (!parsedData) {
      const error = new Error(
        `Parsing returned null or undefined for PNR ${pnrNumber}`,
      );
      logger.error("Null parsing result", { pnr: pnrNumber });
      throw error;
    }

    if ("error" in parsedData && parsedData.error) {
      const error = new Error(
        `Failed to parse PNR details for ${pnrNumber}: ${parsedData.error}`,
      );
      logger.error("Parser returned error", {
        pnr: pnrNumber,
        parserError: parsedData.error,
      });
      throw error;
    }

    // Extract passenger name from travelers array
    let passengerName: string | undefined;
    if (
      parsedData.travelers &&
      Array.isArray(parsedData.travelers) &&
      parsedData.travelers.length > 0
    ) {
      const primaryTraveler =
        parsedData.travelers.find((t: any) => t.isPrimary) ||
        parsedData.travelers[0];
      if (
        primaryTraveler &&
        primaryTraveler.firstName &&
        primaryTraveler.lastName
      ) {
        passengerName =
          `${primaryTraveler.firstName} ${primaryTraveler.lastName}`.trim();
      }
    }

    // Extract profile ID from travelers
    let profileId: string | null = null;
    if (
      parsedData.travelers &&
      Array.isArray(parsedData.travelers) &&
      parsedData.travelers.length > 0
    ) {
      const primaryTraveler =
        parsedData.travelers.find((t: any) => t.isPrimary) ||
        parsedData.travelers[0];
      profileId = primaryTraveler?.profileId || null;
    }

    const result: ParsedPNRResult = {
      pnrNumber: parsedData.pnr || pnrNumber,
      passengerName,
      profileId,
      flightInfo: parsedData.flightInfo || [],
      carRentalInfo: parsedData.carRentalInfo || [],
      hotelInfo: parsedData.hotelInfo || [],
      rawData: response,
      timestamp: new Date().toISOString(),
      travelers: parsedData.travelers || [],
      trips: parsedData.trips || null,
    };

    logger.info("PNR details parsed successfully", {
      pnr: result.pnrNumber,
      passengerName: result.passengerName,
      flightsCount: result.flightInfo.length,
      hotelsCount: result.hotelInfo.length,
      carsCount: result.carRentalInfo.length,
      travelersCount: result.travelers?.length || 0,
    });

    return result;
  }

  /**
   * Validates if a PNR exists and is accessible
   * @param pnrNumber - The PNR record locator
   * @returns True if PNR exists and is accessible
   */
  async validatePnrExists(pnrNumber: string): Promise<boolean> {
    try {
      await this.getPnrDetails(pnrNumber);
      return true;
    } catch (error) {
      logger.warn("PNR validation failed", {
        pnr: pnrNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
