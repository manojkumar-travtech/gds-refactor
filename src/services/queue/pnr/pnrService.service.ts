import { getClient, PoolClient } from "../../../config/database";
import { getDefaultOrganizationId } from "../../../connectors/helpers/otherHelpers";
import logger from "../../../utils/logger";
import { parsePNRDetailsParser } from "./parser/comprehensive-pnr-parser";
import {
  CompletePNRData,
  PassengerDetails,
} from "./parser/comprehensive-pnr-parser.types";

import { PnrHelpersService } from "./pnrHelpers.service";

export interface PassengerProfileWithMetadata {
  passengerId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isPrimary: boolean;
  sabreProfileId?: string | null;
  corporateProfileId?: string | null;
  emailSource?: string;
  emailExtracted?: boolean;
}

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
    const parsed = await parsePNRDetailsParser(rawSabreRS);
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

      // Get or create profiles for ALL passengers
      const passengerProfiles = await this.getOrCreateProfilesForAllPassengers(
        client,
        data,
      );

      // Store PNR record
      const pnrId = await this.upsertPnr(
        client,
        data,
        queue_number,
        passengerProfiles,
      );
      console.log(
        `PNR record stored with ID: ${pnrId} for PNR: ${data.booking.pnr}`,
      );

      // Store trip with primary passenger as creator
      const tripId = await this.upsertTrip(
        client,
        data,
        passengerProfiles,
        pnrId,
      );

      // Link ALL passengers/travelers to the trip
      await this.linkPassengersToTrip(client, tripId, passengerProfiles);

      // Store individual passenger details in pnr_passengers table
      await this.storePassengerDetails(client, pnrId, data, passengerProfiles);

      // Process all segments
      await this.processFlights(client, tripId, data.flights);
      await this.processHotels(client, tripId, data.hotels);
      await this.processCars(client, tripId, data.cars);

      await client.query("COMMIT");

      logger.info(`[PNR STORED] ${data.booking.pnr} -> Trip ${tripId}`, {
        travelers: passengerProfiles.length,
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
    passengerProfiles: PassengerProfileWithMetadata[],
  ): Promise<number> {
    if (!data.booking?.pnr) {
      throw new Error("Missing PNR number in data");
    }

    const pnrNumber = data.booking.pnr.trim().toUpperCase();
    const profileId =
      passengerProfiles.find((p) => p.isPrimary)?.profileId ||
      passengerProfiles[0]?.profileId ||
      null;

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
    passengerProfiles: PassengerProfileWithMetadata[],
    pnrId: number,
  ): Promise<string> {
    const { trip, booking } = data;

    if (!trip) throw new Error("Missing trip data");
    if (!passengerProfiles.length) {
      throw new Error("No passengers/profiles found for trip");
    }

    const primaryProfile =
      passengerProfiles.find((p) => p.isPrimary) ?? passengerProfiles[0];

    const organizationId = await getDefaultOrganizationId();
    const status = trip.status ?? booking.status;

    // 1️⃣ Check if trip already exists for this PNR
    const existing = await client.query(
      `SELECT id FROM bookings.trips WHERE pnr_id = $1`,
      [pnrId],
    );

    // 2️⃣ UPDATE path (safe, no conflicts)
    if (existing.rows.length) {
      const tripId = existing.rows[0].id;

      await client.query(
        `
      UPDATE bookings.trips
      SET
        trip_name         = $1,
        origin_city       = $2,
        destination_city  = $3,
        departure_date    = $4,
        return_date       = $5,
        purpose           = $6,
        is_international  = $7,
        status            = $8,
        estimated_cost    = $9,
        actual_cost       = $10,
        currency          = $11,
        requires_approval = $12,
        approved_at       = $13,
        notes             = $14,
        metadata          = $15,
        profile_id        = $16,
        updated_at        = NOW()
      WHERE id = $17
      `,
        [
          trip.tripName || "Untitled Trip",
          trip.origin || null,
          trip.destination || null,
          trip.departureDate || null,
          trip.returnDate || null,
          trip.purpose?.description || null,
          trip.isInternational ?? false,
          status,
          trip.estimatedCost || null,
          trip.actualCost || null,
          trip.currency || "USD",
          trip.approval?.required ?? false,
          trip.approval?.approvedAt || null,
          this.buildTripNotes(data, passengerProfiles as any),
          this.buildTripMetadata(data, passengerProfiles as any),
          primaryProfile.profileId,
          tripId,
        ],
      );

      return tripId;
    }

    // 3️⃣ INSERT path (safe because no row exists yet)
    const insertResult = await client.query(
      `
    INSERT INTO bookings.trips (
      organization_id,
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
      profile_id,
      pnr_id,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      NOW(), NOW()
    )
    RETURNING id
    `,
      [
        organizationId,
        trip.tripName || "Untitled Trip",
        trip.tripNumber,
        trip.origin || null,
        trip.destination || null,
        trip.departureDate || null,
        trip.returnDate || null,
        trip.purpose?.description || null,
        trip.isInternational ?? false,
        status,
        trip.estimatedCost || null,
        trip.actualCost || null,
        trip.currency || "USD",
        trip.approval?.required ?? false,
        null,
        trip.approval?.approvedAt || null,
        this.buildTripNotes(data, passengerProfiles as any),
        this.buildTripMetadata(data, passengerProfiles as any),
        primaryProfile.profileId,
        pnrId,
      ],
    );

    return insertResult.rows[0].id;
  }

  /**
   * Link all passengers to the trip via trip_travelers table
   */
  private async linkPassengersToTrip(
    client: PoolClient,
    tripId: string,
    passengerProfiles: PassengerProfileWithMetadata[],
  ): Promise<void> {
    logger.info(
      `Linking ${passengerProfiles.length} passengers to trip ${tripId}`,
    );

    for (const passengerProfile of passengerProfiles) {
      if (passengerProfile.profileId) {
        await client.query(
          `INSERT INTO bookings.trip_travelers
           (trip_id, profile_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (trip_id, profile_id) DO UPDATE
           SET is_primary = EXCLUDED.is_primary`,
          [tripId, passengerProfile.profileId, passengerProfile.isPrimary],
        );

        logger.debug(
          `Linked profile ${passengerProfile.profileId} to trip ${tripId} (primary: ${passengerProfile.isPrimary})`,
        );
      } else {
        logger.warn(
          `Passenger ${passengerProfile.firstName} ${passengerProfile.lastName} has no profile ID, cannot link to trip_travelers`,
        );
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          SEGMENT PROCESSORS                                */
  /* -------------------------------------------------------------------------- */

  private async processFlights(
    client: PoolClient,
    tripId: string,
    flights: any[],
  ): Promise<void> {
    if (!Array.isArray(flights) || flights.length === 0) {
      return;
    }

    for (const flight of flights) {
      const confirmationNumber = `${flight.id}-${flight.segmentAssociationId}`;

      const result = await client.query(
        `
      INSERT INTO bookings.flights
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
        metadata = EXCLUDED.metadata
      RETURNING
        id,
        confirmation_number,
        (xmax = 0) AS inserted
      `,
        [
          tripId,
          confirmationNumber,
          flight.marketingAirlineName ?? flight.marketingAirline ?? null,
          flight.flightNumber ?? null,
          flight.departureAirport ?? null,
          flight.arrivalAirport ?? null,
          flight.departureDateTime ?? null,
          flight.arrivalDateTime ?? null,
          flight.bookingClass ?? null,
          flight.seats?.[0]?.seatNumber ?? null,
          flight.segmentAssociationId ?? null,
          null, // ticket_number
          null, // cost
          "USD",
          this.mapFlightStatus(flight.status),
          flight.banner ?? null,
          {
            equipmentType: flight.equipmentType ?? null,
            equipmentName: flight.equipmentName ?? null,
            operatingAirline: flight.operatingAirlineName ?? null,
            duration: flight.duration ?? null,
            codeShare: flight.codeShare ?? null,
            scheduleChange: flight.scheduleChange ?? null,
            warnings: flight.warnings ?? null,
            allSeats: flight.seats ?? null,
          },
        ],
      );

      // ---- confirmation / audit hook ----
      if (result.rows.length === 0) {
        throw new Error(
          `Flight upsert failed for confirmation_number=${confirmationNumber}`,
        );
      }
    }
  }
  private async processHotels(
    client: PoolClient,
    tripId: string,
    hotels: any[],
  ): Promise<void> {
    if (!Array.isArray(hotels) || hotels.length === 0) {
      return;
    }

    for (const hotel of hotels) {
      const confirmationNumber =
        hotel.confirmationNumber ?? `HOTEL-${hotel.id}`;

      const result = await client.query(
        `
      INSERT INTO bookings.hotels
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
        metadata = EXCLUDED.metadata
      RETURNING
        id,
        confirmation_number,
        (xmax = 0) AS inserted
      `,
        [
          tripId,
          confirmationNumber,
          hotel.name ?? null,
          hotel.chainName ?? hotel.chainCode ?? null,
          hotel.address ??
            (Array.isArray(hotel.addressLines)
              ? hotel.addressLines.join(", ")
              : null),
          hotel.cityName ?? hotel.cityCode ?? null,
          hotel.countryName ?? hotel.countryCode ?? null,
          hotel.checkInDate ?? null,
          hotel.checkOutDate ?? null,
          hotel.roomType ?? hotel.roomDescription ?? null,
          hotel.numberOfRooms ?? 1,
          hotel.id ?? null,
          hotel.rate != null ? Number(hotel.rate) : null,
          hotel.currency ?? "USD",
          this.mapHotelStatus(hotel.status),
          null, // special_requests (future extension)
          {
            chainCode: hotel.chainCode ?? null,
            numberOfNights: hotel.numberOfNights ?? null,
            guarantee: hotel.guarantee ?? null,
            phone: hotel.phone ?? null,
            rawData: hotel.rawData ?? null,
          },
        ],
      );

      // ---- confirmation / audit hook ----
      if (result.rows.length === 0) {
        throw new Error(
          `Hotel upsert failed for confirmation_number=${confirmationNumber}`,
        );
      }
    }
  }

  private async processCars(
    client: PoolClient,
    tripId: string,
    cars: any[],
  ): Promise<void> {
    if (!Array.isArray(cars) || cars.length === 0) {
      return;
    }

    for (const car of cars) {
      const confirmationNumber = car.confirmationNumber ?? `CAR-${car.id}`;

      const result = await client.query(
        `
      INSERT INTO bookings.car_rentals
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
        metadata = EXCLUDED.metadata
      RETURNING
        id,
        confirmation_number,
        (xmax = 0) AS inserted
      `,
        [
          tripId,
          confirmationNumber,
          car.vendorName ?? car.vendor ?? null,
          car.vehicleType ?? null,
          car.vehicleClass ?? null,
          car.pickupLocationName ?? car.pickupLocation ?? null,
          car.returnLocationName ?? car.returnLocation ?? null,
          car.pickupDate ?? null,
          car.returnDate ?? null,
          car.id ?? null,
          car.rate != null ? Number(car.rate) : null,
          car.currency ?? "USD",
          this.mapCarStatus(car.status),
          false, // insurance_included (adjust if you parse this later)
          {
            rentalDays: car.rentalDays ?? null,
            vehicleDescription: car.vehicleDescription ?? null,
            transmission: car.transmission ?? null,
            fuelType: car.fuelType ?? null,
          },
        ],
      );

      if (result.rows.length === 0) {
        throw new Error(
          `Car rental upsert failed for confirmation_number=${confirmationNumber}`,
        );
      }
    }
  }

  /**
   * Get or create profiles for all passengers
   * Handles both individual Sabre profiles and corporate profiles
   */
  public async getOrCreateProfilesForAllPassengers(
    client: PoolClient,
    data: CompletePNRData,
  ): Promise<PassengerProfileWithMetadata[]> {
    if (!data.passengers || data.passengers.length === 0) {
      throw new Error("No passengers found in PNR");
    }

    const passengerProfiles: PassengerProfileWithMetadata[] = [];
    const organizationId = await getDefaultOrganizationId();

    for (const passenger of data.passengers) {
      const gdsProfileId = passenger.gdsProfileId?.trim() || null;
      const email = passenger.email?.toLowerCase().trim() || null;

      let profileId: string;

      /**
       * 1️⃣ Check gds.gds_profiles first
       */
      if (gdsProfileId) {
        const existing = await client.query(
          `SELECT profile_id
         FROM gds.gds_profiles
         WHERE gds_profile_id = $1
           AND gds_provider = 'sabre'`,
          [gdsProfileId],
        );

        if (existing.rows.length > 0) {
          profileId = existing.rows[0].profile_id;

          passengerProfiles.push({
            passengerId: passenger.id,
            profileId,
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            email,
            isPrimary: passenger.isPrimary,
            sabreProfileId: gdsProfileId,
            corporateProfileId: null,
            emailSource: this.inferEmailSource(passenger, data),
            emailExtracted: !!email,
          });

          continue; // ⬅️ IMPORTANT: skip creation
        }
      }

      /**
       * 2️⃣ Create profile (not found in GDS)
       */
      const profileResult = await client.query(
        `INSERT INTO profiles.profiles
       (organization_id, first_name, last_name, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
        [organizationId, passenger.firstName, passenger.lastName, email],
      );

      profileId = profileResult.rows[0].id;

      /**
       * 3️⃣ Insert into gds.gds_profiles
       */
      if (gdsProfileId) {
        await client.query(
          `INSERT INTO gds.gds_profiles (
           profile_id,
           gds_provider,
           gds_profile_id,
           gds_pcc,
           gds_profile_type,
           relationship_type,
           gds_metadata
         )
         VALUES (
           $1,
           'sabre',
           $2,
           $3,
           $4,
           'standalone',
           '{}'::jsonb
         )`,
          [profileId, gdsProfileId, "K2LB", passenger.profileType ?? "TVL"],
        );
      }

      /**
       * 4️⃣ Push result
       */
      passengerProfiles.push({
        passengerId: passenger.id,
        profileId,
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        email,
        isPrimary: passenger.isPrimary,
        sabreProfileId: gdsProfileId,
        corporateProfileId: null,
        emailSource: this.inferEmailSource(passenger, data),
        emailExtracted: !!email,
      });
    }

    logger.info(
      `Created/found ${passengerProfiles.length} profiles for passengers`,
    );

    return passengerProfiles;
  }
  private inferEmailSource(
    passenger: PassengerDetails,
    data: CompletePNRData,
  ): string {
    if (!passenger.email) return "none";

    // Check for U*50 remark
    const u50Remark = data.remarks?.find(
      (r) => r.type === "INVOICE" && r.text?.includes("*50-"),
    );
    if (
      u50Remark &&
      u50Remark.text?.includes(passenger.email.replace("@", "¤"))
    ) {
      return "U*50 remark (PRIORITY 1)";
    }

    // Check for CLIQUSER remark
    const cliqUserRemark = data.remarks?.find(
      (r) => r.type === "INVOICE" && r.text?.startsWith("CLIQUSER-"),
    );
    if (
      cliqUserRemark &&
      cliqUserRemark.text?.includes(passenger.email.replace("@", "¤"))
    ) {
      return "CLIQUSER remark (PRIORITY 2)";
    }

    // Check if email is in passenger object
    if (passenger.email) {
      return "Passenger EmailAddresses (PRIORITY 3+)";
    }

    return "Unknown source";
  }

  private async storePassengerDetails(
    client: PoolClient,
    pnrId: number,
    data: CompletePNRData,
    passengerProfiles: PassengerProfileWithMetadata[],
  ): Promise<void> {
    for (const passenger of data.passengers) {
      const passengerProfile = passengerProfiles.find(
        (pp) => pp.passengerId === passenger.id,
      );

      await client.query(
        `INSERT INTO bookings.pnr_passengers
         (
           pnr_id,
           passenger_id,
           profile_id,
           first_name,
           last_name,
           email,
           email_source,
           email_extraction_success,
           passenger_type,
           is_primary,
           date_of_birth,
           gender,
           gds_profile_id,
           phones,
           addresses,
           passports,
           visas,
           seats,
           tickets,
           special_requests,
           frequent_flyer,
           emergency_contacts,
           metadata,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
         ON CONFLICT (pnr_id, passenger_id)
         DO UPDATE SET
           email = EXCLUDED.email,
           email_source = EXCLUDED.email_source,
           email_extraction_success = EXCLUDED.email_extraction_success,
           phones = EXCLUDED.phones,
           addresses = EXCLUDED.addresses,
           seats = EXCLUDED.seats,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          pnrId, // $1
          passenger.id, // $2
          passengerProfile?.profileId || null, // $3
          passenger.firstName, // $4
          passenger.lastName, // $5
          passenger.email || null, // $6
          passengerProfile?.emailSource || "not_found", // $7
          !!passenger.email, // $8
          passenger.passengerType || "ADT", // $9
          passenger.isPrimary, // $10
          passenger.dateOfBirth || null, // $11
          passenger.gender || null, // $12
          passengerProfile?.sabreProfileId ||
            passengerProfile?.corporateProfileId ||
            null, // $13
          JSON.stringify(passenger.phones || []), // $14
          JSON.stringify(passenger.addresses || []), // $15
          JSON.stringify(passenger.passports || []), // $16
          JSON.stringify(passenger.visas || []), // $17
          JSON.stringify(passenger.seats || []), // $18
          JSON.stringify(passenger.tickets || []), // $19
          JSON.stringify(passenger.specialRequests || []), // $20
          JSON.stringify(passenger.frequentFlyer || []), // $21
          JSON.stringify(passenger.emergencyContacts || []), // $22
          JSON.stringify({
            nameId: passenger.nameId,
            nameAssocId: passenger.nameAssocId,
            elementId: passenger.elementId,
            nameType: passenger.nameType,
            profileType: passenger.profileType,
            sabreProfileId: passengerProfile?.sabreProfileId,
            corporateProfileId: passengerProfile?.corporateProfileId,
          }), // $23
        ],
      );
    }
  }
}
