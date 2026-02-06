import { CompletePNRData } from "./comprehensive-pnr-parser";

export interface PassengerUser {
  passengerId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  profileId?: string;

}export class PnrHelpersService {
 
  protected mapBookingStatus(status: string): string {
    const statusMap: Record<string, string> = {
      ticketed: "confirmed",
      confirmed: "confirmed",
      booked: "confirmed",
      pending: "pending",
      cancelled: "cancelled",
      draft: "draft",
      completed: "completed",
    };
    return statusMap[status?.toLowerCase()] || "draft";
  }

  protected mapFlightStatus(status: string): string {
    const statusMap: Record<string, string> = {
      HK: "confirmed",
      KK: "confirmed",
      OK: "confirmed",
      UN: "pending",
      UC: "pending",
      XX: "cancelled",
      HX: "cancelled",
    };
    return statusMap[status] || "booked";
  }

  protected mapHotelStatus(status: string): string {
    const statusMap: Record<string, string> = {
      HK: "confirmed",
      GK: "confirmed",
      OK: "confirmed",
      UC: "pending",
      XX: "cancelled",
    };
    return statusMap[status] || "booked";
  }

  protected mapCarStatus(status: string): string {
    const statusMap: Record<string, string> = {
      HK: "confirmed",
      GK: "confirmed",
      OK: "confirmed",
      UC: "pending",
      XX: "cancelled",
    };
    return statusMap[status] || "booked";
  }

  protected buildTripNotes(
    data: CompletePNRData,
    passengerUsers: PassengerUser[],
  ): string {
    const notes: string[] = [];
    
    if (data.booking?.receivedFrom) {
      notes.push(`Received from: ${data.booking.receivedFrom}`);
    }
    
    if (data.trip?.purpose?.description) {
      notes.push(data.trip.purpose.description);
    }

    if (data.trip?.approval?.approver) {
      notes.push(`Approver: ${data.trip.approval.approver}`);
    }

    // Add traveler information
    if (passengerUsers.length > 1) {
      const travelerNames = passengerUsers
        .map(p => `${p.firstName} ${p.lastName}`)
        .join(", ");
      notes.push(`Travelers (${passengerUsers.length}): ${travelerNames}`);
    }
    
    return notes.join("\n");
  }

  protected buildTripMetadata(
    data: CompletePNRData,
    passengerUsers: PassengerUser[],
  ): any {
    return {
      pnrData: {
        createdDate: data.booking?.createdDate,
        lastModifiedDate: data.booking?.lastModifiedDate,
        agencyPCC: data.booking?.agencyPCC,
        bookingSource: data.booking?.bookingSource,
        pnrSequence: data.booking?.pnrSequence,
      },
      tripDetails: {
        cities: data.trip?.cities || [],
        countries: data.trip?.countries || [],
        segments: data.trip?.segments,
        hotelSummary: data.trip?.hotelSummary,
        carSummary: data.trip?.carSummary,
      },
      travelers: passengerUsers.map(p => ({
        userId: p.userId,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        isPrimary: p.isPrimary,
        profileId: p.profileId,
      })),
      pricing: data.pricing,
      itineraryRemarks: data.remarks
        ?.filter(r => r.type === "ITINERARY")
        .map(r => r.text),
      inPolicy: data.trip?.inPolicy,
      policyViolations: data.trip?.policyViolations,
      parserVersion: data.parserVersion,
      parsedAt: data.parsedAt,
    };
  }
}
