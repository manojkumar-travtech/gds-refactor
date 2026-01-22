// ---- Types ---- //

import { parseSabreDate } from "./parseSabreDateTime";

export interface ExtractedFlightData {
  airline: string;
  flightNumber: string;
  departureDate: Date | null | string;
  origin: string;
  destination: string;
  departureTime: string | null;
  arrivalTime: string | null;
  seatNumber: string | null;
  status: "CONFIRMED" | "CANCELLED" | "PENDING";
  bookingReference?: string;
  ticketNumber?: string;
}

export interface PnrData {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        Line?: Array<{
          _?: string;
          UniqueID?: {
            $?: {
              ID?: string;
            };
          };
        }>;
      };
    };
  };
}

export function extractFlightData(
  pnrData: PnrData,
): ExtractedFlightData | null {
  try {
    const pnrText = pnrData.Envelope?.Body?.QueueAccessRS?.Line?.[0]?._;

    if (!pnrText) return null;

    const flightMatch = pnrText.match(
      /2\s+([A-Z0-9]{2})([0-9]+)([A-Z]?)\s+(\d{1,2}[A-Z]{3})\s+([A-Z]{3})([A-Z]{3})/,
    );

    if (!flightMatch) return null;

    const [, airline, flightNumber, , date, origin, destination] = flightMatch;

    const seatMatch = pnrText.match(
      /SEATS\/BOARDING PASS[^\n]+\s([A-Z]\d{1,3}[A-Z]?)\s/,
    );

    const ticketNumberMatch = pnrText.match(/TICKET NUMBER\s+:\s*([0-9]+)/);

    return {
      airline,
      flightNumber,
      departureDate: parseSabreDate(date),
      origin,
      destination,
      departureTime: "14:43", // TODO: extract from PNR
      arrivalTime: "16:23", // TODO: extract from PNR
      seatNumber: seatMatch ? seatMatch[1] : null,
      status: "CONFIRMED",
      bookingReference:
        pnrData.Envelope?.Body?.QueueAccessRS?.Line?.[0]?.UniqueID?.$?.ID,
      ticketNumber: ticketNumberMatch?.[1],
    };
  } catch (error) {
    console.error("Error extracting flight data:", error);
    return null;
  }
}
