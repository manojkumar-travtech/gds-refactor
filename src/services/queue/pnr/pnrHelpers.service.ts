import { PassengerProfile } from "./parser/comprehensive-pnr-parser.types";

const BASE_STATUS_MAP: Record<string, string> = {
  HK: "confirmed",
  KK: "confirmed",
  HL: "waitlisted",
  HN: "needs_confirmation",
  UC: "unconfirmed",
  UN: "unable",
  NO: "no_action",
  PN: "pending",
  TK: "ticketed",
  XX: "cancelled",
  HX: "cancelled",
  XL: "cancelled",
};

const STATUS_CONFIG = {
  flight: [
    "HK",
    "KK",
    "HL",
    "HN",
    "UC",
    "UN",
    "NO",
    "PN",
    "TK",
    "XX",
    "HX",
    "XL",
  ],
  hotel: ["HK", "KK", "HL", "UC", "XX", "HX"],
  car: ["HK", "KK", "UC", "XX", "HX"],
} as const;

export class PnrHelpersService {
  /**
   * Build trip notes from passenger data
   */
  protected buildTripNotes(
    data: any,
    passengerProfiles: PassengerProfile[],
  ): string {
    const notes: string[] = [];

    // Primary traveler
    const primaryProfile =
      passengerProfiles.find((p) => p.isPrimary) || passengerProfiles[0];

    if (primaryProfile) {
      notes.push(
        `Primary Traveler: ${primaryProfile.firstName} ${primaryProfile.lastName}`,
      );
    }

    // Additional travelers
    if (passengerProfiles.length > 1) {
      const otherTravelers = passengerProfiles
        .filter((p) => !p.isPrimary)
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(", ");

      if (otherTravelers) {
        notes.push(`Additional Travelers: ${otherTravelers}`);
      }
    }

    // PNR info
    if (data.booking?.pnr) {
      notes.push(`PNR: ${data.booking.pnr}`);
    }

    if (data.booking?.createdBy) {
      notes.push(`Created by: ${data.booking.createdBy}`);
    }

    return notes.join("\n");
  }

  protected buildTripMetadata(
    data: any,
    passengerProfiles: PassengerProfile[],
  ): any {
    const totalPassengers = data.passengers?.length || 0;
    const emailsFound = passengerProfiles.filter((p) => p.email).length;

    return {
      parser_version: data.parserVersion || "2.1.0",
      passengers: passengerProfiles.map((p) => ({
        profile_id: p.profileId,
        gds_profile_id: p.gdsProfileId,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        is_primary: p.isPrimary,
      })),
      email_extraction: {
        total_passengers: totalPassengers,
        emails_found: emailsFound,
        emails_missing: totalPassengers - emailsFound,
      },
      booking_details: {
        pnr: data.booking?.pnr,
        created_date: data.booking?.createdDate,
        agency_pcc: data.booking?.agencyPCC,
        ticketed: data.booking?.ticketed,
      },
      segments: {
        flights: data.flights?.length || 0,
        hotels: data.hotels?.length || 0,
        cars: data.cars?.length || 0,
      },
    };
  }

  protected mapStatus(status: string, allowedCodes: readonly string[]): string {
    const code = status?.toUpperCase();
    if (!code || !allowedCodes.includes(code)) {
      return "unknown";
    }

    return BASE_STATUS_MAP[code] || "unknown";
  }

  protected mapFlightStatus(status: string): string {
    return this.mapStatus(status, STATUS_CONFIG.flight);
  }

  protected mapHotelStatus(status: string): string {
    return this.mapStatus(status, STATUS_CONFIG.hotel);
  }

  protected mapCarStatus(status: string): string {
    return this.mapStatus(status, STATUS_CONFIG.car);
  }
}
