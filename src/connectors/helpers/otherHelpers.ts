import { query } from "../../config/database";
import { CarRentalSegment } from "../../types/carDetails.types";
import { FlightInfo } from "../../types/flightInfo.types";
import { HotelSegment } from "./extractHotelData";
import { parseSabreDate } from "./parseSabreDateTime";

let cachedOrganizationId: string | null = null;

export interface PaymentInfo {
  type: string | null;
  cardType: string | null;
  lastFour: string | null;
  authorization: string | null;
  amount: string | null;
  currency: string;
  status: string | null;
}

export interface PricingBreakdown {
  type: string;
  amount: number;
}

export interface PricingDetails {
  baseFare: number | null;
  taxes: number | null;
  fees: number | null;
  total: number | null;
  currency: string;
  breakdown: PricingBreakdown[] | null;
}

export interface PnrExtractionResult {
  passengerName: string;
  flightInfo: FlightInfo | null;
  rawText: string[];
  hotelInfo: HotelSegment | HotelSegment[] | null;
  carRentalInfo: CarRentalSegment | CarRentalSegment[] | null;
  paymentInfo: PaymentInfo | null;
  pricingDetails: PricingDetails | null;
  profileId: string | null;
  contact?: any;
  ticketingInfo?: any;
  remarks?: any;
  osiInfo?: any;
  ssrInfo?: any;
}

/**
 * Extracts the first matching capture group from a list of lines
 *
 * @param lines - Array of text lines
 * @param regex - Regex with at least one capture group
 * @param groupIndex - Capture group index to extract (default: 1)
 * @returns Extracted string or null
 */
export const extractField = (
  lines: string[],
  regex: RegExp,
  groupIndex: number = 1,
): string | null => {
  for (const line of lines) {
    const match = line.match(regex);
    if (match && match[groupIndex]) {
      return match[groupIndex].trim();
    }
  }
  return null;
};

/**
 * Extracts a numeric value from a list of lines using regex
 *
 * @param lines - Array of text lines
 * @param regex - Regex with numeric capture group
 * @param groupIndex - Capture group index (default: 1)
 * @returns Parsed number or null
 */
export const extractNumericValue = (
  lines: string[],
  regex: RegExp,
  groupIndex: number = 1,
): number | null => {
  const value = extractField(lines, regex, groupIndex);
  if (!value) return null;

  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Extracts pricing breakdown items from text lines
 *
 * Example matches:
 *  - "BASE FARE: 250.00"
 *  - "TAX: 45.50"
 *
 * @param lines - Array of text lines
 * @param regex - Regex to extract pricing items
 * @returns Pricing breakdown or null
 */
export const extractPricingBreakdown = (
  lines: string[],
  regex: RegExp = /([A-Z\s]+):\s*([0-9]+\.[0-9]{2})/gi,
): PricingBreakdown[] | null => {
  const breakdown: PricingBreakdown[] = [];

  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      breakdown.push({
        type: match[1].trim(),
        amount: parseFloat(match[2]),
      });
    }
  }

  return breakdown.length > 0 ? breakdown : null;
};

export const isValidPnr = (pnr: string) => {
  if (!pnr || typeof pnr !== "string") {
    return false;
  }
  // A valid PNR is typically 6 alphanumeric characters
  // and must contain at least one letter and one number
  return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6}$/i.test(pnr);
};

