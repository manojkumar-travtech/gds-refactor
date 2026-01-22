import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import { getClient, PoolClient } from "../config/database";
import { parseSabreDateTime } from "../connectors/helpers/parseSabreDateTime";
import { HotelData, HotelSegment } from "../types/hotelDetails.types";
import { CarRentalData, CarRentalSegment } from "../types/carDetails.types";
import {
  PnrExtractionResult,
} from "../connectors/helpers/otherHelpers";
import { FlightInfo } from "../types/flightInfo.types";

class PnrService {
  /**
   * Store PNR details in the database
   */
  async storePnrDetails(
    pnrNumber: string,
    pnrDetails: PnrExtractionResult | null,
    queueNumber: string,
  ): Promise<number | null> {
    if (!pnrDetails) {
      logger.warn("No PNR details provided for PNR:", { pnrNumber });
      return null;
    }

    let pnrId: number | null = null;
    const profileId = pnrDetails.profileId || null;
    const client = await getClient();

    try {
      await client.query("BEGIN");

      // Insert/Update PNR
      pnrId = await this.#upsertPnr(
        client,
        pnrNumber,
        queueNumber,
        pnrDetails,
        profileId,
      );
      logger.info("Inserted/Updated PNR", { pnrId, pnrNumber });

      // Process flight information
      if (
        pnrDetails?.flightInfo &&
        Array.isArray(pnrDetails?.flightInfo) &&
        pnrDetails?.flightInfo.length > 0
      ) {
        await this.#processFlightInfo(client, pnrNumber, pnrDetails.flightInfo);
      }

      // Process car rental information
      if (
        pnrDetails?.carRentalInfo &&
        Array.isArray(pnrDetails?.carRentalInfo) &&
        pnrDetails?.carRentalInfo?.length > 0
      ) {
        await this.#processCarRentalInfo(
          client,
          pnrNumber,
          pnrDetails.carRentalInfo,
        );
      }

      // Process hotel information
      if (
        pnrDetails?.hotelInfo &&
        Array.isArray(pnrDetails?.hotelInfo) &&
        pnrDetails?.hotelInfo.length > 0
      ) {
        await this.#processHotelInfo(client, pnrNumber, pnrDetails.hotelInfo);
      }

      // Process profile and trip information
      if (profileId) {
        await this.#processProfileAndTrip(
          client,
          pnrNumber,
          profileId,
          pnrDetails,
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in storePnrDetails", {
        pnrNumber,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    } finally {
      client.release();
    }

