import logger from "../utils/logger";
import { CarRentalSegment } from "../types/carDetails.types";
import { HotelSegment } from "../types/hotelDetails.types";
import { FlightInfo } from "../types/flightInfo.types";
import { query } from "../config/database";

interface Remark {
  RemarkLines?: {
    RemarkLine?: {
      Text?: string;
    };
  };
}

interface Segment {
  Air?: {
    MarketingAirlineCode?: string;
    OperatingAirlineCode?: string;
    FlightNumber?: string;
    OperatingFlightNumber?: string;
    DepartureAirport?: string;
    ArrivalAirport?: string;
    DepartureDateTime?: string;
    ArrivalDateTime?: string;
    ActionCode?: string;
    MarketingClassOfService?: string;
    ResBookDesigCode?: string;
    Seats?: {
      PreReservedSeats?: {
        PreReservedSeat?: {
          SeatNumber?: string;
        };
      };
    };
    Banner?: string;
    isPast?: string;
  };
  Hotel?: {
    Reservation?: {
      HotelName?: string;
      ChainCode?: string;
      TimeSpanStart?: string;
      TimeSpanEnd?: string;
      HotelCityCode?: string;
      RoomRates?: {
        AmountBeforeTax?: string;
        CurrencyCode?: string;
      };
      RoomType?: {
        RoomTypeCode?: string;
        NumberOfUnits?: string;
      };
      LineStatus?: string;
    };
    AdditionalInformation?: {
      ConfirmationNumber?: {
        _?: string;
      };
      Address?: {
        AddressLine?: string | string[];
        CountryCode?: string;
      };
    };
    isPast?: string;
  };
  Vehicle?: {
    VendorCode?: string;
    ConfId?: string;
    PickUpLocation?: {
      LocationCode?: string;
    };
    ReturnLocation?: {
      LocationCode?: string;
    };
    PickUpDateTime?: string;
    ReturnDateTime?: string;
    LineStatus?: string;
    RentalRate?: {
      VehicleCharges?: {
        ApproximateTotalChargeAmount?: string;
      };
    };
    isPast?: string;
  };
}

interface Profile {
  ProfileType?: string;
  ProfileID?: string;
}

interface Passenger {
  FirstName?: string;
  LastName?: string;
  Profiles?: {
    Profile?: Profile | Profile[];
  };
  $?: {
    id?: string;
  };
}

interface AccountingLine {
  BaseFare?: string;
  TaxAmount?: string;
  AirlineDesignator?: string;
}

export interface ReservationFromParser {
  BookingDetails?: {
    RecordLocator?: string;
  };
  PassengerReservation?: {
    Segments?: {
      Segment?: Segment | Segment[];
    };
    Passengers?: {
      Passenger?: Passenger | Passenger[];
    };
    AccountingLines?: {
      AccountingLine?: AccountingLine | AccountingLine[];
    };
  };
  Segments?: {
    Segment?: Segment | Segment[];
  };
  Remarks?: {
    Remark?: Remark | Remark[];
  };
  Profiles?: {
    Profile?: Profile | Profile[];
  };
  AccountingLines?: {
    AccountingLine?: AccountingLine | AccountingLine[];
  };
}

export interface PNRDataFromParser {
  rawData?: {
    Envelope?: {
      Body?: {
        GetReservationRS?: {
          Reservation?: ReservationFromParser;
        };
      };
    };
  };
}

const ensureArray = <T>(item: T | T[] | undefined): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

const getTripStatus = (segments: Segment[]): string => {
  if (!segments || segments.length === 0) return "booked";

  const isPast = segments.some(
    (seg) =>
      seg.Air?.isPast === "true" ||
      seg.Vehicle?.isPast === "true" ||
      seg.Hotel?.isPast === "true",
  );
  if (isPast) return "completed";

  const codes = segments.map(
    (seg) =>
      seg.Air?.ActionCode ||
      seg.Vehicle?.LineStatus ||
      seg.Hotel?.Reservation?.LineStatus ||
      "",
  );
  if (codes.some((c) => ["XX", "HX", "NO", "XL"].includes(c)))
    return "cancelled";

  return "booked";
};

const getTripCosts = (
  reservation: ReservationFromParser,
): { estimated: number; actual: number } => {
  const accLines = ensureArray(
    reservation?.PassengerReservation?.AccountingLines?.AccountingLine ||
      reservation?.AccountingLines?.AccountingLine,
  );

  let estimated: number | null = null;
  let actual = 0;

  for (const line of accLines) {
    const base = parseFloat(line.BaseFare || "0");
    const tax = parseFloat(line.TaxAmount || "0");
    const total = base + tax;

    if (estimated === null && line.AirlineDesignator !== "XD") {
      estimated = total;
    }

    actual += total;
  }

  logger.debug("Trip costs calculated", { actual, estimated });

  return {
    estimated:
      estimated !== null
        ? Number(estimated.toFixed(2))
        : Number(actual.toFixed(2)),
    actual: Number(actual.toFixed(2)),
  };
};