export const extractPnrDetails = (
  pnrData: unknown,
): PnrExtractionResult | null => {
  try {
    let pnrLines: string[] = [];

    // Normalize input
    if (
      Array.isArray(
        (pnrData as any)?.Envelope?.Body?.QueueAccessRS?.Paragraph?.Text,
      )
    ) {
      pnrLines = (pnrData as any).Envelope.Body.QueueAccessRS.Paragraph.Text;
    } else if (Array.isArray(pnrData)) {
      pnrLines = pnrData.map(String);
    } else if (typeof pnrData === "string") {
      pnrLines = pnrData.split("\n");
    } else if (typeof pnrData === "object" && pnrData !== null) {
      pnrLines = JSON.stringify(pnrData).split("\n");
    }

    if (!pnrLines.length) return null;

    /* ============================
     * Passenger
     * ============================ */

    const passengerLine = pnrLines.find((line) =>
      /^1\.\d+[A-Z]+\/[A-Z]+/.test(line),
    );

    const nameMatch = passengerLine?.match(
      /1\.\d*([A-Z]+)\/([A-Z]+)(?:\s+([A-Z]))?/,
    );

    const passengerName = nameMatch
      ? `${nameMatch[2]}${nameMatch[3] ? " " + nameMatch[3] : ""} ${nameMatch[1]}`
      : "";

    /* ============================
     * Flight
     * ============================ */

    const flightLine = pnrLines.find((line) =>
      /\d+\s+[A-Z0-9]{2}\s+\d+[A-Z]{1,2}\s+\d{1,2}[A-Z]{3}\s+[A-Z]{6}/.test(
        line,
      ),
    );

    const flightMatch = flightLine?.match(
      /(\d+)\s+([A-Z0-9]{2})\s+(\d+[A-Z]{1,2})\s+(\d{1,2}[A-Z]{3})\s+([A-Z]{3})([A-Z]{3})/,
    );

    const flightInfo: FlightInfo | null = flightMatch
      ? {
          airline: flightMatch[2],
          flightNumber: flightMatch[3],
          date: flightMatch[4],
          origin: flightMatch[5],
          destination: flightMatch[6],
        }
      : null;

    const result: PnrExtractionResult = {
      passengerName,
      flightInfo,
      rawText: pnrLines,
      hotelInfo: null,
      carRentalInfo: null,
      paymentInfo: null,
      pricingDetails: null,
      profileId: null,
    };

    /* ============================
     * Hotel
     * ============================ */

    if (pnrLines.some((l) => /HOTEL|ACCOMMODATION/i.test(l))) {
      result.hotelInfo = {
        name:
          extractField(pnrLines, /HOTEL\s*:\s*([^\n]+)/i) ??
          extractField(pnrLines, /ACCOMMODATION\s*AT\s*([^\n]+)/i),
        confirmation: extractField(pnrLines, /CONF\s*#\s*([A-Z0-9]+)/i),
        checkIn: parseSabreDate(
          extractField(pnrLines, /CHECK-?IN\s*:\s*(\d{1,2}[A-Z]{3})/i),
        ),
        checkOut: parseSabreDate(
          extractField(pnrLines, /CHECK-?OUT\s*:\s*(\d{1,2}[A-Z]{3})/i),
        ),
        roomType: extractField(pnrLines, /ROOM\s*TYPE\s*:\s*([^\n]+)/i),
        rate: Number(extractField(pnrLines, /RATE\s*:\s*([A-Z0-9.]+)/i)),
        status: "CONFIRMED",
      };
    }

    /* ============================
     * Car Rental
     * ============================ */

    if (pnrLines.some((l) => /CAR\s*RENTAL|CAR\s*HIRE/i.test(l))) {
      result.carRentalInfo = {
        company: extractField(pnrLines, /COMPANY\s*:\s*([^\n]+)/i),
        confirmation: extractField(pnrLines, /CONF\s*#\s*([A-Z0-9]+)/i),
        pickupLocation: extractField(pnrLines, /PICK-?UP\s*:\s*([^\n]+)/i),
        dropoffLocation: extractField(pnrLines, /DROP-?OFF\s*:\s*([^\n]+)/i),
        vehicleType: extractField(pnrLines, /VEHICLE\s*TYPE\s*:\s*([^\n]+)/i),
        rate: extractField(pnrLines, /RATE\s*:\s*([A-Z0-9.]+)/i),
        startDate: parseSabreDate(
          extractField(pnrLines, /FROM\s*:\s*(\d{1,2}[A-Z]{3})/i),
        ),
        endDate: parseSabreDate(
          extractField(pnrLines, /TO\s*:\s*(\d{1,2}[A-Z]{3})/i),
        ),
      };
    }

    /* ============================
     * Payment
     * ============================ */

    if (pnrLines.some((l) => /PAYMENT|FOP|CREDIT\s*CARD/i.test(l))) {
      result.paymentInfo = {
        type:
          extractField(pnrLines, /FORM\s*OF\s*PAYMENT\s*:\s*([^\n]+)/i) ??
          extractField(pnrLines, /PAYMENT\s*METHOD\s*:\s*([^\n]+)/i),
        cardType: extractField(pnrLines, /CARD\s*TYPE\s*:\s*([^\n]+)/i),
        lastFour: extractField(pnrLines, /[X*]+\s*(\d{4})/),
        authorization: extractField(pnrLines, /AUTH\s*CODE\s*:\s*([A-Z0-9]+)/i),
        amount: extractField(pnrLines, /AMOUNT\s*:\s*([A-Z0-9.]+)/i),
        currency: extractField(pnrLines, /CURRENCY\s*:\s*([A-Z]{3})/i) ?? "USD",
        status: extractField(pnrLines, /PAYMENT\s*STATUS\s*:\s*([^\n]+)/i),
      };
    }

    /* ============================
     * Pricing
     * ============================ */

    if (pnrLines.some((l) => /FARE|TOTAL|TAX/i.test(l))) {
      result.pricingDetails = {
        baseFare: extractNumericValue(
          pnrLines,
          /BASE\s*FARE\s*:\s*([0-9]+\.[0-9]{2})/i,
        ),
        taxes: extractNumericValue(pnrLines, /TAX\s*:\s*([0-9]+\.[0-9]{2})/i),
        fees: extractNumericValue(pnrLines, /FEES?\s*:\s*([0-9]+\.[0-9]{2})/i),
        total: extractNumericValue(
          pnrLines,
          /TOTAL\s*AMOUNT\s*:\s*([0-9]+\.[0-9]{2})/i,
        ),
        currency: extractField(pnrLines, /CURRENCY\s*:\s*([A-Z]{3})/i) ?? "USD",
        breakdown: extractPricingBreakdown(pnrLines),
      };
    }

    /* ============================
     * Profile ID
     * ============================ */

    for (const line of pnrLines) {
      const profileMatch = line.match(/PROFILE[\s:]+([A-Z0-9]+)/i);
      if (profileMatch) {
        result.profileId = profileMatch[1];
        break;
      }

      const uuidMatch = line.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      if (uuidMatch) {
        result.profileId = uuidMatch[0];
        break;
      }
    }

    return result;
  } catch (error) {
    console.error("Error extracting PNR details", error);
    return null;
  }
};

export const getDefaultOrganizationId = async (): Promise<string> => {
  // Return from memory if already loaded
  if (cachedOrganizationId) {
    return cachedOrganizationId;
  }

  try {
    const rows = await query<{ id: string }>(
      "SELECT id FROM core.organizations ORDER BY created_at LIMIT 1",
    );

    if (!rows.length) {
      throw new Error("No organizations found in DB");
    }

    // Store in memory
    cachedOrganizationId = rows[0].id;

    return cachedOrganizationId;
  } catch (error) {
    console.error("Error getting default organization ID:", error);
    throw error;
  }
};