    return pnrId;
  }

  /**
   * Process flight information and insert into database
   */
  #processFlightInfo = async (
    client: PoolClient,
    pnrNumber: string,
    flightSegments: FlightInfo[],
  ): Promise<any[]> => {
    if (!flightSegments || flightSegments.length === 0) {
      logger.warn("No flight segments to process");
      return [];
    }

    logger.info(
      `Processing ${flightSegments.length} flight segments for PNR ${pnrNumber}`,
    );
    const processedFlights: any[] = [];

    for (const [index, segment] of flightSegments.entries()) {
      try {
        // Validate required fields
        if (
          !segment.airline ||
          !segment.flightNumber ||
          !segment.origin ||
          !segment.destination
        ) {
          logger.warn(
            `Skipping flight segment ${index + 1} due to missing required fields`,
          );
          continue;
        }

        // Parse departure date/time
        const departureDateTime = parseSabreDateTime(
          segment.departureDate,
          segment.departureTime,
          "12:00",
        );

        if (!departureDateTime) {
          logger.warn(
            `Skipping flight ${segment.airline}${segment.flightNumber} due to invalid departure date/time`,
          );
          continue;
        }

        // Parse arrival date/time
        const arrivalDateTime = parseSabreDateTime(
          segment.arrivalDate || segment.departureDate,
          segment.arrivalTime,
          "14:00",
        );

        const confirmationNumber = `${pnrNumber}-${segment.airline}${segment.flightNumber}-${index}`;

        logger.info(
          `Processing flight ${index + 1}: ${segment.airline}${segment.flightNumber}`,
        );

        // Prepare flight data
        const flightData = {
          id: uuidv4(),
          trip_id: null,
          confirmation_number: confirmationNumber,
          airline: segment.airline,
          flight_number: segment.flightNumber,
          departure_airport: segment.origin,
          arrival_airport: segment.destination,
          departure_time: departureDateTime,
          arrival_time: arrivalDateTime || departureDateTime,
          cabin_class: segment.bookingClass || "economy",
          status: segment.status || "HK",
          seat_number: segment.seatNumber || null,
          booking_reference: segment.bookingReference || null,
          ticket_number: segment.ticketNumber || null,
          cost: segment.fare?.total ? parseFloat(segment.fare.total) : null,
          currency: segment.fare?.currency || "USD",
          notes: segment.notes || null,
          metadata: segment.rawData ? JSON.stringify(segment.rawData) : "{}",
        };

        // Insert flight
        const result = await client.query(
          `INSERT INTO bookings.flights (
              id, trip_id, confirmation_number, airline, flight_number,
              departure_airport, arrival_airport, departure_time, arrival_time,
              cabin_class, status, seat_number, booking_reference, ticket_number,
              cost, currency, notes, metadata
          ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
              $11, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (confirmation_number)
          DO UPDATE SET
              airline = EXCLUDED.airline,
              flight_number = EXCLUDED.flight_number,
              departure_airport = EXCLUDED.departure_airport,
              arrival_airport = EXCLUDED.arrival_airport,
              departure_time = EXCLUDED.departure_time,
              arrival_time = EXCLUDED.arrival_time,
              cabin_class = EXCLUDED.cabin_class,
              status = EXCLUDED.status,
              seat_number = EXCLUDED.seat_number,
              booking_reference = EXCLUDED.booking_reference,
              ticket_number = EXCLUDED.ticket_number,
              cost = EXCLUDED.cost,
              currency = EXCLUDED.currency,
              notes = EXCLUDED.notes,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          RETURNING id`,
          Object.values(flightData),
        );

        if (result.rows?.[0]?.id) {
          processedFlights.push({
            id: result.rows[0].id,
            confirmationNumber: flightData.confirmation_number,
            flightNumber: flightData.flight_number,
            airline: flightData.airline,
          });
        } else {
          logger.warn(
            `No ID returned for flight ${flightData.airline}${flightData.flight_number}`,
          );
        }
      } catch (error) {
        logger.error("Error processing flight info:", {
          error: error instanceof Error ? error.message : error,
          segment,
        });
        throw error;
      }
    }

    return processedFlights;
  };

  /**
   * Process hotel information and insert into database
   */
  async #processHotelInfo(
    client: PoolClient,
    pnrNumber: string,
    hotelSegments: HotelSegment[],
  ): Promise<void> {
    const logContext = { pnrNumber, segmentCount: hotelSegments?.length || 0 };

    // Validate input parameters
    if (!client) {
      logger.error("Database client is required", logContext);
      throw new Error(
        "Database client is required for processing hotel information",
      );
    }

    if (
      !pnrNumber ||
      typeof pnrNumber !== "string" ||
      pnrNumber.trim() === ""
    ) {
      logger.error("Valid PNR number is required", logContext);
      return;
    }

    // Check if hotel segments exist and is an array
    if (
      !hotelSegments ||
      !Array.isArray(hotelSegments) ||
      hotelSegments.length === 0
    ) {
      logger.info("No hotel segments provided to process", logContext);
      return;
    }

    logger.debug("Raw hotel segments received", {
      ...logContext,
      segments: hotelSegments,
    });

    // Filter out invalid or empty segments
    const validSegments = hotelSegments.filter((segment, index) => {
      if (!segment || typeof segment !== "object") {
        logger.warn("Filtering out invalid segment (not an object)", {
          ...logContext,
          segmentIndex: index,
          segment,
        });
        return false;
      }

      const hasData =
        segment.name ||
        segment.hotelName ||
        segment.confirmationNumber ||
        segment.confirmation ||
        segment.details;

      if (!hasData) {
        logger.warn("Filtering out empty hotel segment", {
          ...logContext,
          segmentIndex: index,
          segment,
        });
        return false;
      }

      return true;
    });

    if (validSegments.length === 0) {
      logger.info(
        "No valid hotel segments to process after filtering",
        logContext,
      );
      return;
    }

    logger.info("Processing hotel segments", {
      ...logContext,
      validSegmentCount: validSegments.length,
      filteredOut: hotelSegments.length - validSegments.length,
    });

    try {
      // Get the trip_id for this PNR to associate the hotel booking
      logger.debug("Looking up trip_id for PNR", { pnrNumber });

      const tripResult = await client.query<{ id: string }>(
        "SELECT id FROM bookings.trips WHERE pnr = $1 LIMIT 1",
        [pnrNumber],
      );

      const tripId = tripResult.rows[0]?.id || null;

      if (!tripId) {
        logger.warn(
          "No trip found for PNR - hotel booking will not be linked to a trip",
          {
            pnrNumber,
          },
        );
      } else {
        logger.debug("Found trip for PNR", { pnrNumber, tripId });
      }

      // Process each hotel segment
      for (const [index, segment] of validSegments.entries()) {
        const segmentNumber = index + 1;
        const segmentContext = {
          ...logContext,
          segmentNumber,
          totalSegments: validSegments.length,
        };

        logger.info("Processing hotel segment", segmentContext);

        try {
          const hotelData = this.#buildHotelData(segment, pnrNumber, tripId);

          logger.debug("Prepared hotel data for insertion", {
            ...segmentContext,
            hotelName: hotelData.hotel_name,
            confirmationNumber: hotelData.confirmation_number,
            checkIn: hotelData.check_in_date,
            checkOut: hotelData.check_out_date,
            roomType: hotelData.room_type,
            numberOfRooms: hotelData.number_of_rooms,
            cost: hotelData.cost,
            currency: hotelData.currency,
          });

          await this.#insertOrUpdateHotelBooking(
            client,
            hotelData,
            segmentContext,
          );

          logger.info("Successfully processed hotel segment", {
            ...segmentContext,
            confirmationNumber: hotelData.confirmation_number,
          });
        } catch (segmentError) {
          logger.error("Error processing individual hotel segment", {
            ...segmentContext,
            error:
              segmentError instanceof Error
                ? segmentError.message
                : segmentError,
            stack:
              segmentError instanceof Error ? segmentError.stack : undefined,
          });
          throw segmentError;
        }
      }

      logger.info("Completed processing all hotel segments", {
        ...logContext,
        processedCount: validSegments.length,
      });
    } catch (error) {
      logger.error("Error processing hotel information", {
        ...logContext,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Process car rental information and insert into database
   */
  async #processCarRentalInfo(
    client: PoolClient,
    pnrNumber: string,
    carSegments: CarRentalSegment[],
  ): Promise<void> {
    const logContext = { pnrNumber, segmentCount: carSegments?.length || 0 };

    // Validate input parameters
    if (!client) {
      logger.error("Database client is required", logContext);
      throw new Error(
        "Database client is required for processing car rental information",
      );
    }

    if (
      !pnrNumber ||
      typeof pnrNumber !== "string" ||
      pnrNumber.trim() === ""
    ) {
      logger.error("Valid PNR number is required", logContext);
      throw new Error("Valid PNR number is required");
    }

    // Check if car segments exist and is an array
    if (
      !carSegments ||
      !Array.isArray(carSegments) ||
      carSegments.length === 0
    ) {
      logger.info("No car rental segments provided to process", logContext);
      return;
    }

    logger.debug("Raw car rental segments received", {
      ...logContext,
      segments: carSegments,
    });

    // Filter out invalid or empty segments
    const validSegments = carSegments.filter((segment, index) => {
      if (!segment || typeof segment !== "object") {
        logger.warn("Filtering out invalid segment (not an object)", {
          ...logContext,
          segmentIndex: index,
          segment,
        });
        return false;
      }

      // Check for required fields
      const hasRequiredFields =
        segment.company && (segment.pickupLocation || segment.returnLocation);

      if (!hasRequiredFields) {
        logger.warn(
          "Filtering out car rental segment with missing required fields",
          {
            ...logContext,
            segmentIndex: index,
            hasCompany: !!segment.company,
            hasPickupLocation: !!segment.pickupLocation,
            hasReturnLocation: !!segment.returnLocation,
          },
        );
        return false;
      }

      return true;
    });

    if (validSegments.length === 0) {
      logger.info(
        "No valid car rental segments to process after filtering",
        logContext,
      );
      return;
    }

    logger.info("Processing car rental segments", {
      ...logContext,
      validSegmentCount: validSegments.length,
      filteredOut: carSegments.length - validSegments.length,
    });

    try {
      // Process each car rental segment
      for (const [index, segment] of validSegments.entries()) {
        const segmentNumber = index + 1;
        const segmentContext = {
          ...logContext,
          segmentNumber,
          totalSegments: validSegments.length,
        };

        logger.info("Processing car rental segment", segmentContext);

        try {
          const carRentalData = this.#buildCarRentalData(
            segment,
            pnrNumber,
            index,
          );

          logger.debug("Prepared car rental data for insertion", {
            ...segmentContext,
            company: carRentalData.company,
            confirmationNumber: carRentalData.confirmation_number,
            carType: carRentalData.car_type,
            pickupLocation: carRentalData.pickup_location,
            returnLocation: carRentalData.return_location,
            pickupDate: carRentalData.pickup_date,
            returnDate: carRentalData.return_date,
            dailyRate: carRentalData.daily_rate,
            currency: carRentalData.currency,
          });

          await this.#insertOrUpdateCarRental(
            client,
            carRentalData,
            segmentContext,
          );

          logger.info("Successfully processed car rental segment", {
            ...segmentContext,
            confirmationNumber: carRentalData.confirmation_number,
          });
        } catch (segmentError) {
          logger.error("Error processing individual car rental segment", {
            ...segmentContext,
            error:
              segmentError instanceof Error
                ? segmentError.message
                : segmentError,
            stack:
              segmentError instanceof Error ? segmentError.stack : undefined,
          });
          throw segmentError;
        }
      }

      logger.info("Completed processing all car rental segments", {
        ...logContext,
        processedCount: validSegments.length,
      });
    } catch (error) {
      logger.error("Error processing car rental information", {
        ...logContext,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
  /**
   * Upsert PNR record
   */
  #upsertPnr = async (
    client: PoolClient,
    pnrNumber: string,
    queueNumber: string,
    pnrDetails: PnrExtractionResult,
    profileId: string | null,
  ): Promise<number | null> => {
    const pnrInsertData = {
      pnrNumber,
      queueNumber,
      profileId,
      rawData: {
        passengerName: pnrDetails.passengerName,
        flightInfo: pnrDetails.flightInfo,
        hotelInfo: pnrDetails.hotelInfo,
        carRentalInfo: pnrDetails.carRentalInfo,
        paymentInfo: pnrDetails.paymentInfo,
        pricingDetails: pnrDetails.pricingDetails,
        contact: pnrDetails.contact,
        ticketingInfo: pnrDetails.ticketingInfo,
        remarks: pnrDetails.remarks,
        osiInfo: pnrDetails.osiInfo,
        ssrInfo: pnrDetails.ssrInfo,
        profileId: pnrDetails.profileId,
      },
    };

    logger.info("Inserting into pnrs table", {
      pnrNumber,
      queueNumber,
      rawDataPreview:
        JSON.stringify(pnrInsertData.rawData).substring(0, 200) + "...",
    });

    const pnrResult = await client.query<{ id: number }>(
      `
        WITH update_cte AS (
            UPDATE pnrs 
            SET 
                queue_number = $2,
                raw_data = $3,
                profile_id = $4,
                updated_at = NOW()
            WHERE pnr_number = $1
            RETURNING id
        ),
        insert_cte AS (
            INSERT INTO pnrs (pnr_number, queue_number, raw_data, profile_id)
            SELECT $1, $2, $3, $4
            WHERE NOT EXISTS (SELECT 1 FROM update_cte)
            RETURNING id
        )
        SELECT id FROM update_cte
        UNION ALL
        SELECT id FROM insert_cte
        LIMIT 1
      `,
      [
        pnrNumber,
        queueNumber,
        JSON.stringify(pnrInsertData.rawData),
        profileId,
      ],
    );

    return pnrResult.rows[0]?.id ?? null;
  };

  /**
   * Process profile and create/update trip
   */
  #processProfileAndTrip = async (
    client: PoolClient,
    pnrNumber: string,
    profileId: string,
    pnrDetails: PnrExtractionResult,
  ): Promise<void> => {
    try {
      // Get profile from gds_profiles
      const profileResult = await client.query<{ profile_id: string }>(
        `
          SELECT profile_id 
          FROM gds.gds_profiles 
          WHERE gds_profile_id = $1 
          AND gds_provider = 'sabre'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [profileId],
      );

      if (profileResult.rows.length === 0) {
        logger.warn("No matching profile found in gds.gds_profiles", {
          gdsProfileId: profileId,
        });
        return;
      }

      const profileIdFromGds = profileResult.rows[0].profile_id;

      try {
        // Create or update trip
        const tripId = await this.#upsertTrip(
          client,
          pnrNumber,
          profileIdFromGds,
        );
        logger.info("Updated/Created trip", { tripId, pnrNumber });

        // Insert flight into flights table if trip was created
        if (tripId && pnrDetails.flightInfo) {
          await this.#insertFlightForTrip(
            client,
            pnrNumber,
            tripId,
            pnrDetails.flightInfo,
          );
        }
      } catch (updateError) {
        logger.error("Error updating trip with profile ID", {
          pnrNumber,
          error:
            updateError instanceof Error ? updateError.message : updateError,
        });
      }
    } catch (error) {
      logger.error("Error processing profile and trip", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  /**
   * Upsert trip record
   */
  #upsertTrip = async (
    client: PoolClient,
    pnrNumber: string,
    profileId: string,
  ): Promise<string | null> => {
    const tripUpdateResult = await client.query<{ id: string }>(
      `
        WITH upsert AS (
            UPDATE bookings.trips 
            SET profile_id = $1,
                updated_at = NOW()
            WHERE pnr = $2
            RETURNING id
        )
        INSERT INTO bookings.trips (
            pnr,
            profile_id,
            trip_name,
            organization_id,
            created_by,
            status,
            created_at,
            updated_at
        )
        SELECT 
            $2,
            $1,
            'Trip for PNR ' || $2,
            (SELECT id FROM core.organizations LIMIT 1),
            (SELECT id FROM core.users LIMIT 1),
            'booked'::dimensions.booking_status,
            NOW(),
            NOW()
        WHERE NOT EXISTS (SELECT 1 FROM upsert)
        RETURNING id
      `,
      [profileId, pnrNumber],
    );

    return tripUpdateResult.rows[0]?.id ?? null;
  };

  /**
   * Insert flight for a specific trip
   */
  #insertFlightForTrip = async (
    client: PoolClient,
    pnrNumber: string,
    tripId: string,
    flightInfo: FlightInfo | FlightInfo[],
  ): Promise<void> => {
    const flight = Array.isArray(flightInfo) ? flightInfo[0] : flightInfo;

    const departureDate = flight.date ? new Date(flight.date) : new Date();
    const arrivalDate = new Date(departureDate);
    arrivalDate.setHours(arrivalDate.getHours() + 2);

    const flightInsertData = {
      id: uuidv4(),
      trip_id: tripId,
      confirmation_number: pnrNumber,
      airline: flight.airline,
      flight_number: flight.flightNumber,
      departure_airport: flight.origin,
      arrival_airport: flight.destination,
      departure_time: departureDate,
      arrival_time: arrivalDate,
      status: "CONFIRMED",
    };

    logger.info("Inserting into flights table", { flightInsertData });

    await client.query(
      `INSERT INTO flights (
          id, trip_id, confirmation_number, airline, flight_number,
          departure_airport, arrival_airport, departure_time,
          arrival_time, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (confirmation_number) 
      DO UPDATE SET
          airline = EXCLUDED.airline,
          flight_number = EXCLUDED.flight_number,
          departure_airport = EXCLUDED.departure_airport,
          arrival_airport = EXCLUDED.arrival_airport,
          departure_time = EXCLUDED.departure_time,
          arrival_time = EXCLUDED.arrival_time,
          status = EXCLUDED.status,
          updated_at = NOW()
      RETURNING id`,
      [
        flightInsertData.id,
        flightInsertData.trip_id,
        flightInsertData.confirmation_number,
        flightInsertData.airline,
        flightInsertData.flight_number,
        flightInsertData.departure_airport,
        flightInsertData.arrival_airport,
        flightInsertData.departure_time,
        flightInsertData.arrival_time,
        flightInsertData.status,
      ],
    );
  };

  #buildHotelData = (
    segment: HotelSegment,
    pnrNumber: string,
    tripId: string | null,
  ): HotelData => {
    let hotelName = segment.name || segment.hotelName || "Unknown Hotel";
    let hotelChain: string | null = null;

    if ((!hotelName || hotelName === "Hotel Booking") && segment.details) {
      const chainMatch = segment.details.match(
        /(MARRIOTT|HILTON|HYATT|IHG|HOLIDAY INN|SHERATON|WESTIN|RITZ|FOUR SEASONS|INTERCONTINENTAL)/i,
      );
      if (chainMatch) {
        hotelChain = chainMatch[1].toUpperCase();
        hotelName = `${hotelChain} Hotel`;
        logger.debug("Extracted hotel chain from details", {
          hotelChain,
          hotelName,
        });
      }
    } else {
      hotelChain = hotelName.includes(" by ")
        ? hotelName.split(" by ")[1]
        : hotelName.split(" ").length > 1
          ? hotelName.split(" ")[0]
          : hotelName;
    }

    // Extract rate information from details if available
    let rate = 0;
    let currency = "USD";

    if (segment.details) {
      const rateMatch = segment.details.match(/(\d+\.?\d*)\s*USD/);
      if (rateMatch) {
        rate = parseFloat(rateMatch[1]);
        currency = "USD";
        logger.debug("Extracted rate from details", { rate, currency });
      }
    }

    // Create default dates
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formatDate = (date: Date): string => date.toISOString().split("T")[0];

    // Extract room type
    const roomType =
      segment.roomType ||
      segment.room_type ||
      this.#extractRoomType(segment.details) ||
      "Standard";

    const confirmationNumber =
      segment.confirmation ||
      segment.confirmationNumber ||
      `PENDING-${pnrNumber}-${Date.now()}`;

    // Validate and parse number of rooms
    let numberOfRooms = 1;
    if (segment.numberOfRooms !== undefined && segment.numberOfRooms !== null) {
      const parsedRooms = Number(segment.numberOfRooms);
      if (isNaN(parsedRooms) || parsedRooms < 1) {
        logger.warn("Invalid number of rooms, defaulting to 1", {
          provided: segment.numberOfRooms,
          pnrNumber,
        });
      } else {
        numberOfRooms = Math.floor(parsedRooms);
      }
    }

    // Validate and parse cost
    let cost = segment.rate || segment.dailyRate || rate || 0;
    if (typeof cost === "string") {
      cost = parseFloat(cost);
    }
    if (isNaN(cost) || cost < 0) {
      logger.warn("Invalid cost value, defaulting to 0", {
        provided: segment.rate || segment.dailyRate,
        pnrNumber,
      });
      cost = 0;
    }

    // Validate dates
    const checkInDate = this.#validateDate(
      segment.checkInDate || segment.checkIn || formatDate(today),
      formatDate(today),
      "check-in",
    );

    const checkOutDate = this.#validateDate(
      segment.checkOutDate || segment.checkOut || formatDate(tomorrow),
      formatDate(tomorrow),
      "check-out",
    );

    // Ensure check-out is after check-in
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      logger.warn("Check-out date is not after check-in date, adjusting", {
        checkInDate,
        checkOutDate,
        pnrNumber,
      });
    }

    const hotelData: HotelData = {
      id: uuidv4(),
      trip_id: tripId,
      confirmation_number: confirmationNumber,
      hotel_name: hotelName.trim(),
      hotel_chain: hotelChain?.trim() || null,
      address: segment.address?.trim() || null,
      city: segment.city?.trim() || null,
      country: segment.country?.trim() || null,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      room_type: roomType.trim(),
      number_of_rooms: numberOfRooms,
      booking_reference: confirmationNumber,
      cost,
      currency: (segment.currency || currency).toUpperCase(),
      status: segment.status || "booked",
      special_requests:
        segment.specialRequests?.trim() || segment.details?.trim() || null,
      metadata: {
        pnr: pnrNumber,
        raw_data: segment.rawData || null,
        rate_plan: segment.ratePlan || null,
        ...(segment.metadata || {}),
      },
    };

    return hotelData;
  };

  /**
   * Extract room type from hotel details
   */
  #extractRoomType = (details: string | undefined): string | null => {
    if (!details || typeof details !== "string") {
      return null;
    }

    // Common room type patterns
    const roomTypePatterns = [
      /(?:ROOM|RM)[\s:]*TYPE[:\s]*([^\n,]+)/i,
      /(?:ROOM|RM)[\s:]*([^\n,]+)/i,
      /(?:KING|QUEEN|DOUBLE|TWIN|SUITE|STANDARD|DELUXE|EXECUTIVE|JUNIOR|PRESIDENTIAL|PENTHOUSE)/i,
      /(?:1|ONE|2|TWO|3|THREE|4|FOUR)\s*(?:BEDROOM|BED|BR|BDR)/i,
    ];

    for (const pattern of roomTypePatterns) {
      const match = details.match(pattern);
      if (match) {
        const roomType = (match[1] || match[0]).trim();
        logger.debug("Extracted room type from details", { roomType });
        return roomType;
      }
    }

    return null;
  };

  /**
   * Validate and format date string
   */
  #validateDate = (
    dateStr: string | undefined | null,
    fallback: string,
    fieldName: string,
  ): string => {
    if (!dateStr || typeof dateStr !== "string") {
      logger.warn(`Invalid ${fieldName} date, using fallback`, {
        provided: dateStr,
        fallback,
      });
      return fallback;
    }

    // Try to parse the date
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      logger.warn(`Could not parse ${fieldName} date, using fallback`, {
        provided: dateStr,
        fallback,
      });
      return fallback;
    }

    // Return in YYYY-MM-DD format
    return parsed.toISOString().split("T")[0];
  };

  /**
   * Insert or update hotel booking in database
   */
  #insertOrUpdateHotelBooking = async (
    client: PoolClient,
    hotelData: HotelData,
    context: Record<string, any>,
  ): Promise<void> => {
    const query = `
    INSERT INTO bookings.hotels (
      id, trip_id, confirmation_number, hotel_name, hotel_chain, 
      address, city, country, check_in_date, check_out_date, 
      room_type, number_of_rooms, booking_reference, cost, currency, 
      status, special_requests, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
    ON CONFLICT (confirmation_number) 
    DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      hotel_name = EXCLUDED.hotel_name,
      hotel_chain = EXCLUDED.hotel_chain,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      country = EXCLUDED.country,
      check_in_date = EXCLUDED.check_in_date,
      check_out_date = EXCLUDED.check_out_date,
      room_type = EXCLUDED.room_type,
      number_of_rooms = EXCLUDED.number_of_rooms,
      booking_reference = EXCLUDED.booking_reference,
      cost = EXCLUDED.cost,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      special_requests = EXCLUDED.special_requests,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;

    const params = [
      hotelData.id,
      hotelData.trip_id,
      hotelData.confirmation_number,
      hotelData.hotel_name,
      hotelData.hotel_chain,
      hotelData.address,
      hotelData.city,
      hotelData.country,
      hotelData.check_in_date,
      hotelData.check_out_date,
      hotelData.room_type,
      hotelData.number_of_rooms,
      hotelData.booking_reference,
      hotelData.cost,
      hotelData.currency,
      hotelData.status,
      hotelData.special_requests,
      JSON.stringify(hotelData.metadata),
    ];

    logger.debug("Executing hotel booking insert/update query", {
      ...context,
      confirmationNumber: hotelData.confirmation_number,
    });

    const startTime = Date.now();

    try {
      const result = await client.query<{ id: string }>(query, params);
      const duration = Date.now() - startTime;

      if (result.rows && result.rows.length > 0) {
        const hotelId = result.rows[0].id;
        logger.info("Successfully inserted/updated hotel booking", {
          ...context,
          hotelId,
          confirmationNumber: hotelData.confirmation_number,
          duration: `${duration}ms`,
          operation: result.rowCount === 1 ? "insert" : "update",
        });
      } else {
        logger.warn("Hotel booking processed but no ID was returned", {
          ...context,
          duration: `${duration}ms`,
        });
      }
    } catch (dbError) {
      logger.error("Database error during hotel insertion/update", {
        ...context,
        error: dbError instanceof Error ? dbError.message : dbError,
        stack: dbError instanceof Error ? dbError.stack : undefined,
        confirmationNumber: hotelData.confirmation_number,
        queryParams: params,
      });
      throw dbError;
    }
  };

  /**
   * Build car rental data object from segment with validation and defaults
   */
  #buildCarRentalData = (
    segment: CarRentalSegment,
    pnrNumber: string,
    index: number,
  ): CarRentalData => {
    // Validate and extract company name
    const company = segment.company || segment.vendor || "Unknown Vendor";
    if (!segment.company && !segment.vendor) {
      logger.warn("Missing company/vendor name, using default", {
        pnrNumber,
        index,
      });
    }

    // Generate or validate confirmation number
    const confirmationNumber =
      segment.confirmationNumber || `${pnrNumber}-CAR-${index + 1}`;

    // Validate and extract car type
    const carType = segment.carType || segment.vehicleClass || "Standard";
    if (!segment.carType) {
      logger.debug("Missing car type, using default", {
        pnrNumber,
        index,
        default: carType,
      });
    }

    // Validate pickup location
    const pickupLocation = segment.pickupLocation?.trim();
    if (!pickupLocation) {
      logger.warn("Missing pickup location", { pnrNumber, confirmationNumber });
    }

    // Validate return location (default to pickup if not provided)
    const returnLocation =
      segment.returnLocation?.trim() || pickupLocation || "Unknown";
    if (!segment.returnLocation && pickupLocation) {
      logger.debug("Return location not specified, using pickup location", {
        pnrNumber,
        confirmationNumber,
        location: pickupLocation,
      });
    }

    // Validate and parse dates
    const pickupDate = this.#validateDate(
      segment.pickupDate,
      new Date().toISOString().split("T")[0],
      "pickup",
    );

    const returnDate = this.#validateDate(
      segment.returnDate,
      this.#getDefaultReturnDate(pickupDate),
      "return",
    );

    // Validate pickup and return times
    const pickupTime = this.#validateTime(segment.pickupTime, "12:00");
    const returnTime = this.#validateTime(segment.returnTime, "12:00");

    // Validate date logic (return must be after pickup)
    this.#validateDateRange(
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
      pnrNumber,
    );

    // Validate and parse daily rate
    let dailyRate = 0;
    if (segment.dailyRate !== undefined && segment.dailyRate !== null) {
      if (typeof segment.dailyRate === "string") {
        dailyRate = parseFloat(segment.dailyRate);
      } else {
        dailyRate = segment.dailyRate;
      }

      if (isNaN(dailyRate) || dailyRate < 0) {
        logger.warn("Invalid daily rate, defaulting to 0", {
          provided: segment.dailyRate,
          pnrNumber,
          confirmationNumber,
        });
        dailyRate = 0;
      }
    } else {
      logger.debug("No daily rate provided, defaulting to 0", {
        pnrNumber,
        confirmationNumber,
      });
    }

    // Validate currency
    const currency = this.#validateCurrency(segment.currency);

    const carRentalData: CarRentalData = {
      id: uuidv4(),
      pnr_number: pnrNumber,
      company: company.trim(),
      confirmation_number: confirmationNumber,
      car_type: carType.trim(),
      pickup_location: pickupLocation || "Unknown",
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      return_location: returnLocation,
      return_date: returnDate,
      return_time: returnTime,
      daily_rate: dailyRate,
      currency: currency,
      raw_data: segment.rawData || segment,
    };

    return carRentalData;
  };

  /**
   * Validate time string (HH:MM format)
   */
  #validateTime = (timeStr: string | undefined, fallback: string): string => {
    if (!timeStr || typeof timeStr !== "string") {
      return fallback;
    }

    // Check if time matches HH:MM or H:MM format
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timePattern.test(timeStr)) {
      logger.warn("Invalid time format, using fallback", {
        provided: timeStr,
        fallback,
        expectedFormat: "HH:MM",
      });
      return fallback;
    }

    return timeStr;
  };

  /**
   * Get default return date (pickup date + 1 day)
   */
  #getDefaultReturnDate = (pickupDate: string): string => {
    const pickup = new Date(pickupDate);
    const returnDate = new Date(pickup);
    returnDate.setDate(returnDate.getDate() + 1);
    return returnDate.toISOString().split("T")[0];
  };

  /**
   * Validate that return date/time is after pickup date/time
   */
  #validateDateRange = (
    pickupDate: string,
    pickupTime: string,
    returnDate: string,
    returnTime: string,
    pnrNumber: string,
  ): void => {
    const pickupDateTime = new Date(`${pickupDate}T${pickupTime}`);
    const returnDateTime = new Date(`${returnDate}T${returnTime}`);

    if (returnDateTime <= pickupDateTime) {
      logger.warn("Return date/time is not after pickup date/time", {
        pnrNumber,
        pickupDateTime: pickupDateTime.toISOString(),
        returnDateTime: returnDateTime.toISOString(),
        message: "This may indicate invalid data",
      });
    }

    // Calculate rental duration
    const durationMs = returnDateTime.getTime() - pickupDateTime.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    logger.debug("Car rental duration calculated", {
      pnrNumber,
      pickupDate,
      returnDate,
      durationDays,
    });
  };

  /**
   * Validate currency code
   */
  #validateCurrency = (currency: string | undefined): string => {
    const defaultCurrency = "USD";

    if (!currency || typeof currency !== "string") {
      return defaultCurrency;
    }

    const currencyUpper = currency.toUpperCase().trim();

    // Basic validation - should be 3 letters
    if (currencyUpper.length !== 3 || !/^[A-Z]{3}$/.test(currencyUpper)) {
      logger.warn("Invalid currency code format, using default", {
        provided: currency,
        default: defaultCurrency,
      });
      return defaultCurrency;
    }

    return currencyUpper;
  };

  /**
   * Insert or update car rental in database
   */
  #insertOrUpdateCarRental = async (
    client: PoolClient,
    carRentalData: CarRentalData,
    context: Record<string, any>,
  ): Promise<void> => {
    const query = `
    INSERT INTO car_rentals (
      id, pnr_number, company, confirmation_number, car_type, 
      pickup_location, pickup_date, pickup_time, return_location,
      return_date, return_time, daily_rate, currency, raw_data, 
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    ON CONFLICT (pnr_number, confirmation_number) 
    DO UPDATE SET
      company = EXCLUDED.company,
      car_type = EXCLUDED.car_type,
      pickup_location = EXCLUDED.pickup_location,
      pickup_date = EXCLUDED.pickup_date,
      pickup_time = EXCLUDED.pickup_time,
      return_location = EXCLUDED.return_location,
      return_date = EXCLUDED.return_date,
      return_time = EXCLUDED.return_time,
      daily_rate = EXCLUDED.daily_rate,
      currency = EXCLUDED.currency,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
    RETURNING id
  `;

    const params = [
      carRentalData.id,
      carRentalData.pnr_number,
      carRentalData.company,
      carRentalData.confirmation_number,
      carRentalData.car_type,
      carRentalData.pickup_location,
      carRentalData.pickup_date,
      carRentalData.pickup_time,
      carRentalData.return_location,
      carRentalData.return_date,
      carRentalData.return_time,
      carRentalData.daily_rate,
      carRentalData.currency,
      JSON.stringify(carRentalData.raw_data),
    ];

    logger.debug("Executing car rental insert/update query", {
      ...context,
      confirmationNumber: carRentalData.confirmation_number,
    });

    const startTime = Date.now();

    try {
      const result = await client.query<{ id: string }>(query, params);
      const duration = Date.now() - startTime;

      if (result.rows && result.rows.length > 0) {
        const carRentalId = result.rows[0].id;
        logger.info("Successfully inserted/updated car rental", {
          ...context,
          carRentalId,
          confirmationNumber: carRentalData.confirmation_number,
          duration: `${duration}ms`,
          operation: result.rowCount === 1 ? "insert" : "update",
        });
      } else {
        logger.warn("Car rental processed but no ID was returned", {
          ...context,
          duration: `${duration}ms`,
        });
      }
    } catch (dbError) {
      logger.error("Database error during car rental insertion/update", {
        ...context,
        error: dbError instanceof Error ? dbError.message : dbError,
        stack: dbError instanceof Error ? dbError.stack : undefined,
        confirmationNumber: carRentalData.confirmation_number,
        queryParams: params,
      });
      throw dbError;
    }
  };
  //   async #processTraveler(
  //     travelerData: TravelerData | null | undefined,
  //     tripId: string,
  //     client: PoolClient,
  //   ): Promise<void> {
  //     if (!travelerData) {
  //       logger.info("No traveler data provided", { tripId });
  //       return;
  //     }

  //     try {
  //       logger.info("Processing traveler", { tripId, email: travelerData.email });

  //       // First insert or get the traveler profile
  //       const profileResult = await client.query<{ id: string }>(
  //         `INSERT INTO profiles (
  //         first_name,
  //         last_name,
  //         email,
  //         phone,
  //         created_at,
  //         updated_at
  //       ) VALUES ($1, $2, $3, $4, NOW(), NOW())
  //       ON CONFLICT (email)
  //       DO UPDATE SET
  //         phone = EXCLUDED.phone,
  //         updated_at = NOW()
  //       RETURNING id`,
  //         [
  //           travelerData.firstName,
  //           travelerData.lastName,
  //           travelerData.email,
  //           travelerData.phone,
  //         ],
  //       );

  //       const profileId = profileResult.rows[0]?.id;

  //       if (!profileId) {
  //         logger.error("Failed to get profile ID", {
  //           tripId,
  //           email: travelerData.email,
  //         });
  //         return;
  //       }

  //       logger.info("Profile created/updated", {
  //         tripId,
  //         profileId,
  //         email: travelerData.email,
  //       });

  //       // Link traveler to trip
  //       await client.query(
  //         `INSERT INTO trip_travelers (
  //         trip_id,
  //         profile_id,
  //         is_primary,
  //         created_at
  //       ) VALUES ($1, $2, $3, NOW())
  //       ON CONFLICT (trip_id, profile_id) DO NOTHING`,
  //         [tripId, profileId, true],
  //       );

  //       logger.info("Traveler linked to trip successfully", {
  //         tripId,
  //         profileId,
  //       });
  //     } catch (error) {
  //       logger.error("Error processing traveler", {
  //         tripId,
  //         error: error instanceof Error ? error.message : error,
  //         email: travelerData.email,
  //       });
  //       throw error;
  //     }
  //   }
}

export default PnrService;
