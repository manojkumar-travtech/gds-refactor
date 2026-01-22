interface PnrData {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        Line?: Array<{ _: string }>;
      };
    };
  };
}

interface TravelerData {
  firstName?: string | null;
  lastName?: string | null;
  middleInitial?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null; // fallback combined name
  rawData: string;
}

/**
 * Extracts traveler data from PNR
 * @private
 * @param {PnrData} pnrData - The PNR data
 * @returns {TravelerData | null} Extracted traveler data or null if not found
 */
const extractTravelerData = (pnrData: PnrData): TravelerData | null => {
  try {
    const pnrText = pnrData.Envelope?.Body?.QueueAccessRS?.Line?.[0]?._;
    if (!pnrText) return null;

    // Try to match PNR name format "1. LAST/FIRST M"
    const nameMatch = pnrText.match(/1\.\s*([A-Z]+)\/([A-Z]+)(?:\s+([A-Z]))?/);
    if (!nameMatch) return null;

    const lastName = nameMatch[1];
    const firstName = nameMatch[2];
    const middleInitial = nameMatch[3] || null;

    const emailMatch = pnrText.match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    );
    const phoneMatch = pnrText.match(/\+?[\d\s-]{10,}/);

    return {
      firstName,
      lastName,
      middleInitial,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0].trim() : null,
      rawData: pnrText,
    };
  } catch (error) {
    console.error("Error extracting traveler info:", error);
    try {
      const pnrText = pnrData.Envelope?.Body?.QueueAccessRS?.Line?.[0]?._ || "";
      const emailMatch = pnrText.match(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      );
      const phoneMatch = pnrText.match(/\+?[\d\s-]{10,}/);
      const nameMatch = pnrText.match(/^\s*([A-Z]+)\s*\/\s*([A-Z]+)\s*$/m);

      const firstName = nameMatch ? nameMatch[2] : null;
      const lastName = nameMatch ? nameMatch[1] : null;

      return {
        name: nameMatch ? `${firstName} ${lastName}`.trim() : null,
        firstName,
        lastName,
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0].trim() : null,
        rawData: pnrText,
      };
    } catch (innerError) {
      console.error("Fallback traveler extraction failed:", innerError);
      return {
        name: null,
        firstName: null,
        lastName: null,
        middleInitial: null,
        email: null,
        phone: null,
        rawData: "",
      };
    }
  }
};

export { extractTravelerData, PnrData, TravelerData };
