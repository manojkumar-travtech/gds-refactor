import { getClient, PoolClient, transaction } from "../../config/database";
import { extractFlightData } from "../../connectors/helpers/extractFlightData";
import { extractTravelerData } from "../../connectors/helpers/extractTravelerData";
import {
  extractPnrDetails,
  getDefaultOrganizationId,
} from "../../connectors/helpers/otherHelpers";
import {
  QueueData,
  QueueLogData,
  StoreQueueDataResult,
} from "../../types/queueData.types";
import { SabreConfig } from "../../types/sabre.types";
import logger from "../../utils/logger";
import { v4 as uuidv4 } from "uuid";
import PnrService from "./pnr/pnrService.service";

const pnrService = new PnrService();

class QueueDataService {
  private sabreConfig: SabreConfig;

  constructor(sabreConfig: SabreConfig) {
    this.sabreConfig = sabreConfig;
  }
  public async storeQueueData(
    queueData: QueueData,
  ): Promise<StoreQueueDataResult> {
    try {
      logger.info("=== Starting queue data processing ===", {
        queueNumber: queueData.queueNumber,
        pnrCount: queueData.pnrs?.length || 0,
      });

      // Store queue access log in its own transaction
      await this.storeQueueAccessLog(queueData);
      // Process each PNR in the queue
      if (queueData.pnrs && queueData.pnrs.length > 0) {
        await this.processPnrBatch(queueData);
      }

      logger.info("=== Queue processing completed ===", {
        queueNumber: queueData.queueNumber,
        processed: queueData.pnrs?.length || 0,
      });

      return {
        success: true,
        processed: queueData.pnrs?.length || 0,
      };
    } catch (error) {
      logger.error("Critical error in storeQueueData:", {
        error: error instanceof Error ? error.message : error,
        queueNumber: queueData.queueNumber,
      });
      throw error;
    }
  }

  private async storeQueueAccessLog(queueData: QueueData): Promise<void> {
    try {
      await transaction(async (client: PoolClient) => {
        await client.query("SET search_path TO public, bookings");

        const queueLogData: QueueLogData = {
          queueNumber: queueData.queueNumber,
          pnrCount: queueData.pnrs?.length || 0,
          pcc: this.sabreConfig.pcc,
        };

        logger.debug("Inserting into queue_access_log table", queueLogData);

        await client.query(
          "INSERT INTO queue_access_log (queue_number, pnr_count, raw_data, pcc) VALUES ($1, $2, $3, $4)",
          [
            queueData?.queueNumber,
            queueData?.pnrs?.length || 0,
            JSON.stringify(queueData?.response),
            this.sabreConfig?.pcc,
          ],
        );
      });
    } catch (error) {
      logger.error("Error in queue access log transaction:", {
        error: error instanceof Error ? error.message : error,
        queueNumber: queueData.queueNumber,
      });
    }
  }

  private async processPnrBatch(queueData: QueueData): Promise<void> {
    if (!queueData.pnrs || queueData.pnrs.length === 0) {
      return;
    }

    for (const pnrNumber of queueData.pnrs) {
      await this.processSinglePnr(pnrNumber, queueData);
    }
  }

  private async processSinglePnr(
    pnrNumber: string,
    queueData: QueueData,
  ): Promise<void> {
    const client = await getClient();

    try {
      logger.info(`Processing PNR: ${pnrNumber}`);

      await transaction(async (txClient: PoolClient) => {
        await txClient.query("SET search_path TO public, bookings");

        // Extract PNR details
        const pnrDetails = extractPnrDetails(queueData?.response);
        if (!pnrDetails) {
          throw new Error("Failed to extract PNR details");
        }

        // Store PNR details
        const pnrId = await pnrService.storePnrDetails(
          pnrNumber,
          pnrDetails,
          queueData.queueNumber,
        );

        if (!pnrId) {
          throw new Error("Failed to store PNR details");
        }

        logger.debug(`Stored PNR with ID: ${pnrId}`);

        // Process PNR to bookings
        await this.processPnrToBookings(
          queueData.response,
          pnrNumber,
          txClient,
        );

        logger.info(`Successfully processed PNR: ${pnrNumber}`);
      });
    } catch (error) {
      logger.error(`Error processing PNR ${pnrNumber}:`, {
        error: error instanceof Error ? error.message : error,
        pnrNumber,
        queueNumber: queueData.queueNumber,
      });
      // Continue with next PNR
    } finally {
      client.release();
    }
  }

