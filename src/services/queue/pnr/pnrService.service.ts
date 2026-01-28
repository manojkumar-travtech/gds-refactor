import { getClient, PoolClient } from "../../../config/database";
import logger from "../../../utils/logger";
import {
  CompletePNRData,
  ComprehensivePNRParser,
} from "./comprehensive-pnr-parser";

export class PnrService {
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

      const pnrId = await this.upsertPnr(client, data.booking, queue_number);
      const tripId = await this.upsertTrip(client, pnrId, data.trip);

      await this.processPassengers(client, pnrId, data.passengers);
      await this.processFlights(client, tripId, data.flights);
      await this.processHotels(client, tripId, data.hotels);
      await this.processCars(client, tripId, data.cars);

      await client.query("COMMIT");

      logger.info(`[PNR STORED] ${data.booking.pnr}`);
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
    booking: any,
    queueNumber: string,
    profileId?: string,
  ): Promise<number> {
    if (!booking?.pnr) {
      throw new Error("Missing PNR in booking payload");
    }

    const pnrNumber = booking.pnr.trim().toUpperCase();

    const res = await client.query(
      `INSERT INTO bookings.pnrs
      (pnr_number, queue_number, raw_data, created_at, updated_at, profile_id)
     VALUES ($1, $2, $3, NOW(), NOW(), $4)
     ON CONFLICT (pnr_number)
     DO UPDATE SET
        queue_number = EXCLUDED.queue_number,
        raw_data     = EXCLUDED.raw_data,
        updated_at   = NOW(),
        profile_id  = EXCLUDED.profile_id
     RETURNING id`,
      [pnrNumber, queueNumber, booking, profileId || null],
    );

    return res.rows[0].id;
  }

  private async upsertTrip(
    client: PoolClient,
    pnrId: number,
    trip: any,
  ): Promise<number> {
    const res = await client.query(
      `INSERT INTO bookings.trips
       (pnr_id, start_date, end_date, origin, destination)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pnr_id)
       DO UPDATE SET start_date = EXCLUDED.start_date,
                     end_date   = EXCLUDED.end_date,
                     origin     = EXCLUDED.origin,
                     destination= EXCLUDED.destination
       RETURNING id`,
      [pnrId, trip.startDate, trip.endDate, trip.origin, trip.destination],
    );

    return res.rows[0].id;
  }

  /* -------------------------------------------------------------------------- */
  /*                          SEGMENT PROCESSORS                                */
  /* -------------------------------------------------------------------------- */

  private async processPassengers(
    client: PoolClient,
    pnrId: number,
    pax: any[],
  ) {
    for (const p of pax) {
      await client.query(
        `INSERT INTO bookings.passengers
         (pnr_id, first_name, last_name, type, email, phone)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [pnrId, p.firstName, p.lastName, p.type, p.email, p.phone],
      );
    }
  }

  private async processFlights(
    client: PoolClient,
    tripId: number,
    flights: any[],
  ) {
    for (const f of flights) {
      const res = await client.query(
        `INSERT INTO bookings.flights
         (carrier, flight_number, origin, destination, departure_time, arrival_time)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (carrier, flight_number, departure_time)
         DO UPDATE SET arrival_time = EXCLUDED.arrival_time
         RETURNING id`,
        [
          f.carrier,
          f.flightNumber,
          f.origin,
          f.destination,
          f.departure,
          f.arrival,
        ],
      );

      const flightId = res.rows[0].id;

      await client.query(
        `INSERT INTO bookings.trip_flights (trip_id, flight_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [tripId, flightId],
      );
    }
  }

  private async processHotels(
    client: PoolClient,
    tripId: number,
    hotels: any[],
  ) {
    for (const h of hotels) {
      const res = await client.query(
        `INSERT INTO bookings.hotels
         (name, city, check_in, check_out, confirmation_number)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (confirmation_number)
         DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out
         RETURNING id`,
        [h.name, h.city, h.checkIn, h.checkOut, h.confirmation],
      );

      const hotelId = res.rows[0].id;

      await client.query(
        `INSERT INTO bookings.trip_hotels (trip_id, hotel_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [tripId, hotelId],
      );
    }
  }

  private async processCars(client: PoolClient, tripId: number, cars: any[]) {
    for (const c of cars) {
      const res = await client.query(
        `INSERT INTO bookings.car_rentals
         (vendor, pickup_location, dropoff_location, pickup_date, dropoff_date, confirmation_number)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (confirmation_number)
         DO UPDATE SET pickup_date = EXCLUDED.pickup_date, dropoff_date = EXCLUDED.dropoff_date
         RETURNING id`,
        [
          c.vendor,
          c.pickupLocation,
          c.dropoffLocation,
          c.pickupDate,
          c.dropoffDate,
          c.confirmation,
        ],
      );

      const carId = res.rows[0].id;

      await client.query(
        `INSERT INTO bookings.trip_cars (trip_id, car_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [tripId, carId],
      );
    }
  }
}
