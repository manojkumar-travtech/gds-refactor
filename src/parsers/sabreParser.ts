import { CarRentalSegment } from "../types/carDetails.types";
import { FlightInfo } from "../types/flightInfo.types";
import {
  PNRDetails,
  TravelerInfo,
  TripInfo,
} from "../types/sabre.types";

export interface PNRParseOptions {
  rawData: any;
}

export async function parsePNRDetails(
  options: PNRParseOptions,
): Promise<PNRDetails> {
  const { rawData } = options;

  try {
    // Extract basic PNR information
    const pnrNumber = extractPnrNumber(rawData);
    const passengerName = extractPassengerName(rawData);
    const profileId = extractProfileId(rawData);

    // Extract segments
    const flightInfo = extractFlightSegments(rawData);
    const carRentalInfo = extractCarRentalSegments(rawData);
    const hotelInfo = extractHotelSegments(rawData);
    const travelers = extractTravelers(rawData);

    // Extract additional information
    const contactInfo = extractContactInfo(rawData);
    const ticketingInfo = extractTicketingInfo(rawData);
    const frequentFlyer = extractFrequentFlyerInfo(rawData);
    const trips = extractTripInfo(rawData, flightInfo);

    return {
      pnrNumber,
      passengerName,
      profileId,
      flightInfo,
      carRentalInfo,
      hotelInfo,
      travelers,
      contactInfo,
      ticketingInfo,
      frequentFlyer,
      trips,
      rawData,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error parsing PNR details:", error);
    throw new Error(
      `Failed to parse PNR: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Extract PNR number from response
 */
function extractPnrNumber(rawData: any): string {
  try {
    // Try multiple possible locations
    const locations = [
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation?.BookingReferenceID
        ?.ID,
      rawData?.Envelope?.Body?.QueueAccessRS?.Line?.UniqueID?.$?.ID,
      rawData?.Envelope?.Body?.PNRBFManagement_RS?.UniqueID?.$?.ID,
    ];

    for (const location of locations) {
      if (location) return location;
    }

    throw new Error("PNR number not found in response");
  } catch (error) {
    console.error("Error extracting PNR number:", error);
    return "";
  }
}

/**
 * Extract passenger name
 */
function extractPassengerName(rawData: any): string {
  try {
    const passengers =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Passengers;

    if (passengers?.Passenger) {
      const passenger = Array.isArray(passengers.Passenger)
        ? passengers.Passenger[0]
        : passengers.Passenger;

      const surname = passenger?.PersonName?.Surname || "";
      const givenName = passenger?.PersonName?.GivenName || "";

      return `${givenName} ${surname}`.trim();
    }

    return "";
  } catch (error) {
    console.error("Error extracting passenger name:", error);
    return "";
  }
}

/**
 * Extract profile ID
 */
function extractProfileId(rawData: any): string | undefined {
  try {
    const profileId =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Passengers?.Passenger?.Profiles?.Profile
        ?.ProfileID;

    return profileId || undefined;
  } catch (error) {
    console.error("Error extracting profile ID:", error);
    return undefined;
  }
}

/**
 * Extract flight segments
 */
function extractFlightSegments(rawData: any): FlightInfo[] {
  try {
    const segments =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Segments?.Segment;

    if (!segments) return [];

    const segmentArray = Array.isArray(segments) ? segments : [segments];

    return segmentArray
      .filter((segment) => segment?.Air)
      .map((segment) => {
        const air = segment.Air;

        return {
          airline: air?.MarketingCarrier || "",
          flightNumber: air?.FlightNumber || "",
          origin: air?.DepartureAirport || "",
          destination: air?.ArrivalAirport || "",
          departure: new Date(air?.DepartureDateTime || Date.now()),
          arrival: air?.ArrivalDateTime
            ? new Date(air.ArrivalDateTime)
            : undefined,
          departureDate: air?.DepartureDateTime?.split("T")[0],
          departureTime: air?.DepartureDateTime?.split("T")[1]?.substring(0, 5),
          arrivalDate: air?.ArrivalDateTime?.split("T")[0],
          arrivalTime: air?.ArrivalDateTime?.split("T")[1]?.substring(0, 5),
          bookingClass: air?.BookingClass || "",
          classOfService: air?.ClassOfService || "",
          status: air?.Status || "HK",
          fareBasis: air?.FareBasis || "",
          seatNumber: air?.SeatNumber || "",
          bookingReference: air?.ConfirmationNumber || "",
          ticketNumber: air?.TicketNumber || "",
          fare: {
            total: air?.Fare?.TotalFare?.Amount,
            currency: air?.Fare?.TotalFare?.CurrencyCode,
          },
          raw: segment,
        };
      });
  } catch (error) {
    console.error("Error extracting flight segments:", error);
    return [];
  }
}

/**
 * Extract car rental segments
 */
function extractCarRentalSegments(rawData: any): CarRentalSegment[] {
  try {
    const segments =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Segments?.Segment;

    if (!segments) return [];

    const segmentArray = Array.isArray(segments) ? segments : [segments];

    return segmentArray
      .filter((segment) => segment?.Car)
      .map((segment) => {
        const car = segment.Car;

        return {
          vendor: car?.Vendor || "",
          confirmation: car?.ConfirmationNumber || "",
          pickupLocation: car?.PickUpLocation || "",
          returnLocation: car?.ReturnLocation || car?.PickUpLocation,
          pickupDate: car?.PickUpDateTime?.split("T")[0] || "",
          returnDate: car?.ReturnDateTime?.split("T")[0],
          rate: car?.RateAmount || "",
          status: car?.Status || "confirmed",
        };
      });
  } catch (error) {
    console.error("Error extracting car rental segments:", error);
    return [];
  }
}

/**
 * Extract hotel segments
 */
function extractHotelSegments(rawData: any): HotelInfo[] {
  try {
    const segments =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Segments?.Segment;

    if (!segments) return [];

    const segmentArray = Array.isArray(segments) ? segments : [segments];

    return segmentArray
      .filter((segment) => segment?.Hotel)
      .map((segment) => {
        const hotel = segment.Hotel;

        return {
          name: hotel?.HotelName || "",
          hotelName: hotel?.HotelName || "",
          confirmation: hotel?.ConfirmationNumber || "",
          confirmationNumber: hotel?.ConfirmationNumber || "",
          hotelChain: hotel?.ChainCode || "",
          address: hotel?.Address?.AddressLine || "",
          city: hotel?.Address?.CityName || "",
          country: hotel?.Address?.CountryCode || "",
          checkInDate: hotel?.CheckInDate || "",
          checkIn: hotel?.CheckInDate || "",
          checkOutDate: hotel?.CheckOutDate || "",
          checkOut: hotel?.CheckOutDate || "",
          roomType: hotel?.RoomType || "",
          numberOfRooms: parseInt(hotel?.NumberOfRooms || "1", 10),
          rate: parseFloat(hotel?.RateAmount || "0"),
          dailyRate: hotel?.RateAmount || "",
          currency: hotel?.Currency || "USD",
          status: hotel?.Status || "confirmed",
          rawData: segment,
        };
      });
  } catch (error) {
    console.error("Error extracting hotel segments:", error);
    return [];
  }
}

/**
 * Extract travelers
 */
function extractTravelers(rawData: any): TravelerInfo[] {
  try {
    const passengers =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Passengers?.Passenger;

    if (!passengers) return [];

    const passengerArray = Array.isArray(passengers)
      ? passengers
      : [passengers];

    return passengerArray.map((passenger, index) => ({
      profileId: passenger?.Profiles?.Profile?.ProfileID || "",
      firstName: passenger?.PersonName?.GivenName || "",
      lastName: passenger?.PersonName?.Surname || "",
      isPrimary: index === 0,
    }));
  } catch (error) {
    console.error("Error extracting travelers:", error);
    return [];
  }
}

/**
 * Extract contact information
 */
function extractContactInfo(rawData: any): any {
  try {
    const contact =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Passengers?.Passenger?.ContactInfo;

    if (!contact) return {};

    return {
      email: contact?.Email?.Address,
      phone: contact?.Telephone?.PhoneNumber,
      address: {
        street: contact?.Address?.AddressLine,
        city: contact?.Address?.CityName,
        state: contact?.Address?.StateProv,
        postalCode: contact?.Address?.PostalCode,
        country: contact?.Address?.CountryCode,
      },
    };
  } catch (error) {
    console.error("Error extracting contact info:", error);
    return {};
  }
}

/**
 * Extract ticketing information
 */
function extractTicketingInfo(rawData: any): any {
  try {
    const ticketing =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.TicketingInfo;

    if (!ticketing) return {};

    return {
      ticketNumber: ticketing?.TicketNumber,
      issueDate: ticketing?.IssueDateTime,
      ticketingStatus: ticketing?.Status,
    };
  } catch (error) {
    console.error("Error extracting ticketing info:", error);
    return {};
  }
}

/**
 * Extract frequent flyer information
 */
function extractFrequentFlyerInfo(rawData: any): any {
  try {
    const passenger =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation?.Passengers?.Passenger;

    if (!passenger) return {};

    const frequentFlyer = passenger?.LoyaltyProgram;

    if (!frequentFlyer) return {};

    return {
      airline: frequentFlyer?.Airline,
      programNumber: frequentFlyer?.ProgramNumber,
      tier: frequentFlyer?.Tier,
    };
  } catch (error) {
    console.error("Error extracting frequent flyer info:", error);
    return {};
  }
}

/**
 * Extract trip information
 */
function extractTripInfo(rawData: any, flightInfo: FlightInfo[]): TripInfo {
  try {
    const booking =
      rawData?.Envelope?.Body?.GetReservationRS?.Reservation
        ?.PassengerReservation;

    // Calculate dates from flight segments
    const dates = flightInfo.reduce(
      (acc, flight) => {
        if (flight.departure) {
          const depDate = new Date(flight.departure);
          acc.minDate = acc.minDate
            ? new Date(Math.min(acc.minDate.getTime(), depDate.getTime()))
            : depDate;
          acc.maxDate = acc.maxDate
            ? new Date(Math.max(acc.maxDate.getTime(), depDate.getTime()))
            : depDate;
        }
        return acc;
      },
      { minDate: null as Date | null, maxDate: null as Date | null },
    );

    return {
      tripName: `Trip ${flightInfo[0]?.origin || ""} to ${
        flightInfo[flightInfo.length - 1]?.destination || ""
      }`,
      originCity: flightInfo[0]?.origin,
      destinationCity: flightInfo[flightInfo.length - 1]?.destination,
      departureDate: dates.minDate || undefined,
      returnDate: dates.maxDate || undefined,
      status: booking?.Status || "booked",
      isInternational: checkIfInternational(flightInfo),
      currency: "USD",
      metadata: {
        bookingDate: booking?.CreateDateTime,
        lastModified: booking?.LastModifiedDateTime,
      },
    };
  } catch (error) {
    console.error("Error extracting trip info:", error);
    return {};
  }
}

/**
 * Check if trip is international
 */
function checkIfInternational(flightInfo: FlightInfo[]): boolean {
  if (flightInfo.length === 0) return false;

  const countries = new Set(
    flightInfo.map((flight) => flight?.origin.substring(0, 2)),
  );

  return countries.size > 1;
}