  private async processPnrToBookings(
    pnrData: any,
    pnrNumber: string,
    client: PoolClient,
  ) {
    const trip = await this.createOrUpdateTripFromPnr(
      pnrData,
      pnrNumber,
      client,
    );
    const flightData = extractFlightData(pnrData);
    if (flightData) {
      await this.processFlight(flightData, trip.id, client);
    }
    const travelerData = extractTravelerData(pnrData);
    if (travelerData) {
      await this.processTraveler(travelerData, trip.id, client);
    }
  }

  private async createOrUpdateTripFromPnr(
    pnrData: any,
    pnrNumber: string,
    client: PoolClient,
  ) {
    const flightData = extractFlightData(pnrData);
    const tripName = `Trip for PNR ${pnrNumber}`;
    const ORG_ID = await getDefaultOrganizationId();
    try {
      const result = await client.query(
        `WITH existing_trip AS (
                SELECT id FROM trips WHERE pnr = $4 LIMIT 1
            )
            INSERT INTO trips (
                id,
                organization_id, 
                trip_name, 
                pnr,
                origin_city, 
                destination_city, 
                departure_date, 
                return_date, 
                status, 
                created_at, 
                updated_at
            ) SELECT 
                COALESCE((SELECT id FROM existing_trip), $1), -- Use existing ID or new UUID
                $2, $3, $4, $5, $6, $7, $8, $9, 
                CASE WHEN (SELECT id FROM existing_trip) IS NULL THEN NOW() ELSE (SELECT created_at FROM trips WHERE id = (SELECT id FROM existing_trip)) END,
                NOW()
            ON CONFLICT (pnr) 
            DO UPDATE SET
                origin_city = EXCLUDED.origin_city,
                destination_city = EXCLUDED.destination_city,
                departure_date = EXCLUDED.departure_date,
                return_date = EXCLUDED.return_date,
                status = EXCLUDED.status,
                updated_at = NOW()
            RETURNING *`,
        [
          uuidv4(), // Generate a new UUID for the trip
          ORG_ID,
          tripName,
          pnrNumber,
          flightData?.origin || "",
          flightData?.destination || "",
          flightData?.departureDate || new Date(),
          flightData?.departureDate || new Date(), // Same as departure for one-way
          "booked", // Changed from 'CONFIRMED' to 'BOOKED'
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Error in createOrUpdateTripFromPnr:", error);
      throw error;
    }
  }

  private async processFlight(
    flightData: any,
    tripId: string,
    client: PoolClient,
  ) {
    if (!flightData) {
      return;
    }
    await client.query(
      `INSERT INTO flights (
            trip_id,
            airline,
            flight_number,
            departure_airport,
            arrival_airport,
            departure_time,
            arrival_time,
            cabin_class,
            status,
            booking_reference,
            ticket_number,
            seat_number,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT (ticket_number) 
        DO UPDATE SET
            status = EXCLUDED.status,
            seat_number = EXCLUDED.seat_number,
            updated_at = NOW()`,
      [
        tripId,
        flightData.airline,
        flightData.flightNumber,
        flightData.origin,
        flightData.destination,
        flightData.departureTime,
        flightData.arrivalTime,
        flightData.cabinClass || "ECONOMY",
        flightData.status,
        flightData.bookingReference,
        flightData.ticketNumber,
        flightData.seatNumber,
      ],
    );
  }

  private async processTraveler(
    travelerData: any,
    tripId: string,
    client: PoolClient,
  ) {
    if (!travelerData) return;

    // First insert or get the traveler profile
    const profileResult = await client.query(
      `INSERT INTO profiles (
            first_name,
            last_name,
            email,
            phone,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (email) 
        DO UPDATE SET
            phone = EXCLUDED.phone,
            updated_at = NOW()
        RETURNING id`,
      [
        travelerData.firstName,
        travelerData.lastName,
        travelerData.email,
        travelerData.phone,
      ],
    );

    const profileId = profileResult.rows[0].id;

    // Link traveler to trip
    await client.query(
      `INSERT INTO trip_travelers (
            trip_id,
            profile_id,
            is_primary,
            created_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (trip_id, profile_id) DO NOTHING`,
      [tripId, profileId, true],
    );
  }
}
export default QueueDataService;
