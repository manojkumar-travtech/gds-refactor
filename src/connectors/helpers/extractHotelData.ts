import { HotelSegment } from "../../types/hotelDetails.types";

interface PnrData {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        Line?: Array<{ _: string }>;
      };
    };
  };
}


/**
 * Extracts hotel data from PNR
 * @private
 * @param {PnrData} pnrData - The PNR data
 * @returns {HotelSegment[]} Array of hotel segments
 */
const extractHotelData = (pnrData: PnrData): HotelSegment[] => {
  try {
    const pnrText = pnrData.Envelope?.Body?.QueueAccessRS?.Line?.[0]?._;
    if (!pnrText) return [];

    const lines = pnrText.split("\n");
    const hotelSegments: HotelSegment[] = [];
    let currentHotel: HotelSegment | null = null;

    const hotelChainPatterns = [
      "MARRIOTT",
      "HILTON",
      "HYATT",
      "IHG",
      "ACCOR",
      "BEST WESTERN",
      "WYNDHAM",
      "INTERCONTINENTAL",
      "SHERATON",
      "WESTIN",
      "RITZ-CARLTON",
      "FOUR SEASONS",
      "HOLIDAY INN",
      "CROWNE PLAZA",
      "COURTYARD",
      "FAIRMONT",
      "MANDARIN ORIENTAL",
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();

      const confirmationMatch = trimmedLine.match(
        /(?:CONF|CONFIRMATION|RESERVATION)[#: ]*([A-Z0-9]{6,})/i,
      );
      const isHotelLine = hotelChainPatterns.some((chain) =>
        trimmedLine.toUpperCase().includes(chain),
      );
      const dateRangeMatch = trimmedLine.match(
        /(\d{1,2}[A-Z]{3})\s*-\s*(\d{1,2}[A-Z]{3})/i,
      );
      const roomTypeMatch = trimmedLine.match(
        /(?:ROOM|RM) TYPE[: ]*([A-Z\s]+)/i,
      );

      if (confirmationMatch && !currentHotel) {
        currentHotel = {
          confirmationNumber: confirmationMatch[1],
          name: "",
          checkInDate: null,
          checkOutDate: null,
          roomType: null,
          status: "CONFIRMED",
        };
      } else if (isHotelLine && currentHotel) {
        currentHotel.name = trimmedLine;
      } else if (dateRangeMatch && currentHotel) {
        currentHotel.checkInDate = dateRangeMatch[1];
        currentHotel.checkOutDate = dateRangeMatch[2];
      } else if (roomTypeMatch && currentHotel) {
        currentHotel.roomType = roomTypeMatch[1].trim();
      } else if (trimmedLine === "" && currentHotel) {
        hotelSegments.push(currentHotel);
        currentHotel = null;
      }
    }

    if (currentHotel) {
      hotelSegments.push(currentHotel);
    }

    console.log(`Extracted ${hotelSegments.length} hotel segments from PNR`);
    return hotelSegments;
  } catch (error) {
    console.error("Error extracting hotel data:", error);
    return [];
  }
};

export { extractHotelData, PnrData, HotelSegment };
