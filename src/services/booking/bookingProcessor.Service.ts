import { PoolClient } from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import logger from "../../utils/logger";
import { getDefaultOrganizationId } from "../../connectors/helpers/otherHelpers";

class BookingProcessorService {
  public async processPnrToBookings(
    pnrNumber: string,
    flightData: any,
    travelerData: any,
    client: PoolClient,
  ): Promise<void> {
    try {
      logger.info(`Processing PNR to bookings: ${pnrNumber}`);

      // Create or update trip
      const trip = await this.createOrUpdateTrip(pnrNumber, flightData, client);

      // Process flight if data exists
      if (flightData) {
        await this.processFlight(flightData, trip.id, client);
      }

      // Process traveler if data exists
      if (travelerData) {
        await this.processTraveler(travelerData, trip.id, client);
      }

      logger.info(`Successfully processed bookings for PNR: ${pnrNumber}`);
    } catch (error) {
      logger.error(`Error processing PNR to bookings ${pnrNumber}:`, {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private async createOrUpdateTrip(
    pnrNumber: string,
    flightData: any,
    client: PoolClient,
  ) {
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
          COALESCE((SELECT id FROM existing_trip), $1),
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
          uuidv4(),
          ORG_ID,
          tripName,
          pnrNumber,
          flightData?.origin || "",
          flightData?.destination || "",
          flightData?.departureDate || new Date(),
          flightData?.departureDate || new Date(),
          "booked",
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Error in createOrUpdateTrip:", error);
      throw error;
    }
  }

  private async processFlight(
    flightData: any,
    tripId: string,
    client: PoolClient,
  ): Promise<void> {
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
  ): Promise<void> {
    if (!travelerData) return;

    // Insert or get the traveler profile
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

export default BookingProcessorService;