const getTripName = (reservation: ReservationFromParser): string | null => {
  const remarks = ensureArray(reservation.Remarks?.Remark);
  const tripRemark = remarks.find((r) =>
    r.RemarkLines?.RemarkLine?.Text?.startsWith("CB/TRP/"),
  );
  return tripRemark
    ? tripRemark.RemarkLines!.RemarkLine!.Text!.replace("CB/TRP/", "").trim()
    : null;
};

const getTripNumber = (reservation: ReservationFromParser): string | null => {
  const remarks = ensureArray(reservation.Remarks?.Remark);
  const locatorRemark = remarks.find((r) =>
    r.RemarkLines?.RemarkLine?.Text?.startsWith("CB/TRIPLOC/"),
  );
  return locatorRemark
    ? locatorRemark
        .RemarkLines!.RemarkLine!.Text!.replace("CB/TRIPLOC/", "")
        .trim()
    : null;
};

const findProfileId = (profiles: Profile[]): string | undefined => {
  const tvlProfile = profiles.find((prof) => prof.ProfileType === "TVL");
  if (tvlProfile) return tvlProfile.ProfileID;

  const crpProfile = profiles.find((prof) => prof.ProfileType === "CRP");
  if (crpProfile) return crpProfile.ProfileID;

  const agyProfile = profiles.find((prof) => prof.ProfileType === "AGY");
  if (agyProfile) return agyProfile.ProfileID;

  return profiles[0]?.ProfileID;
};

