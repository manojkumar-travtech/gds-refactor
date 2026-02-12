import { CompletePNRData } from "./comprehensive-pnr-parser.types";

export class ComprehensivePNRParserHelpers {
  protected static findGDSProfileId(profiles: any[]): string | undefined {
    const tvlProfile = profiles.find(
      (p) => (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "TVL",
    );
    if (tvlProfile) {
      return tvlProfile["stl19:ProfileID"] || tvlProfile.ProfileID;
    }

    const crpProfile = profiles.find(
      (p) => (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "CRP",
    );
    if (crpProfile) {
      return crpProfile["stl19:ProfileID"] || crpProfile.ProfileID;
    }

    const agyProfile = profiles.find(
      (p) => (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "AGY",
    );
    if (agyProfile) {
      return agyProfile["stl19:ProfileID"] || agyProfile.ProfileID;
    }

    return profiles[0]?.["stl19:ProfileID"] || profiles[0]?.ProfileID;
  }

  protected static getSeatSummary(data: CompletePNRData): {
    totalFlights: number;
    flightsWithSeats: number;
    flightsWithoutSeats: number;
    pastFlightsMissingSeats: number;
    details: Array<{
      flight: string;
      route: string;
      date: string;
      isPast: boolean;
      seatNumbers: string[];
      hasSeats: boolean;
    }>;
  } {
    const details = data.flights.map((f) => {
      const seatNumbers = f.seats
        .map((s) => s.seatNumber)
        .filter((s) => s && s !== "0") as string[];

      return {
        flight: `${f.marketingAirline}${f.flightNumber}`,
        route: `${f.departureAirport}-${f.arrivalAirport}`,
        date: f.departureDate,
        isPast: f.isPast,
        seatNumbers,
        hasSeats: seatNumbers.length > 0,
      };
    });

    const flightsWithSeats = details.filter((d) => d.hasSeats).length;
    const flightsWithoutSeats = details.filter((d) => !d.hasSeats).length;
    const pastFlightsMissingSeats = details.filter(
      (d) => d.isPast && !d.hasSeats,
    ).length;

    return {
      totalFlights: data.flights.length,
      flightsWithSeats,
      flightsWithoutSeats,
      pastFlightsMissingSeats,
      details,
    };
  }

  protected static determineBookingStatus(
    segments: any[],
    ticketed: any,
  ): string {
    if (ticketed) return "ticketed";

    const isPast = segments.some((seg: any) => {
      const air = seg["stl19:Air"] || seg.Air;
      const hotel = seg["stl19:Hotel"] || seg.Hotel;
      const vehicle = seg["stl19:Vehicle"] || seg.Vehicle;

      return (
        air?.isPast === "true" ||
        hotel?.isPast === "true" ||
        vehicle?.isPast === "true"
      );
    });

    if (isPast) return "completed";

    const cancelled = segments.some((seg: any) => {
      const air = seg["stl19:Air"] || seg.Air;
      const hotel = seg["stl19:Hotel"] || seg.Hotel;
      const vehicle = seg["stl19:Vehicle"] || seg.Vehicle;

      const status =
        air?.ActionCode ||
        hotel?.Reservation?.LineStatus ||
        vehicle?.LineStatus;
      return ["XX", "HX", "NO", "XL"].includes(status);
    });

    if (cancelled) return "cancelled";

    return "booked";
  }

  protected static getAirlineName(code?: string): string | undefined {
    const airlines: Record<string, string> = {
      KQ: "Kenya Airways",
      AA: "American Airlines",
      UA: "United Airlines",
      DL: "Delta Air Lines",
      BA: "British Airways",
      AF: "Air France",
      LH: "Lufthansa",
      EK: "Emirates",
      QR: "Qatar Airways",
      ET: "Ethiopian Airlines",
      TK: "Turkish Airlines",
      // Add more as needed
    };
    return code ? airlines[code] : undefined;
  }

  /**
   * Utility: Get equipment name
   */
  protected static getEquipmentName(code?: string): string | undefined {
    const equipment: Record<string, string> = {
      "73H": "Boeing 737-800",
      "738": "Boeing 737-800",
      "77W": "Boeing 777-300ER",
      "789": "Boeing 787-9",
      "32A": "Airbus A320",
      "32B": "Airbus A321",
      "359": "Airbus A350-900",
      "388": "Airbus A380-800",
      // Add more as needed
    };
    return code ? equipment[code] : undefined;
  }
  protected static ensureArray<T>(item: T | T[] | undefined): T[] {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }
  protected static getRemarkText(remark: any): string | undefined {
    const remarkLines = remark["stl19:RemarkLines"] || remark.RemarkLines;
    const remarkLine =
      remarkLines?.["stl19:RemarkLine"] || remarkLines?.RemarkLine;

    if (Array.isArray(remarkLine)) {
      return remarkLine
        .map((line) => line["stl19:Text"] || line.Text || line)
        .join(" ");
    }

    return remarkLine?.["stl19:Text"] || remarkLine?.Text || remarkLine;
  }
}
