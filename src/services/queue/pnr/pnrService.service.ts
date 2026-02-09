import { getClient, PoolClient } from "../../../config/database";
import { getDefaultOrganizationId } from "../../../connectors/helpers/otherHelpers";
import logger from "../../../utils/logger";
import {
  CompletePNRData,
  ComprehensivePNRParser,
} from "./comprehensive-pnr-parser";
import { PassengerUser, PnrHelpersService } from "./pnrHelpers.service";

export class PnrService extends PnrHelpersService {
  private static instance: PnrService;

  static getInstance() {
    if (!this.instance) this.instance = new PnrService();
    return this.instance;
  }

  /**
   * Entry point from queue processing
   */
  async processSabrePNR(rawSabreRS: any, queue_number: string): Promise<void> {
    const parsed = await ComprehensivePNRParser.parse(rawSabreRS);
    await this.storeParsedPNR(parsed, queue_number);
  }

  /**
   * Main DB persistence flow
   */
  async storeParsedPNR(
    data: CompletePNRData,
    queue_number: string,
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Get or create ALL users for ALL passengers
      const passengerUsers = await this.getOrCreateUsersForAllPassengers(
        client,
        data,
      );

      // Store PNR record
      const pnrId = await this.upsertPnr(client, data, queue_number);
      console.log(
        `PNR record stored with ID: ${pnrId} for PNR: ${data.booking.pnr}`,
      );
      // Store trip with primary passenger as creator
      const tripId = await this.upsertTrip(client, data, passengerUsers);

      // Link ALL passengers/travelers to the trip
      await this.linkPassengersToTrip(client, tripId, passengerUsers);

      // Process all segments
      await this.processFlights(client, tripId, data.flights);
      await this.processHotels(client, tripId, data.hotels);
      await this.processCars(client, tripId, data.cars);

      await client.query("COMMIT");

      logger.info(`[PNR STORED] ${data.booking.pnr} -> Trip ${tripId}`, {
        travelers: passengerUsers.length,
        flights: data.flights.length,
        hotels: data.hotels.length,
        cars: data.cars.length,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("PNR Store Failed", err);
      throw err;
    } finally {
      client.release();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                              Core UPSERTS                                  */
  /* -------------------------------------------------------------------------- */

  private async upsertPnr(
    client: PoolClient,
    data: CompletePNRData,
    queueNumber: string,
  ): Promise<number> {
    if (!data.booking?.pnr) {
      throw new Error("Missing PNR number in data");
    }

    const pnrNumber = data.booking.pnr.trim().toUpperCase();
    const profileId = data.passengers?.[0]?.profileId || null;

    const res = await client.query(
      `INSERT INTO bookings.pnrs
      (pnr_number, queue_number, raw_data, profile_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (pnr_number)
     DO UPDATE SET
        queue_number = EXCLUDED.queue_number,
        raw_data     = EXCLUDED.raw_data,
        profile_id   = EXCLUDED.profile_id,
        updated_at   = NOW()
     RETURNING id`,
      [pnrNumber, queueNumber, data.rawData, profileId],
    );

    return res.rows[0].id;
  }

  private async upsertTrip(
    client: PoolClient,
    data: CompletePNRData,
    passengerUsers: PassengerUser[],
  ): Promise<string> {
    const trip = data.trip;
    const booking = data.booking;

    if (!trip) {
      throw new Error("Missing trip data");
    }

    if (passengerUsers.length === 0) {
      throw new Error("No passengers/users found for trip");
    }

    // Use primary passenger as creator, or first passenger if no primary
    const primaryUser =
      passengerUsers.find((u) => u.isPrimary) || passengerUsers[0];
    const createdBy = primaryUser.userId;

    // Get organization ID
    const organizationId = await this.getOrganizationId(client, createdBy);

    // Map status
    const status = trip.status || booking?.status;

    const res = await client.query(
      `INSERT INTO bookings.trips
       (
         organization_id,
         created_by,
         trip_name,
         trip_number,
         origin_city,
         destination_city,
         departure_date,
         return_date,
         purpose,
         is_international,
         status,
         estimated_cost,
         actual_cost,
         currency,
         requires_approval,
         approved_by,
         approved_at,
         notes,
         metadata,
         user_id,
         pnr,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
       ON CONFLICT (pnr)
       DO UPDATE SET
         trip_name = EXCLUDED.trip_name,
         origin_city = EXCLUDED.origin_city,
         destination_city = EXCLUDED.destination_city,
         departure_date = EXCLUDED.departure_date,
         return_date = EXCLUDED.return_date,
         purpose = EXCLUDED.purpose,
         is_international = EXCLUDED.is_international,
         status = EXCLUDED.status,
         estimated_cost = EXCLUDED.estimated_cost,
         actual_cost = EXCLUDED.actual_cost,
         requires_approval = EXCLUDED.requires_approval,
         approved_by = EXCLUDED.approved_by,
         approved_at = EXCLUDED.approved_at,
         metadata = EXCLUDED.metadata,
         user_id = EXCLUDED.user_id,
         updated_at = NOW()
       RETURNING id`,
      [
        organizationId, // $1
        createdBy, // $2 - created_by (primary passenger)
        trip.tripName || "Untitled Trip", // $3
        trip.tripNumber, // $4
        trip.origin, // $5
        trip.destination, // $6
        trip.departureDate || null, // $7
        trip.returnDate || null, // $8
        trip.purpose?.description || null, // $9
        trip.isInternational || false, // $10
        status, // $11
        trip.estimatedCost || null, // $12
        trip.actualCost || null, // $13
        trip.currency || "USD", // $14
        trip.approval?.required || false, // $15
        null, // approved_by                         // $16
        trip.approval?.approvedAt || null, // $17
        this.buildTripNotes(data, passengerUsers), // $18
        this.buildTripMetadata(data, passengerUsers), // $19
        createdBy, // $20 - user_id (primary passenger)
        data.booking.pnr, // $21
      ],
    );

    return res.rows[0].id;
  }

  /* -------------------------------------------------------------------------- */
  /*                          PASSENGER/USER MANAGEMENT                         */
  /* -------------------------------------------------------------------------- */

  /**
   * Get or create users for ALL passengers in the PNR
   */
  private async getOrCreateUsersForAllPassengers(
    client: PoolClient,
    data: CompletePNRData,
  ): Promise<PassengerUser[]> {
    if (!data.passengers || data.passengers.length === 0) {
      throw new Error("No passengers found in PNR");
    }

    const passengerUsers: PassengerUser[] = [];

    for (const passenger of data.passengers) {
      const email = passenger.emails?.[0];

      if (!email) {
        logger.warn(
          `Passenger ${passenger.firstName} ${passenger.lastName} has no email, skipping`,
        );
        continue;
      }

      // Get or create user for this passenger
      const userId = await this.getOrCreateUserByEmail(
        client,
        email,
        passenger.firstName,
        passenger.lastName,
      );

      passengerUsers.push({
        passengerId: passenger.id,
        userId,
        email,
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        isPrimary: passenger.isPrimary,
        profileId: passenger.profileId,
      });

      logger.info(
        `Processed passenger: ${passenger.firstName} ${passenger.lastName} -> User ID: ${userId}`,
      );
    }

    if (passengerUsers.length === 0) {
      throw new Error(
        "Could not process any passengers - all missing email addresses",
      );
    }

    return passengerUsers;
  }

  /**
   * Get or create user based on email
   */
  private async getOrCreateUserByEmail(
    client: PoolClient,
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists with this email
    const existingUser = await client.query(
      `SELECT id FROM core.users WHERE email = $1 LIMIT 1`,
      [normalizedEmail],
    );

    if (existingUser.rows.length > 0) {
      logger.info(`Found existing user for email: ${normalizedEmail}`);
      return existingUser.rows[0].id;
    }

    // User doesn't exist, create new user
    logger.info(`Creating new user for email: ${normalizedEmail}`);

    // Get default organization for new user
    const defaultOrgId = await getDefaultOrganizationId();

    const newUser = await client.query(
      `INSERT INTO core.users 
       (email, first_name, last_name, organization_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [normalizedEmail, firstName, lastName, defaultOrgId],
    );

    const userId = newUser.rows[0].id;

    logger.info(
      `Created new user with ID: ${userId} for email: ${normalizedEmail}`,
    );

    return userId;
  }

  /**
   * Link all passengers to the trip via trip_travelers table
   */
  private async linkPassengersToTrip(
    client: PoolClient,
    tripId: string,
    passengerUsers: PassengerUser[],
  ): Promise<void> {
    logger.info(
      `Linking ${passengerUsers.length} passengers to trip ${tripId}`,
    );

    for (const passengerUser of passengerUsers) {
      // If passenger has a profile, link via trip_travelers
      if (passengerUser.userId ) {
        await client.query(
          `INSERT INTO bookings.trip_travelers
           (trip_id, user_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (trip_id, user_id) DO UPDATE
           SET is_primary = EXCLUDED.is_primary`,
          [tripId, passengerUser.userId , passengerUser.isPrimary],
        );

        logger.debug(
          `Linked user ${passengerUser.userId} to trip ${tripId} (primary: ${passengerUser.isPrimary})`,
        );
      } else {
        logger.warn(
          `Passenger ${passengerUser.firstName} ${passengerUser.lastName} has no profile ID, cannot link to trip_travelers`,
        );
      }
    }
  }

  /**
   * Get organization ID from user
   */
  private async getOrganizationId(
    client: PoolClient,
    userId: string,
  ): Promise<string> {
    // Try to get organization from user
    const result = await client.query(
      `SELECT organization_id FROM core.users WHERE id = $1`,
      [userId],
    );

    if (result.rows.length > 0 && result.rows[0].organization_id) {
      return result.rows[0].organization_id;
    }

    // Fallback to default organization
    return await getDefaultOrganizationId();
  }

  /* -------------------------------------------------------------------------- */
  /*                          SEGMENT PROCESSORS                                */
  /* -------------------------------------------------------------------------- */

  private async processFlights(
    client: PoolClient,
    tripId: string,
    flights: any[],
  ): Promise<void> {
    if (!flights || flights.length === 0) return;

    for (const flight of flights) {
      const confirmationNumber = `${flight.id}-${flight.segmentAssociationId}`;

      await client.query(
        `INSERT INTO bookings.flights
         (
           trip_id,
           confirmation_number,
           airline,
           flight_number,
           departure_airport,
           arrival_airport,
           departure_time,
           arrival_time,
           cabin_class,
           seat_number,
           booking_reference,
           ticket_number,
           cost,
           currency,
           status,
           notes,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (confirmation_number)
         DO UPDATE SET
           departure_time = EXCLUDED.departure_time,
           arrival_time = EXCLUDED.arrival_time,
           seat_number = EXCLUDED.seat_number,
           status = EXCLUDED.status,
           metadata = EXCLUDED.metadata`,
        [
          tripId,
          confirmationNumber,
          flight.marketingAirlineName || flight.marketingAirline,
          flight.flightNumber,
          flight.departureAirport,
          flight.arrivalAirport,
          flight.departureDateTime,
          flight.arrivalDateTime,
          flight.bookingClass,
          flight.seats?.[0]?.seatNumber || null,
          flight.segmentAssociationId,
          null,
          null,
          "USD",
          this.mapFlightStatus(flight.status),
          flight.banner || null,
          {
            equipmentType: flight.equipmentType,
            equipmentName: flight.equipmentName,
            operatingAirline: flight.operatingAirlineName,
            duration: flight.duration,
            codeShare: flight.codeShare,
            scheduleChange: flight.scheduleChange,
            warnings: flight.warnings,
            allSeats: flight.seats,
          },
        ],
      );
    }
  }

  private async processHotels(
    client: PoolClient,
    tripId: string,
    hotels: any[],
  ): Promise<void> {
    if (!hotels || hotels.length === 0) return;

    for (const hotel of hotels) {
      const confirmationNumber =
        hotel.confirmationNumber || `HOTEL-${hotel.id}`;

      await client.query(
        `INSERT INTO bookings.hotels
         (
           trip_id,
           confirmation_number,
           hotel_name,
           hotel_chain,
           address,
           city,
           country,
           check_in_date,
           check_out_date,
           room_type,
           number_of_rooms,
           booking_reference,
           cost,
           currency,
           status,
           special_requests,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (confirmation_number)
         DO UPDATE SET
           check_in_date = EXCLUDED.check_in_date,
           check_out_date = EXCLUDED.check_out_date,
           status = EXCLUDED.status,
           metadata = EXCLUDED.metadata`,
        [
          tripId,
          confirmationNumber,
          hotel.name,
          hotel.chainName || hotel.chainCode,
          hotel.address || hotel.addressLines?.join(", "),
          hotel.cityName || hotel.cityCode,
          hotel.countryName || hotel.countryCode,
          hotel.checkInDate,
          hotel.checkOutDate,
          hotel.roomType || hotel.roomDescription,
          hotel.numberOfRooms || 1,
          hotel.id,
          hotel.rate ? parseFloat(hotel.rate) : null,
          hotel.currency || "USD",
          this.mapHotelStatus(hotel.status),
          null,
          {
            chainCode: hotel.chainCode,
            numberOfNights: hotel.numberOfNights,
            guarantee: hotel.guarantee,
            phone: hotel.phone,
            rawData: hotel.rawData,
          },
        ],
      );
    }
  }

  private async processCars(
    client: PoolClient,
    tripId: string,
    cars: any[],
  ): Promise<void> {
    if (!cars || cars.length === 0) return;

    for (const car of cars) {
      const confirmationNumber = car.confirmationNumber || `CAR-${car.id}`;

      await client.query(
        `INSERT INTO bookings.car_rentals
         (
           trip_id,
           confirmation_number,
           rental_company,
           vehicle_type,
           vehicle_class,
           pickup_location,
           dropoff_location,
           pickup_date,
           dropoff_date,
           booking_reference,
           cost,
           currency,
           status,
           insurance_included,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (confirmation_number)
         DO UPDATE SET
           pickup_date = EXCLUDED.pickup_date,
           dropoff_date = EXCLUDED.dropoff_date,
           status = EXCLUDED.status,
           metadata = EXCLUDED.metadata`,
        [
          tripId,
          confirmationNumber,
          car.vendorName || car.vendor,
          car.vehicleType,
          car.vehicleClass,
          car.pickupLocationName || car.pickupLocation,
          car.returnLocationName || car.returnLocation,
          car.pickupDate,
          car.returnDate,
          car.id,
          car.rate ? parseFloat(car.rate) : null,
          car.currency || "USD",
          this.mapCarStatus(car.status),
          false,
          {
            rentalDays: car.rentalDays,
            vehicleDescription: car.vehicleDescription,
            transmission: car.transmission,
            fuelType: car.fuelType,
          },
        ],
      );
    }
  }
}