const parsePNRDetails = async (
  pnrData: PNRDataFromParser | ReservationFromParser,
) => {
  try {
    const reservation =
      (pnrData as PNRDataFromParser)?.rawData?.Envelope?.Body?.GetReservationRS
        ?.Reservation || (pnrData as ReservationFromParser);

    if (!reservation) throw new Error("Invalid PNR data structure");

    const segments = ensureArray(
      reservation.PassengerReservation?.Segments?.Segment ||
        reservation.Segments?.Segment,
    );
    const passengers = ensureArray(
      reservation.PassengerReservation?.Passengers?.Passenger,
    );
    const pax = passengers[0] || {};
    const remarks = ensureArray(reservation.Remarks?.Remark);
    const reservationProfiles = ensureArray(
      reservation.Profiles?.Profile || [],
    );

    logger.debug("Parsing PNR details", {
      segmentsCount: segments.length,
      passengersCount: passengers.length,
      remarksCount: remarks.length,
    });

    const flightInfo: FlightInfo[] = [];
    const hotelInfo: HotelSegment[] = [];
    const carRentalInfo: CarRentalSegment[] = [];

    for (const seg of segments) {
      if (seg.Air) {
        flightInfo.push({
          airline: seg.Air.MarketingAirlineCode || seg.Air.OperatingAirlineCode,
          flightNumber: seg.Air.FlightNumber || seg.Air.OperatingFlightNumber,
          origin: seg.Air.DepartureAirport,
          destination: seg.Air.ArrivalAirport,
          departure: seg.Air.DepartureDateTime,
          arrivalDate: seg.Air.ArrivalDateTime,
          status: seg.Air.ActionCode || "HK",
          classOfService:
            seg.Air.MarketingClassOfService || seg.Air.ResBookDesigCode,
          seatNumber:
            seg.Air.Seats?.PreReservedSeats?.PreReservedSeat?.SeatNumber ||
            null,
          notes: seg.Air.Banner,
        });
      } else if (seg.Hotel) {
        const h = seg.Hotel.Reservation!;
        const info = seg.Hotel.AdditionalInformation;
        hotelInfo.push({
          name: h.HotelName,
          hotelChain: h.ChainCode,
          confirmation: info?.ConfirmationNumber?._,
          checkInDate: h.TimeSpanStart,
          checkOutDate: h.TimeSpanEnd,
          city: h.HotelCityCode,
          address: info?.Address?.AddressLine
            ? ensureArray(info.Address.AddressLine).join(", ")
            : null,
          country: info?.Address?.CountryCode,
          rate: h.RoomRates?.AmountBeforeTax,
          currency: h.RoomRates?.CurrencyCode || "EUR",
          roomType: h.RoomType?.RoomTypeCode,
          numberOfRooms: h.RoomType?.NumberOfUnits
            ? Number(h.RoomType?.NumberOfUnits)
            : 1,
          status: h.LineStatus || "HK",
          rawData: h,
        });
      } else if (seg.Vehicle) {
        carRentalInfo.push({
          vendor: seg.Vehicle.VendorCode,
          confirmation: seg.Vehicle.ConfId,
          pickupLocation: seg.Vehicle.PickUpLocation?.LocationCode,
          returnLocation: seg.Vehicle.ReturnLocation?.LocationCode,
          pickupDate: seg.Vehicle.PickUpDateTime,
          returnDate: seg.Vehicle.ReturnDateTime,
          status: seg.Vehicle.LineStatus,
          rate:
            seg.Vehicle.RentalRate?.VehicleCharges
              ?.ApproximateTotalChargeAmount || null,
        });
      }
    }

    logger.debug("Extracted segments", {
      flights: flightInfo.length,
      hotels: hotelInfo.length,
      cars: carRentalInfo.length,
    });

    const gdsProfileIds: string[] = [];
    const travelerPromises = passengers.map(async (p) => {
      const passengerProfiles = ensureArray(p.Profiles?.Profile || []);
      const gdsProfileId = findProfileId([
        ...passengerProfiles,
        ...reservationProfiles,
      ]);

      if (gdsProfileId) {
        gdsProfileIds.push(gdsProfileId);
      }

      return {
        firstName: p.FirstName,
        lastName: p.LastName,
        gdsProfileId: gdsProfileId,
        profileId: null as string | null,
        isPrimary: p.$?.id === "60",
      };
    });

    const travelers = await Promise.all(travelerPromises);

    if (gdsProfileIds.length > 0) {
      try {
        const result = await query(
          `SELECT gds_profile_id, profile_id 
           FROM gds.gds_profiles 
           WHERE gds_profile_id = ANY($1)
           ORDER BY id DESC`,
          [gdsProfileIds],
        );

        const profileMap = new Map<string, string>();
        for (const row of result) {
          if (!profileMap.has(row.gds_profile_id)) {
            profileMap.set(row.gds_profile_id, row.profile_id);
          }
        }

        for (const traveler of travelers) {
          if (traveler.gdsProfileId) {
            traveler.profileId = profileMap.get(traveler.gdsProfileId) || null;
          }
        }

        logger.debug("Found GDS Profile Mapping", {
          mappingCount: profileMap.size,
        });
      } catch (error) {
        logger.error("Error looking up profile IDs", {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const tripName = getTripName(reservation);
    const tripCosts = getTripCosts(reservation);

    const approverRemark = remarks.find((r) =>
      r.RemarkLines?.RemarkLine?.Text?.includes("DESIGNATED APPROVER-"),
    );
    const finishingRemark = remarks.find((r) =>
      r.RemarkLines?.RemarkLine?.Text?.includes("FINISHING COMPLETE"),
    );

    const bookings = {
      pnr: reservation.BookingDetails?.RecordLocator,
      tripName: tripName || `Trip for ${pax.FirstName} ${pax.LastName}`,
      tripNumber: getTripNumber(reservation),
      status: getTripStatus(segments),
      isInternational: remarks.some(
        (r) => r.RemarkLines?.RemarkLine?.Text === "*7-I",
      ),
      departureDate: flightInfo[0]?.departure || null,
      returnDate: flightInfo[flightInfo.length - 1]?.departure || null,
      originCity: flightInfo[0]?.origin || null,
      destinationCity: flightInfo[flightInfo.length - 1]?.destination || null,
      costs: tripCosts,
      purpose: {
        description: tripName,
        hotelCode: remarks
          .find((r) => r.RemarkLines?.RemarkLine?.Text?.includes("*35-"))
          ?.RemarkLines?.RemarkLine?.Text?.split("-")[1],
        carCode: remarks
          .find((r) => r.RemarkLines?.RemarkLine?.Text?.includes("*53-"))
          ?.RemarkLines?.RemarkLine?.Text?.split("-")[1],
      },
      approval: {
        requiresApproval: !remarks.some((r) =>
          r.RemarkLines?.RemarkLine?.Text?.includes("NO NN"),
        ),
        approverName:
          approverRemark?.RemarkLines?.RemarkLine?.Text?.split("-")[1]?.trim(),
      },
      approvedAt: finishingRemark
        ? new Date(
            finishingRemark.RemarkLines!.RemarkLine!.Text!.match(
              /\d{1,2}\s\d{1,2}\s\d{4}/,
            )![0],
          ).toISOString()
        : null,
    };

    logger.info("PNR parsing completed successfully", {
      pnr: bookings.pnr,
      tripName: bookings.tripName,
      status: bookings.status,
    });

    return {
      ...bookings,
      flightInfo,
      hotelInfo,
      carRentalInfo,
      travelers,
      rawData: (pnrData as PNRDataFromParser).rawData,
      trips: bookings,
    };
  } catch (error) {
    logger.error("Parser Logic Error", {
      error: error instanceof Error ? error.message : error,
    });
    return { error: (error as Error).message };
  }
};

export { parsePNRDetails };
