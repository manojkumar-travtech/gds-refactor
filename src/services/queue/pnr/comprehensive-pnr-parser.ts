import { query } from "../../../config/database";
import logger from "../../../utils/logger";

interface PassengerDetails {
  id: string;
  nameId: string;
  nameAssocId: string;
  elementId: string;
  nameType: string;
  passengerType: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  title?: string;
  isPrimary: boolean;
  
  // Profile Information
  gdsProfileId?: string;
  profileId?: string;
  profileType?: string;
  
  // Contact Information
  emails: string[];
  phones: PhoneNumber[];
  addresses: Address[];
  
  // Travel Documents
  passports: PassportInfo[];
  visas: VisaInfo[];
  
  // Seat Information
  seats: SeatAssignment[];
  
  // Tickets
  tickets: TicketInfo[];
  
  // Special Requests
  specialRequests: SpecialRequest[];
  
  // Frequent Flyer
  frequentFlyer: FrequentFlyerInfo[];
  
  // Emergency Contact
  emergencyContacts: EmergencyContact[];
}

interface PhoneNumber {
  id?: string;
  elementId?: string;
  index?: string;
  type: string; // B=Business, C=Cell, H=Home, O=Other
  cityCode?: string;
  number: string;
  countryCode?: string;
  extension?: string;
}

interface Address {
  id?: string;
  type: string; // O=Office, H=Home, M=Mailing
  addressLines: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}

interface PassportInfo {
  id?: string;
  documentType: string;
  documentNumber: string;
  issuingCountry: string;
  nationality: string;
  expirationDate: string;
  dateOfBirth: string;
  gender: string;
  surname: string;
  givenName: string;
  middleName?: string;
}

interface VisaInfo {
  id?: string;
  type: string; // V=Visa, R=Residence Permit
  documentNumber: string;
  issuingCountry: string;
  applicableCountry: string;
  expirationDate?: string;
  placeOfIssue?: string;
}

interface SeatAssignment {
  id?: string;
  segmentId?: string;
  seatNumber: string | null; // Can be null if not assigned (especially problematic for past flights)
  status: string; // HK=Confirmed, UC=Unconfirmed, etc.
  boardPoint: string;
  offPoint: string;
  smoking: boolean;
  characteristics?: string[];
}

interface TicketInfo {
  id?: string;
  elementId?: string;
  index?: string;
  ticketNumber: string;
  eTicketNumber?: string;
  transactionIndicator: string; // TE=Electronic, TK=Manual
  validatingCarrier: string;
  passengerName: string;
  issueDate: string;
  agencyLocation: string;
  agentSine: string;
  dutyCode?: string;
  conjunctionTickets?: string[];
}

interface SpecialRequest {
  id?: string;
  type: string;
  code: string; // DOCS, DOCO, CTCE, CTCM, MEAL, etc.
  airlineCode?: string;
  actionCode?: string;
  status?: string;
  freeText?: string;
  fullText?: string;
  numberOfPassengers?: number;
  segmentAssociation?: string;
}

interface FrequentFlyerInfo {
  airlineCode: string;
  number: string;
  tier?: string;
}

interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
  email?: string;
}

interface FlightSegment {
  id: string;
  sequence: number;
  segmentAssociationId: string;
  
  // Airlines
  marketingAirline: string;
  marketingAirlineName?: string;
  operatingAirline: string;
  operatingAirlineName?: string;
  
  // Flight Details
  flightNumber: string;
  operatingFlightNumber?: string;
  
  // Airports
  departureAirport: string;
  departureAirportName?: string;
  arrivalAirport: string;
  arrivalAirportName?: string;
  
  // Times
  departureDateTime: string;
  arrivalDateTime: string;
  departureDate: string;
  arrivalDate: string;
  departureTime: string;
  arrivalTime: string;
  dayOfWeek?: number;
  
  // Status
  status: string; // HK, KK, etc.
  isPast: boolean;
  
  // Class & Booking
  bookingClass: string;
  marketingClass?: string;
  operatingClass?: string;
  fareBasis?: string;
  
  // Aircraft
  equipmentType?: string;
  equipmentName?: string;
  
  // Additional Info
  duration?: number; // in minutes
  distance?: number; // in miles/km
  meals?: string;
  codeShare: boolean;
  marriageGroup?: MarriageGroup;
  connections: ConnectionInfo;
  
  // Segment Status
  scheduleChange: boolean;
  bookingDate?: string;
  
  // Notes
  banner?: string;
  warnings?: string[];
  
  // Seats for this segment
  seats: SeatAssignment[];
}

interface MarriageGroup {
  indicator: string;
  group: string;
  sequence: string;
}

interface ConnectionInfo {
  inbound: boolean;
  outbound: boolean;
  connectionTime?: number; // in minutes
}

interface HotelSegment {
  id: string;
  sequence: number;
  
  // Hotel Details
  name: string;
  chainCode?: string;
  chainName?: string;
  hotelCode?: string;
  
  // Location
  cityCode: string;
  cityName?: string;
  address?: string;
  addressLines?: string[];
  postalCode?: string;
  countryCode?: string;
  countryName?: string;
  
  // Coordinates
  latitude?: number;
  longitude?: number;
  
  // Reservation
  confirmationNumber?: string;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
  numberOfNights?: number;
  
  // Room Details
  roomType?: string;
  roomDescription?: string;
  numberOfRooms: number;
  bedType?: string;
  smokingPreference?: string;
  
  // Rate
  rate?: string;
  rateBeforeTax?: string;
  totalAmount?: string;
  currency: string;
  ratePlan?: string;
  
  // Status
  status: string;
  isPast: boolean;
  
  // Contact
  phone?: string;
  email?: string;
  website?: string;
  
  // Amenities
  amenities?: string[];
  
  // Special Requests
  specialRequests?: string[];
  
  // Additional
  guarantee?: string;
  cancellationPolicy?: string;
  bookingDate?: string;
  
  rawData?: any;
}

interface CarRentalSegment {
  id: string;
  sequence: number;
  
  // Vendor
  vendor: string;
  vendorName?: string;
  confirmationNumber?: string;
  
  // Pickup
  pickupLocation: string;
  pickupLocationName?: string;
  pickupAddress?: string;
  pickupDate: string;
  pickupTime?: string;
  
  // Return
  returnLocation: string;
  returnLocationName?: string;
  returnAddress?: string;
  returnDate: string;
  returnTime?: string;
  
  // Duration
  rentalDays?: number;
  
  // Vehicle
  vehicleType?: string;
  vehicleClass?: string;
  vehicleDescription?: string;
  transmission?: string;
  fuelType?: string;
  airConditioning?: boolean;
  passengerCapacity?: number;
  
  // Rate
  rate?: string;
  ratePerDay?: string;
  estimatedTotal?: string;
  currency?: string;
  rateCode?: string;
  
  // Status
  status: string;
  isPast: boolean;
  
  // Additional
  mileage?: string;
  insurance?: string[];
  specialEquipment?: string[];
  additionalDriver?: boolean;
  
  // Loyalty
  frequentRenterNumber?: string;
  
  bookingDate?: string;
}

interface PaymentInfo {
  id?: string;
  elementId?: string;
  
  // Card Details
  cardType: string; // VI, CA, AX, etc.
  cardNumber: string; // Masked
  expiryMonth?: string;
  expiryYear?: string;
  cardHolderName?: string;
  
  // Authorization
  authorizationCode?: string;
  authorizationAmount?: string;
  authorizationDate?: string;
  authorizationCurrency?: string;
  
  // Billing
  billingAddress?: Address;
  
  // Usage
  usageType: string; // AL=All, FT=Flight Only, etc.
  
  // Status
  approved?: boolean;
  declineReason?: string;
  
  // Security
  cvvProvided?: boolean;
  avsResult?: string;
}

interface AccountingLine {
  id?: string;
  elementId?: string;
  index?: string;
  
  // Fare Details
  baseFare: number;
  taxAmount: number;
  totalAmount: number;
  currency?: string;
  
  // Commission
  commissionAmount?: number;
  commissionPercentage?: number;
  
  // Ticket Info
  airlineDesignator: string;
  documentNumber: string;
  numberOfConjunctedDocuments?: number;
  
  // Passenger
  passengerName: string;
  passengerType?: string;
  
  // Form of Payment
  formOfPaymentCode: string;
  formOfPaymentType?: string;
  
  // Additional
  fareApplication?: string; // ONE, ALL
  tariffBasis?: string;
  tourCode?: string;
  endorsements?: string;
}

interface PricingInfo {
  // Base Amounts
  baseFare: number;
  totalTax: number;
  totalAmount: number;
  currency: string;
  
  // Breakdown
  taxes: TaxBreakdown[];
  fees: FeeBreakdown[];
  
  // Fare Rules
  fareBasis?: string[];
  fareType?: string; // Published, Private, Negotiated
  refundable: boolean;
  changeable: boolean;
  penalties?: PenaltyInfo;
  
  // Validating Carrier
  validatingCarrier?: string;
  
  // Pricing Date
  pricingDate?: string;
  ticketingDeadline?: string;
  
  // Savings
  lowestFare?: number;
  savings?: number;
  savingsPercentage?: number;
}

interface TaxBreakdown {
  code: string;
  amount: number;
  currency?: string;
  description?: string;
}

interface FeeBreakdown {
  type: string;
  amount: number;
  currency?: string;
  description?: string;
}

interface PenaltyInfo {
  beforeDeparture?: {
    change?: number;
    cancel?: number;
  };
  afterDeparture?: {
    change?: number;
    cancel?: number;
  };
}

interface BookingInfo {
  // Record Locator
  pnr: string;
  supplierPNR?: string;
  
  // Creation
  createdDate: string;
  createdTime?: string;
  createdBy: string;
  createdByAgent?: string;
  systemCreationDate?: string;
  
  // Updates
  lastModifiedDate: string;
  lastModifiedTime?: string;
  lastModifiedBy?: string;
  pnrSequence?: number;
  updateToken?: string;
  
  // Status
  status: string; // booked, ticketed, completed, cancelled
  
  // Purge
  estimatedPurgeDate?: string;
  
  // Agency Information
  agencyPCC: string;
  agencyName?: string;
  homePCC?: string;
  agencyIATA?: string;
  agencyLocation?: string;
  
  // System
  primeHostId?: string;
  bookingSource?: string;
  
  // Travel Dates
  firstDepartureDate?: string;
  lastArrivalDate?: string;
  travelDateRange?: {
    start: string;
    end: string;
  };
  
  // Passenger Count
  numberOfPassengers: number;
  numberOfInfants: number;
  passengerMix?: string; // 1ADT, 2ADT1CNN, etc.
  
  // Queue Information
  queues?: QueueInfo[];
  
  // Received From
  receivedFrom?: string;
  
  // Corporate Information
  corporateId?: string;
  corporateName?: string;
  
  // Ticketing
  ticketed: boolean;
  ticketingDate?: string;
  ticketNumbers: string[];
  
  // International
  isInternational: boolean;
  
  // Trip Details
  tripName?: string;
  tripNumber?: string;
  tripPurpose?: string;
  recordLocator?: string;
}

interface QueueInfo {
  pcc: string;
  queueNumber: string;
  category?: string;
  dateTime: string;
  reason?: string;
}

interface RemarkInfo {
  id?: string;
  elementId?: string;
  index?: string;
  type: string; // CODED, INVOICE, ITINERARY, HS, etc.
  code?: string; // For coded remarks: A, B, C, H, Q, etc.
  text: string;
  segmentAssociation?: string;
}

export interface CompletePNRData {
  // Basic Info
  booking: BookingInfo;
  
  // Travelers
  passengers: PassengerDetails[];
  
  // Segments
  flights: FlightSegment[];
  hotels: HotelSegment[];
  cars: CarRentalSegment[];
  
  // Financial
  pricing: PricingInfo;
  accounting: AccountingLine[];
  payments: PaymentInfo[];
  
  // Additional Info
  remarks: RemarkInfo[];
  specialRequests: SpecialRequest[];
  
  // Trip Summary
  trip: TripSummary;
  
  // Raw Data
  rawData: any;
  
  // Metadata
  parsedAt: string;
  parserVersion: string;
}

interface TripSummary {
  tripName: string;
  tripNumber?: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  duration?: number; // days
  isRoundTrip: boolean;
  isMultiCity: boolean;
  isInternational: boolean;
  cities: string[];
  countries: string[];
  
  // Costs
  estimatedCost: number;
  actualCost: number;
  currency: string;
  
  // Status
  status: string;
  
  // Trip Components Summary
  segments: {
    flights: number;
    hotels: number;
    cars: number;
  };
  
  // Hotel Summary
  hotelSummary?: {
    totalNights: number;
    numberOfHotels: number;
    cities: string[];
  };
  
  // Car Rental Summary
  carSummary?: {
    totalRentalDays: number;
    numberOfRentals: number;
    vendors: string[];
    pickupLocations: string[];
    returnLocations: string[];
  };
  
  // Purpose
  purpose?: {
    description?: string;
    reasonCode?: string;
    hotelCode?: string;
    carCode?: string;
  };
  
  // Approval
  approval?: {
    required: boolean;
    approver?: string;
    approvedAt?: string;
    approvalStatus?: string;
  };
  
  // Policy
  inPolicy: boolean;
  policyViolations?: string[];
}

/**
 * ============================================================================
 * PARSER IMPLEMENTATION
 * ============================================================================
 */

export class ComprehensivePNRParser {
  private static readonly PARSER_VERSION = "2.0.0";
  
  /**
   * Main parsing function - extracts ALL information from PNR
   * Usage: ComprehensivePNRParser.parse(pnrData) - NO 'new' keyword needed
   */
  static async parse(pnrData: any): Promise<CompletePNRData> {
    try {
      logger.info("Starting comprehensive PNR parsing");
      
      // Extract reservation object
      const reservation = this.extractReservation(pnrData);
      
      if (!reservation) {
        throw new Error("Invalid PNR data structure - no reservation found");
      }
      
      // Parse all sections in parallel for performance
      const [
        booking,
        passengers,
        flights,
        hotels,
        cars,
        pricing,
        accounting,
        payments,
        remarks,
        specialRequests,
      ] = await Promise.all([
        this.parseBookingInfo(reservation),
        this.parsePassengers(reservation),
        this.parseFlights(reservation),
        this.parseHotels(reservation),
        this.parseCars(reservation),
        this.parsePricing(reservation),
        this.parseAccounting(reservation),
        this.parsePayments(reservation),
        this.parseRemarks(reservation),
        this.parseSpecialRequests(reservation),
      ]);
      
      // Generate trip summary
      const trip = this.generateTripSummary(
        booking,
        passengers,
        flights,
        hotels,
        cars,
        pricing,
        remarks
      );
      
      const result: CompletePNRData = {
        booking,
        passengers,
        flights,
        hotels,
        cars,
        pricing,
        accounting,
        payments,
        remarks,
        specialRequests,
        trip,
        rawData: pnrData,
        parsedAt: new Date().toISOString(),
        parserVersion: this.PARSER_VERSION,
      };
      
      logger.info("PNR parsing completed successfully", {
        pnr: booking.pnr,
        passengers: passengers.length,
        flights: flights.length,
        hotels: hotels.length,
        cars: cars.length,
      });
      
      return result;
    } catch (error) {
      logger.error("Comprehensive PNR parsing failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
  
  /**
   * Extract reservation object from various PNR formats
   */
  private static extractReservation(pnrData: any): any {
    // Handle different input formats
    if (pnrData?.["stl19:GetReservationRS"]?.["stl19:Reservation"]) {
      return pnrData["stl19:GetReservationRS"]["stl19:Reservation"];
    }
    
    if (pnrData?.rawData?.Envelope?.Body?.GetReservationRS?.Reservation) {
      return pnrData.rawData.Envelope.Body.GetReservationRS.Reservation;
    }
    
    if (pnrData?.Reservation) {
      return pnrData.Reservation;
    }
    
    if (pnrData?.BookingDetails) {
      return pnrData;
    }
    
    return null;
  }
  
  /**
   * Parse booking information
   */
  private static async parseBookingInfo(reservation: any): Promise<BookingInfo> {
    const bookingDetails = reservation["stl19:BookingDetails"] || reservation.BookingDetails;
    const pos = reservation["stl19:POS"] || reservation.POS;
    const source = pos?.["stl19:Source"] || pos?.Source;
    const receivedFrom = reservation["stl19:ReceivedFrom"] || reservation.ReceivedFrom;
    
    const segments = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.PassengerReservation?.Segments?.Segment ||
      reservation["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.Segments?.Segment
    );
    
    const flightsRange = bookingDetails?.["stl19:FlightsRange"] || bookingDetails?.FlightsRange;
    
    // Extract ticket numbers
    const ticketDetails = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:TicketingInfo"]?.["stl19:ETicketNumber"] ||
      reservation.PassengerReservation?.TicketingInfo?.ETicketNumber ||
      reservation["stl19:TicketingInfo"]?.["stl19:ETicketNumber"] ||
      reservation.TicketingInfo?.ETicketNumber
    );
    
    const ticketNumbers = ticketDetails
      .map((t: any) => {
        const text = t?._ || t;
        const match = text?.match(/\d{13,14}/);
        return match ? match[0] : null;
      })
      .filter(Boolean);
    
    // Check if ticketed
    const alreadyTicketed = reservation["stl19:PassengerReservation"]?.["stl19:TicketingInfo"]?.["stl19:AlreadyTicketed"] ||
                           reservation.PassengerReservation?.TicketingInfo?.AlreadyTicketed;
    
    // Get queue information
    const remarks = this.ensureArray(
      reservation["stl19:Remarks"]?.["stl19:Remark"] ||
      reservation.Remarks?.Remark
    );
    
    const queues: QueueInfo[] = [];
    for (const remark of remarks) {
      const text = this.getRemarkText(remark);
      if (text?.includes("QUE TO") || text?.includes("QUE FOR")) {
        const queueMatch = text.match(/(\w+)-(\d+)/);
        if (queueMatch) {
          queues.push({
            pcc: queueMatch[1],
            queueNumber: queueMatch[2],
            dateTime: bookingDetails?.["stl19:UpdateTimestamp"] || bookingDetails?.UpdateTimestamp || "",
            reason: text,
          });
        }
      }
    }
    
    // Corporate information
    const profiles = this.ensureArray(
      reservation["stl19:Profiles"]?.["stl19:Profile"] ||
      reservation.Profiles?.Profile
    );
    
    const corpProfile = profiles.find((p: any) => 
      (p.$?.type || p.type || p["stl19:ProfileType"]) === "CRP"
    );
    
    return {
      pnr: bookingDetails?.["stl19:RecordLocator"] || bookingDetails?.RecordLocator || "",
      createdDate: bookingDetails?.["stl19:CreationTimestamp"] || bookingDetails?.CreationTimestamp || "",
      createdBy: bookingDetails?.["stl19:CreationAgentID"] || bookingDetails?.CreationAgentID || "",
      systemCreationDate: bookingDetails?.["stl19:SystemCreationTimestamp"] || bookingDetails?.SystemCreationTimestamp,
      lastModifiedDate: bookingDetails?.["stl19:UpdateTimestamp"] || bookingDetails?.UpdateTimestamp || "",
      pnrSequence: parseInt(bookingDetails?.["stl19:PNRSequence"] || bookingDetails?.PNRSequence || "0"),
      updateToken: bookingDetails?.["stl19:UpdateToken"] || bookingDetails?.UpdateToken,
      status: this.determineBookingStatus(segments, alreadyTicketed),
      estimatedPurgeDate: bookingDetails?.["stl19:EstimatedPurgeTimestamp"] || bookingDetails?.EstimatedPurgeTimestamp,
      agencyPCC: source?.$?.PseudoCityCode || source?.PseudoCityCode || "",
      homePCC: source?.$?.HomePseudoCityCode || source?.HomePseudoCityCode,
      agencyLocation: source?.$?.AgentSine || source?.AgentSine,
      primeHostId: source?.$?.PrimeHostID || source?.PrimeHostID,
      bookingSource: source?.$?.BookingSource || source?.BookingSource,
      firstDepartureDate: flightsRange?.$?.Start || flightsRange?.Start,
      lastArrivalDate: flightsRange?.$?.End || flightsRange?.End,
      travelDateRange: flightsRange ? {
        start: flightsRange.$?.Start || flightsRange.Start || "",
        end: flightsRange.$?.End || flightsRange.End || "",
      } : undefined,
      numberOfPassengers: parseInt(reservation.$?.numberInParty || reservation.numberInParty || "0"),
      numberOfInfants: parseInt(reservation.$?.numberOfInfants || reservation.numberOfInfants || "0"),
      queues,
      receivedFrom: receivedFrom?.["stl19:Name"] || receivedFrom?.Name,
      corporateId: corpProfile?.["stl19:ProfileID"] || corpProfile?.ProfileID,
      ticketed: !!alreadyTicketed || ticketNumbers.length > 0,
      ticketingDate: alreadyTicketed?.["stl19:Code"] || alreadyTicketed?.Code,
      ticketNumbers,
      isInternational: remarks.some((r: any) => this.getRemarkText(r) === "*7-I"),
    };
  }
  
  /**
   * Parse passenger information with ALL details
   */
  private static async parsePassengers(reservation: any): Promise<PassengerDetails[]> {
    const passengersData = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:Passengers"]?.["stl19:Passenger"] ||
      reservation.PassengerReservation?.Passengers?.Passenger
    );
    
    if (passengersData.length === 0) {
      logger.warn("No passengers found in PNR");
      return [];
    }
    
    const passengers: PassengerDetails[] = [];
    const gdsProfileIds: string[] = [];
    
    for (const pax of passengersData) {
      const passenger = await this.parsePassengerDetails(pax, reservation);
      passengers.push(passenger);
      
      if (passenger.gdsProfileId) {
        gdsProfileIds.push(passenger.gdsProfileId);
      }
    }
    
    // Lookup profile IDs from database
    if (gdsProfileIds.length > 0) {
      try {
        const result = await query(
          `SELECT gds_profile_id, profile_id 
           FROM gds.gds_profiles 
           WHERE gds_profile_id = ANY($1)
           ORDER BY id DESC`,
          [gdsProfileIds]
        );
        
        const profileMap = new Map<string, string>();
        for (const row of result) {
          if (!profileMap.has(row.gds_profile_id)) {
            profileMap.set(row.gds_profile_id, row.profile_id);
          }
        }
        
        for (const passenger of passengers) {
          if (passenger.gdsProfileId) {
            passenger.profileId = profileMap.get(passenger.gdsProfileId) || undefined;
          }
        }
        
        logger.debug("Profile mapping completed", {
          mappedCount: profileMap.size,
          totalPassengers: passengers.length,
        });
      } catch (error) {
        logger.error("Failed to lookup profile IDs", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return passengers;
  }
  
  /**
   * Parse individual passenger with complete details
   */
  private static async parsePassengerDetails(pax: any, reservation: any): Promise<PassengerDetails> {
    // Basic info
    const attrs = pax.$ || {};
    const firstName = pax["stl19:FirstName"] || pax.FirstName || "";
    const lastName = pax["stl19:LastName"] || pax.LastName || "";
    
    // Get passenger identifiers for association matching
    const passengerId = attrs.id || "";
    const passengerNameId = attrs.nameId || "";
    const passengerNameAssocId = attrs.nameAssocId || "";
    const passengerNameNumber = attrs.nameNumber || "";
    
    // Use the most specific identifier available
    const primaryIdentifier = passengerNameNumber || passengerNameAssocId || passengerNameId || passengerId;
    
    logger.debug("Processing passenger", {
      name: `${firstName} ${lastName}`,
      id: passengerId,
      nameId: passengerNameId,
      nameAssocId: passengerNameAssocId,
      nameNumber: passengerNameNumber,
      primaryIdentifier,
    });
    
    // Profile information
    const profiles = this.ensureArray(pax["stl19:Profiles"]?.["stl19:Profile"] || pax.Profiles?.Profile);
    const reservationProfiles = this.ensureArray(
      reservation["stl19:Profiles"]?.["stl19:Profile"] || reservation.Profiles?.Profile
    );
    const allProfiles = [...profiles, ...reservationProfiles];
    const gdsProfileId = this.findGDSProfileId(allProfiles);
    
    // Special requests and APIS data
    const specialRequests = this.ensureArray(
      pax["stl19:SpecialRequests"]?.["stl19:GenericSpecialRequest"] ||
      pax.SpecialRequests?.GenericSpecialRequest ||
      []
    );
    
    const apisRequests = this.ensureArray(
      pax["stl19:SpecialRequests"]?.["stl19:APISRequest"] ||
      pax.SpecialRequests?.APISRequest ||
      []
    );
    
    // Extract passports
    const passports: PassportInfo[] = [];
    for (const apis of apisRequests) {
      const docsEntry = apis["stl19:DOCSEntry"] || apis.DOCSEntry;
      if (docsEntry && docsEntry["stl19:DocumentType"] === "P") {
        passports.push({
          id: docsEntry.$?.id || docsEntry.id,
          documentType: "P",
          documentNumber: docsEntry["stl19:DocumentNumber"] || docsEntry.DocumentNumber || "",
          issuingCountry: docsEntry["stl19:CountryOfIssue"] || docsEntry.CountryOfIssue || "",
          nationality: docsEntry["stl19:DocumentNationalityCountry"] || docsEntry.DocumentNationalityCountry || "",
          expirationDate: docsEntry["stl19:DocumentExpirationDate"] || docsEntry.DocumentExpirationDate || "",
          dateOfBirth: docsEntry["stl19:DateOfBirth"] || docsEntry.DateOfBirth || "",
          gender: docsEntry["stl19:Gender"] || docsEntry.Gender || "",
          surname: docsEntry["stl19:Surname"] || docsEntry.Surname || "",
          givenName: docsEntry["stl19:Forename"] || docsEntry.Forename || "",
          middleName: docsEntry["stl19:MiddleName"] || docsEntry.MiddleName,
        });
      }
    }
    
    // Extract visas
    const visas: VisaInfo[] = [];
    for (const apis of apisRequests) {
      const docoEntry = apis["stl19:DOCOEntry"] || apis.DOCOEntry;
      if (docoEntry) {
        const freeText = docoEntry["stl19:FreeText"] || docoEntry.FreeText || "";
        const visaMatch = freeText.match(/\/V\/(\d+)\/(\w+)\/\/(\w+)\/\/(\d+\w+\d+)/);
        if (visaMatch) {
          visas.push({
            id: docoEntry.$?.id || docoEntry.id,
            type: "V",
            documentNumber: visaMatch[1],
            issuingCountry: visaMatch[2],
            applicableCountry: visaMatch[3],
            expirationDate: visaMatch[4],
          });
        }
      }
    }
    
    // ========== EXTRACT EMAILS WITH PASSENGER ASSOCIATION ==========
    const emails: string[] = [];
    
    // First, try to get passenger-specific emails from the passenger object itself
    const passengerEmails = this.ensureArray(
      pax["stl19:EmailAddresses"]?.["stl19:EmailAddress"] ||
      pax.EmailAddresses?.EmailAddress ||
      []
    );
    
    for (const email of passengerEmails) {
      const address = email["stl19:Address"] || email.Address;
      if (address && !emails.includes(address)) {
        emails.push(address);
        logger.debug("Found passenger-specific email", {
          passenger: `${firstName} ${lastName}`,
          email: address,
          source: "passenger object",
        });
      }
    }
    
    // Then check reservation-level emails with passenger associations
    const reservationEmails = this.ensureArray(
      reservation["stl19:EmailAddresses"]?.["stl19:EmailAddress"] ||
      reservation.EmailAddresses?.EmailAddress ||
      []
    );
    
    for (const email of reservationEmails) {
      const address = email["stl19:Address"] || email.Address;
      const emailAttrs = email.$ || {};
      
      // Check various passenger reference fields
      const nameRefNumber = emailAttrs.nameRefNumber || email["stl19:NameRefNumber"] || email.NameRefNumber;
      const nameNumber = emailAttrs.nameNumber || email["stl19:NameNumber"] || email.NameNumber;
      const nameId = emailAttrs.nameId || email["stl19:NameId"] || email.NameId;
      const nameAssocId = emailAttrs.nameAssocId || email["stl19:NameAssocId"] || email.NameAssocId;
      
      // Check if this email is associated with this specific passenger
      const isAssociated = 
        nameRefNumber === primaryIdentifier ||
        nameNumber === primaryIdentifier ||
        nameId === primaryIdentifier ||
        nameAssocId === primaryIdentifier ||
        nameRefNumber === passengerId ||
        nameNumber === passengerNameNumber ||
        nameId === passengerNameId ||
        nameAssocId === passengerNameAssocId;
      
      // If no association specified, it's shared across all passengers (legacy format)
      const hasNoAssociation = !nameRefNumber && !nameNumber && !nameId && !nameAssocId;
      
      if (address && !emails.includes(address) && (isAssociated || hasNoAssociation)) {
        emails.push(address);
        logger.debug("Found email from reservation", {
          passenger: `${firstName} ${lastName}`,
          email: address,
          isAssociated,
          hasNoAssociation,
          nameRefNumber,
          nameNumber,
        });
      }
    }
    
    // Extract from special requests (CTCE - Contact Email)
    for (const sr of specialRequests) {
      const code = sr["stl19:Code"] || sr.Code;
      if (code === "CTCE") {
        const freeText = sr["stl19:FreeText"] || sr.FreeText || "";
        const emailMatch = freeText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        
        if (emailMatch && !emails.includes(emailMatch[1])) {
          emails.push(emailMatch[1]);
          logger.debug("Found email from CTCE special request", {
            passenger: `${firstName} ${lastName}`,
            email: emailMatch[1],
          });
        }
      }
    }
    
    // Also check reservation-level special requests with passenger associations
    const reservationSpecialRequests = this.ensureArray(
      reservation["stl19:SpecialRequests"]?.["stl19:GenericSpecialRequest"] ||
      reservation.SpecialRequests?.GenericSpecialRequest ||
      reservation["stl19:GenericSpecialRequests"] ||
      reservation.GenericSpecialRequests ||
      []
    );
    
    for (const sr of reservationSpecialRequests) {
      const code = sr["stl19:Code"] || sr.Code;
      if (code === "CTCE") {
        const srAttrs = sr.$ || {};
        const nameNumber = srAttrs.nameNumber || sr["stl19:NameNumber"] || sr.NameNumber;
        const nameRefNumber = srAttrs.nameRefNumber || sr["stl19:NameRefNumber"] || sr.NameRefNumber;
        
        const isAssociated = 
          nameNumber === passengerNameNumber ||
          nameRefNumber === primaryIdentifier ||
          (!nameNumber && !nameRefNumber); // No association means shared
        
        if (isAssociated) {
          const freeText = sr["stl19:FreeText"] || sr.FreeText || "";
          const emailMatch = freeText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          
          if (emailMatch && !emails.includes(emailMatch[1])) {
            emails.push(emailMatch[1]);
            logger.debug("Found email from reservation CTCE", {
              passenger: `${firstName} ${lastName}`,
              email: emailMatch[1],
              nameNumber,
            });
          }
        }
      }
    }
    
    // ========== EXTRACT PHONES WITH PASSENGER ASSOCIATION ==========
    const phones: PhoneNumber[] = [];
    
    // First, try passenger-specific phones
    const passengerPhones = this.ensureArray(
      pax["stl19:PhoneNumbers"]?.["stl19:PhoneNumber"] ||
      pax.PhoneNumbers?.PhoneNumber ||
      []
    );
    
    for (const phone of passengerPhones) {
      const number = phone["stl19:Number"] || phone.Number || "";
      const parts = number.split("-");
      phones.push({
        id: phone.$?.id,
        elementId: phone.$?.elementId,
        index: phone.$?.index,
        type: parts[parts.length - 1] || "O",
        cityCode: phone["stl19:CityCode"] || phone.CityCode,
        number: parts[0] || number,
        countryCode: phone["stl19:CountryCode"] || phone.CountryCode,
        extension: phone["stl19:Extension"] || phone.Extension,
      });
    }
    
    // Then check reservation-level phones with associations
    const reservationPhones = this.ensureArray(
      reservation["stl19:PhoneNumbers"]?.["stl19:PhoneNumber"] ||
      reservation.PhoneNumbers?.PhoneNumber ||
      []
    );
    
    for (const phone of reservationPhones) {
      const phoneAttrs = phone.$ || {};
      const nameRefNumber = phoneAttrs.nameRefNumber || phone["stl19:NameRefNumber"] || phone.NameRefNumber;
      const nameNumber = phoneAttrs.nameNumber || phone["stl19:NameNumber"] || phone.NameNumber;
      const nameId = phoneAttrs.nameId || phone["stl19:NameId"] || phone.NameId;
      
      const isAssociated = 
        nameRefNumber === primaryIdentifier ||
        nameNumber === passengerNameNumber ||
        nameId === passengerNameId ||
        (!nameRefNumber && !nameNumber && !nameId);
      
      if (isAssociated) {
        const number = phone["stl19:Number"] || phone.Number || "";
        const parts = number.split("-");
        
        // Check if this phone is already added
        const phoneExists = phones.some(p => p.number === (parts[0] || number));
        
        if (!phoneExists) {
          phones.push({
            id: phoneAttrs.id,
            elementId: phoneAttrs.elementId,
            index: phoneAttrs.index,
            type: parts[parts.length - 1] || "O",
            cityCode: phone["stl19:CityCode"] || phone.CityCode,
            number: parts[0] || number,
            countryCode: phone["stl19:CountryCode"] || phone.CountryCode,
            extension: phone["stl19:Extension"] || phone.Extension,
          });
        }
      }
    }
    
    // Extract from CTCM (Contact Mobile) special requests
    for (const sr of specialRequests) {
      const code = sr["stl19:Code"] || sr.Code;
      if (code === "CTCM") {
        const freeText = sr["stl19:FreeText"] || sr.FreeText || "";
        const phoneMatch = freeText.match(/\/(\d+)/);
        if (phoneMatch) {
          const phoneExists = phones.some(p => p.number === phoneMatch[1]);
          if (!phoneExists) {
            phones.push({
              type: "C",
              number: phoneMatch[1],
            });
          }
        }
      }
    }
    
    // Check reservation-level CTCM with associations
    for (const sr of reservationSpecialRequests) {
      const code = sr["stl19:Code"] || sr.Code;
      if (code === "CTCM") {
        const srAttrs = sr.$ || {};
        const nameNumber = srAttrs.nameNumber || sr["stl19:NameNumber"] || sr.NameNumber;
        
        const isAssociated = 
          nameNumber === passengerNameNumber ||
          !nameNumber;
        
        if (isAssociated) {
          const freeText = sr["stl19:FreeText"] || sr.FreeText || "";
          const phoneMatch = freeText.match(/\/(\d+)/);
          if (phoneMatch) {
            const phoneExists = phones.some(p => p.number === phoneMatch[1]);
            if (!phoneExists) {
              phones.push({
                type: "C",
                number: phoneMatch[1],
              });
            }
          }
        }
      }
    }
    
    // ========== EXTRACT ADDRESSES WITH PASSENGER ASSOCIATION ==========
    const addresses: Address[] = [];
    
    // First, try passenger-specific addresses
    const passengerAddresses = this.ensureArray(
      pax["stl19:Addresses"]?.["stl19:Address"] ||
      pax.Addresses?.Address ||
      []
    );
    
    for (const addr of passengerAddresses) {
      const addressLines = this.ensureArray(
        addr["stl19:AddressLines"]?.["stl19:AddressLine"] ||
        addr.AddressLines?.AddressLine ||
        []
      );
      addresses.push({
        id: addr.$?.id,
        type: addr.$?.type || addr["stl19:Type"] || addr.Type || "O",
        addressLines: addressLines.map((line: any) => 
          line["stl19:Text"] || line.Text || line
        ).filter(Boolean),
        city: addr["stl19:CityName"] || addr.CityName,
        state: addr["stl19:StateCode"] || addr.StateCode,
        postalCode: addr["stl19:PostalCode"] || addr.PostalCode,
        countryCode: addr["stl19:CountryCode"] || addr.CountryCode,
      });
    }
    
    // Then check reservation-level addresses with associations
    const reservationAddresses = this.ensureArray(
      reservation["stl19:Addresses"]?.["stl19:Address"] ||
      reservation.Addresses?.Address ||
      []
    );
    
    for (const addr of reservationAddresses) {
      const addrAttrs = addr.$ || {};
      const nameRefNumber = addrAttrs.nameRefNumber || addr["stl19:NameRefNumber"] || addr.NameRefNumber;
      const nameNumber = addrAttrs.nameNumber || addr["stl19:NameNumber"] || addr.NameNumber;
      const nameId = addrAttrs.nameId || addr["stl19:NameId"] || addr.NameId;
      
      const isAssociated = 
        nameRefNumber === primaryIdentifier ||
        nameNumber === passengerNameNumber ||
        nameId === passengerNameId ||
        (!nameRefNumber && !nameNumber && !nameId);
      
      if (isAssociated) {
        const addressLines = this.ensureArray(
          addr["stl19:AddressLines"]?.["stl19:AddressLine"] ||
          addr.AddressLines?.AddressLine ||
          []
        );
        
        // Check if this address is already added (simple check by first line)
        const firstLine = addressLines.map((line: any) => 
          line["stl19:Text"] || line.Text || line
        ).filter(Boolean)[0];
        
        const addressExists = addresses.some(a => a.addressLines[0] === firstLine);
        
        if (!addressExists) {
          addresses.push({
            id: addrAttrs.id,
            type: addrAttrs.type || addr["stl19:Type"] || addr.Type || "O",
            addressLines: addressLines.map((line: any) => 
              line["stl19:Text"] || line.Text || line
            ).filter(Boolean),
            city: addr["stl19:CityName"] || addr.CityName,
            state: addr["stl19:StateCode"] || addr.StateCode,
            postalCode: addr["stl19:PostalCode"] || addr.PostalCode,
            countryCode: addr["stl19:CountryCode"] || addr.CountryCode,
          });
        }
      }
    }
    
    // Extract seats
    const seats: SeatAssignment[] = [];
    const seatsData = this.ensureArray(
      pax["stl19:Seats"]?.["stl19:PreReservedSeats"]?.["stl19:PreReservedSeat"] ||
      pax.Seats?.PreReservedSeats?.PreReservedSeat ||
      []
    );
    for (const seat of seatsData) {
      seats.push({
        id: seat.$?.id,
        seatNumber: (seat["stl19:SeatNumber"] || seat.SeatNumber || "").trim(),
        status: seat["stl19:SeatStatusCode"] || seat.SeatStatusCode || "",
        boardPoint: seat["stl19:BoardPoint"] || seat.BoardPoint || "",
        offPoint: seat["stl19:OffPoint"] || seat.OffPoint || "",
        smoking: seat["stl19:SmokingPrefOfferedIndicator"] === "true",
      });
    }
    
    // Extract tickets
    const tickets: TicketInfo[] = [];
    const ticketingInfo = pax["stl19:TicketingInfo"] || pax.TicketingInfo;
    if (ticketingInfo) {
      const ticketDetails = this.ensureArray(
        ticketingInfo["stl19:TicketDetails"] || ticketingInfo.TicketDetails
      );
      for (const ticket of ticketDetails) {
        tickets.push({
          id: ticket.$?.id,
          elementId: ticket.$?.elementId,
          index: ticket.$?.index,
          ticketNumber: ticket["stl19:TicketNumber"] || ticket.TicketNumber || "",
          transactionIndicator: ticket["stl19:TransactionIndicator"] || ticket.TransactionIndicator || "",
          validatingCarrier: "", // Extract from accounting
          passengerName: ticket["stl19:PassengerName"] || ticket.PassengerName || "",
          issueDate: ticket["stl19:Timestamp"] || ticket.Timestamp || "",
          agencyLocation: ticket["stl19:AgencyLocation"] || ticket.AgencyLocation || "",
          agentSine: ticket["stl19:AgentSine"] || ticket.AgentSine || "",
          dutyCode: ticket["stl19:DutyCode"] || ticket.DutyCode,
        });
      }
    }
    
    // Extract special requests related to this passenger
    const passengerSpecialRequests: SpecialRequest[] = [];
    for (const sr of specialRequests) {
      passengerSpecialRequests.push({
        id: sr.$?.id,
        type: sr.$?.type,
        code: sr["stl19:Code"] || sr.Code || "",
        airlineCode: sr["stl19:AirlineCode"] || sr.AirlineCode,
        actionCode: sr["stl19:ActionCode"] || sr.ActionCode,
        freeText: sr["stl19:FreeText"] || sr.FreeText,
        fullText: sr["stl19:FullText"] || sr.FullText,
        numberOfPassengers: parseInt(sr["stl19:NumberInParty"] || sr.NumberInParty || "0"),
      });
    }
    
    // Frequent flyer (extract from remarks or special requests)
    const frequentFlyer: FrequentFlyerInfo[] = [];
    
    // Emergency contacts (extract from remarks)
    const emergencyContacts: EmergencyContact[] = [];
    
    // Log final passenger contact summary
    logger.debug("Passenger contact info extracted", {
      passenger: `${firstName} ${lastName}`,
      emailCount: emails.length,
      phoneCount: phones.length,
      addressCount: addresses.length,
    });
    
    return {
      id: attrs.id || "",
      nameId: attrs.nameId || "",
      nameAssocId: attrs.nameAssocId || "",
      elementId: attrs.elementId || "",
      nameType: attrs.nameType || "",
      passengerType: attrs.passengerType || "ADT",
      firstName,
      lastName,
      dateOfBirth: passports[0]?.dateOfBirth,
      gender: passports[0]?.gender,
      isPrimary: attrs.id === "60" || attrs.id === "64",
      gdsProfileId,
      profileType: allProfiles.find(p => p["stl19:ProfileID"] === gdsProfileId)?.["stl19:ProfileType"],
      emails,
      phones,
      addresses,
      passports,
      visas,
      seats,
      tickets,
      specialRequests: passengerSpecialRequests,
      frequentFlyer,
      emergencyContacts,
    };
  }
  
  /**
   * Parse flight segments with complete details
   */
  private static async parseFlights(reservation: any): Promise<FlightSegment[]> {
    const segments = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.PassengerReservation?.Segments?.Segment ||
      reservation["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.Segments?.Segment
    );
    
    const flights: FlightSegment[] = [];
    
    for (const seg of segments) {
      const air = seg["stl19:Air"] || seg.Air;
      if (!air) continue;
      
      const attrs = air.$ || seg.$ || {};
      
      // Parse dates and times
      const departureDateTime = air["stl19:DepartureDateTime"] || air.DepartureDateTime || "";
      const arrivalDateTime = air["stl19:ArrivalDateTime"] || air.ArrivalDateTime || "";
      
      const depDate = new Date(departureDateTime);
      const arrDate = new Date(arrivalDateTime);
      
      // Calculate duration
      const durationMinutes = Math.round((arrDate.getTime() - depDate.getTime()) / 60000);
      
      // Marriage group
      const marriageGrp = air["stl19:MarriageGrp"] || air.MarriageGrp;
      const marriageGroup = marriageGrp ? {
        indicator: marriageGrp["stl19:Ind"] || marriageGrp.Ind || "",
        group: marriageGrp["stl19:Group"] || marriageGrp.Group || "",
        sequence: marriageGrp["stl19:Sequence"] || marriageGrp.Sequence || "",
      } : undefined;
      
      // Extract seats for this segment
      const seats: SeatAssignment[] = [];
      const seatsData = this.ensureArray(
        air["stl19:Seats"]?.["stl19:PreReservedSeats"]?.["stl19:PreReservedSeat"] ||
        air.Seats?.PreReservedSeats?.PreReservedSeat
      );
      
      const isPastFlight = (attrs.isPast || air["stl19:isPast"] || air.isPast) === "true";
      
      for (const seat of seatsData) {
        const seatNumber = (seat["stl19:SeatNumber"] || seat.SeatNumber || "").trim();
        const status = seat["stl19:SeatStatusCode"] || seat.SeatStatusCode || "";
        
        // Validate: Past flights should have confirmed seat assignments
        if (isPastFlight && (seatNumber === "0" || seatNumber === "" || status === "UC")) {
          logger.warn("Past flight missing seat assignment", {
            flightNumber: air["stl19:FlightNumber"] || air.FlightNumber,
            route: `${air["stl19:DepartureAirport"] || air.DepartureAirport}-${air["stl19:ArrivalAirport"] || air.ArrivalAirport}`,
            seatNumber,
            status,
            message: "Flight already departed but seat not assigned or data not updated in PNR"
          });
        }
        
        seats.push({
          id: seat.$?.id,
          seatNumber: seatNumber === "0" ? null : seatNumber, // Convert "0" to null for clarity
          status,
          boardPoint: seat["stl19:BoardPoint"] || seat.BoardPoint || "",
          offPoint: seat["stl19:OffPoint"] || seat.OffPoint || "",
          smoking: seat["stl19:SmokingPrefOfferedIndicator"] === "true",
        });
      }
      
      // Validate and add warnings for data quality issues
      const warnings: string[] = [];
      
      // Check for missing seat assignments on past flights
      if (isPastFlight) {
        const hasValidSeats = seats.some(s => s.seatNumber && s.seatNumber !== "0" && s.status !== "UC");
        if (!hasValidSeats) {
          warnings.push("Flight has departed but seat assignments are missing or unconfirmed");
        }
      }
      
      flights.push({
        id: attrs.id || "",
        sequence: parseInt(attrs.sequence || seg.$?.sequence || "0"),
        segmentAssociationId: attrs.segmentAssociationId || "",
        marketingAirline: air["stl19:MarketingAirlineCode"] || air.MarketingAirlineCode || "",
        marketingAirlineName: this.getAirlineName(air["stl19:MarketingAirlineCode"] || air.MarketingAirlineCode),
        operatingAirline: air["stl19:OperatingAirlineCode"] || air.OperatingAirlineCode || "",
        operatingAirlineName: air["stl19:OperatingAirlineShortName"] || air.OperatingAirlineShortName,
        flightNumber: air["stl19:FlightNumber"] || air.FlightNumber || air["stl19:MarketingFlightNumber"] || air.MarketingFlightNumber || "",
        operatingFlightNumber: air["stl19:OperatingFlightNumber"] || air.OperatingFlightNumber,
        departureAirport: air["stl19:DepartureAirport"] || air.DepartureAirport || "",
        arrivalAirport: air["stl19:ArrivalAirport"] || air.ArrivalAirport || "",
        departureDateTime,
        arrivalDateTime,
        departureDate: depDate.toISOString().split('T')[0],
        arrivalDate: arrDate.toISOString().split('T')[0],
        departureTime: depDate.toISOString().split('T')[1]?.slice(0, 5) || "",
        arrivalTime: arrDate.toISOString().split('T')[1]?.slice(0, 5) || "",
        dayOfWeek: parseInt(attrs.DayOfWeekInd || "0"),
        status: air["stl19:ActionCode"] || air.ActionCode || "HK",
        isPast: isPastFlight,
        bookingClass: air["stl19:ClassOfService"] || air.ClassOfService || air["stl19:ResBookDesigCode"] || air.ResBookDesigCode || "",
        marketingClass: air["stl19:MarketingClassOfService"] || air.MarketingClassOfService,
        operatingClass: air["stl19:OperatingClassOfService"] || air.OperatingClassOfService,
        equipmentType: air["stl19:EquipmentType"] || air.EquipmentType,
        equipmentName: this.getEquipmentName(air["stl19:EquipmentType"] || air.EquipmentType),
        duration: durationMinutes,
        codeShare: (attrs.CodeShare || air["stl19:CodeShare"] || air.CodeShare) === "true",
        marriageGroup,
        connections: {
          inbound: (air["stl19:inboundConnection"] || air.inboundConnection) === "true",
          outbound: (air["stl19:outboundConnection"] || air.outboundConnection) === "true",
        },
        scheduleChange: (air["stl19:ScheduleChangeIndicator"] || air.ScheduleChangeIndicator) === "true",
        bookingDate: air["stl19:SegmentBookedDate"] || air.SegmentBookedDate,
        banner: air["stl19:Banner"] || air.Banner,
        warnings,
        seats,
      });
    }
    
    return flights;
  }
  
  /**
   * Parse hotel segments
   */
  private static async parseHotels(reservation: any): Promise<HotelSegment[]> {
    const segments = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.PassengerReservation?.Segments?.Segment ||
      reservation["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.Segments?.Segment
    );
    
    const hotels: HotelSegment[] = [];
    
    for (const seg of segments) {
      const hotel = seg["stl19:Hotel"] || seg.Hotel;
      if (!hotel) continue;
      
      const hotelRes = hotel["stl19:Reservation"] || hotel.Reservation;
      const addInfo = hotel["stl19:AdditionalInformation"] || hotel.AdditionalInformation;
      
      if (!hotelRes) continue;
      
      const checkIn = hotelRes["stl19:TimeSpanStart"] || hotelRes.TimeSpanStart || "";
      const checkOut = hotelRes["stl19:TimeSpanEnd"] || hotelRes.TimeSpanEnd || "";
      
      // Calculate nights
      let numberOfNights: number | undefined;
      if (checkIn && checkOut) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        numberOfNights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Address
      const address = addInfo?.["stl19:Address"] || addInfo?.Address;
      const addressLines = this.ensureArray(
        address?.["stl19:AddressLine"] || address?.AddressLine
      );
      
      hotels.push({
        id: seg.$?.id || "",
        sequence: parseInt(seg.$?.sequence || "0"),
        name: hotelRes["stl19:HotelName"] || hotelRes.HotelName || "",
        chainCode: hotelRes["stl19:ChainCode"] || hotelRes.ChainCode,
        hotelCode: hotelRes["stl19:HotelCode"] || hotelRes.HotelCode,
        cityCode: hotelRes["stl19:HotelCityCode"] || hotelRes.HotelCityCode || "",
        address: addressLines.join(", ") || undefined,
        addressLines: addressLines.length > 0 ? addressLines : undefined,
        countryCode: address?.["stl19:CountryCode"] || address?.CountryCode,
        confirmationNumber: addInfo?.["stl19:ConfirmationNumber"]?._ || addInfo?.ConfirmationNumber?._,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numberOfNights,
        roomType: hotelRes["stl19:RoomType"]?.["stl19:RoomTypeCode"] || hotelRes.RoomType?.RoomTypeCode,
        numberOfRooms: parseInt(
          hotelRes["stl19:RoomType"]?.["stl19:NumberOfUnits"] ||
          hotelRes.RoomType?.NumberOfUnits ||
          "1"
        ),
        rate: hotelRes["stl19:RoomRates"]?.["stl19:AmountBeforeTax"] || hotelRes.RoomRates?.AmountBeforeTax,
        rateBeforeTax: hotelRes["stl19:RoomRates"]?.["stl19:AmountBeforeTax"] || hotelRes.RoomRates?.AmountBeforeTax,
        currency: hotelRes["stl19:RoomRates"]?.["stl19:CurrencyCode"] || hotelRes.RoomRates?.CurrencyCode || "USD",
        status: hotelRes["stl19:LineStatus"] || hotelRes.LineStatus || "HK",
        isPast: (hotel["stl19:isPast"] || hotel.isPast) === "true",
        rawData: hotelRes,
      });
    }
    
    return hotels;
  }
  
  /**
   * Parse car rental segments
   */
  private static async parseCars(reservation: any): Promise<CarRentalSegment[]> {
    const segments = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.PassengerReservation?.Segments?.Segment ||
      reservation["stl19:Segments"]?.["stl19:Segment"] ||
      reservation.Segments?.Segment
    );
    
    const cars: CarRentalSegment[] = [];
    
    for (const seg of segments) {
      const vehicle = seg["stl19:Vehicle"] || seg.Vehicle;
      if (!vehicle) continue;
      
      const pickupDate = vehicle["stl19:PickUpDateTime"] || vehicle.PickUpDateTime || "";
      const returnDate = vehicle["stl19:ReturnDateTime"] || vehicle.ReturnDateTime || "";
      
      // Calculate rental days
      let rentalDays: number | undefined;
      if (pickupDate && returnDate) {
        const pickup = new Date(pickupDate);
        const returnDt = new Date(returnDate);
        rentalDays = Math.ceil((returnDt.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      cars.push({
        id: seg.$?.id || "",
        sequence: parseInt(seg.$?.sequence || "0"),
        vendor: vehicle["stl19:VendorCode"] || vehicle.VendorCode || "",
        confirmationNumber: vehicle["stl19:ConfId"] || vehicle.ConfId,
        pickupLocation: vehicle["stl19:PickUpLocation"]?.["stl19:LocationCode"] || vehicle.PickUpLocation?.LocationCode || "",
        returnLocation: vehicle["stl19:ReturnLocation"]?.["stl19:LocationCode"] || vehicle.ReturnLocation?.LocationCode || "",
        pickupDate,
        returnDate,
        rentalDays,
        rate: vehicle["stl19:RentalRate"]?.["stl19:VehicleCharges"]?.["stl19:ApproximateTotalChargeAmount"] ||
              vehicle.RentalRate?.VehicleCharges?.ApproximateTotalChargeAmount,
        status: vehicle["stl19:LineStatus"] || vehicle.LineStatus || "HK",
        isPast: (vehicle["stl19:isPast"] || vehicle.isPast) === "true",
      });
    }
    
    return cars;
  }
  
  /**
   * Parse pricing information
   */
  private static async parsePricing(reservation: any): Promise<PricingInfo> {
    const accountingLines = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:AccountingLines"]?.["stl19:AccountingLine"] ||
      reservation.PassengerReservation?.AccountingLines?.AccountingLine ||
      reservation["stl19:AccountingLines"]?.["stl19:AccountingLine"] ||
      reservation.AccountingLines?.AccountingLine
    );
    
    let baseFare = 0;
    let totalTax = 0;
    let currency = "USD";
    
    for (const line of accountingLines) {
      const base = parseFloat(line["stl19:BaseFare"] || line.BaseFare || "0");
      const tax = parseFloat(line["stl19:TaxAmount"] || line.TaxAmount || "0");
      baseFare += base;
      totalTax += tax;
    }
    
    const totalAmount = baseFare + totalTax;
    
    // Check refundability from remarks
    const remarks = this.ensureArray(
      reservation["stl19:Remarks"]?.["stl19:Remark"] ||
      reservation.Remarks?.Remark
    );
    
    const refundable = remarks.some((r: any) => {
      const text = this.getRemarkText(r);
      return text?.includes("*45-R");
    });
    
    return {
      baseFare: Number(baseFare.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      currency,
      taxes: [],
      fees: [],
      refundable: !refundable, // R means non-refundable
      changeable: true, // Default
    };
  }
  
  /**
   * Parse accounting lines
   */
  private static async parseAccounting(reservation: any): Promise<AccountingLine[]> {
    const accountingData = this.ensureArray(
      reservation["stl19:PassengerReservation"]?.["stl19:AccountingLines"]?.["stl19:AccountingLine"] ||
      reservation.PassengerReservation?.AccountingLines?.AccountingLine ||
      reservation["stl19:AccountingLines"]?.["stl19:AccountingLine"] ||
      reservation.AccountingLines?.AccountingLine
    );
    
    const accounting: AccountingLine[] = [];
    
    for (const line of accountingData) {
      const attrs = line.$ || {};
      const baseFare = parseFloat(line["stl19:BaseFare"] || line.BaseFare || "0");
      const taxAmount = parseFloat(line["stl19:TaxAmount"] || line.TaxAmount || "0");
      
      accounting.push({
        id: attrs.id,
        elementId: attrs.elementId,
        index: attrs.index,
        baseFare,
        taxAmount,
        totalAmount: baseFare + taxAmount,
        commissionAmount: parseFloat(line["stl19:CommissionAmount"] || line.CommissionAmount || "0"),
        airlineDesignator: line["stl19:AirlineDesignator"] || line.AirlineDesignator || "",
        documentNumber: line["stl19:DocumentNumber"] || line.DocumentNumber || "",
        numberOfConjunctedDocuments: parseInt(
          line["stl19:NumberOfConjunctedDocuments"] || line.NumberOfConjunctedDocuments || "0"
        ),
        passengerName: line["stl19:PassengerName"] || line.PassengerName || "",
        formOfPaymentCode: line["stl19:FormOfPaymentCode"] || line.FormOfPaymentCode || "",
        fareApplication: line["stl19:FareApplication"] || line.FareApplication,
        tariffBasis: line["stl19:TarriffBasis"] || line.TarriffBasis,
      });
    }
    
    return accounting;
  }
  
  /**
   * Parse payment information
   */
  private static async parsePayments(reservation: any): Promise<PaymentInfo[]> {
    const payments: PaymentInfo[] = [];
    
    // Extract from OpenReservationElements
    const openElements = this.ensureArray(
      reservation["stl19:OpenReservationElements"]?.["or114:OpenReservationElement"] ||
      reservation.OpenReservationElements?.OpenReservationElement
    );
    
    for (const elem of openElements) {
      const attrs = elem.$ || {};
      if (attrs.type === "FP") {
        const fop = elem["or114:FormOfPayment"] || elem.FormOfPayment;
        const paymentCard = fop?.["or114:PaymentCard"] || fop?.PaymentCard;
        
        if (paymentCard) {
          payments.push({
            id: attrs.id,
            elementId: attrs.elementId,
            cardType: paymentCard["or114:CardCode"] || paymentCard.CardCode || "",
            cardNumber: paymentCard["or114:CardNumber"]?._ || paymentCard.CardNumber?._ || "",
            expiryMonth: paymentCard["or114:ExpiryMonth"] || paymentCard.ExpiryMonth,
            expiryYear: paymentCard["or114:ExpiryYear"] || paymentCard.ExpiryYear,
            usageType: "AL", // Default
          });
        }
      }
    }
    
    // Extract authorization info from remarks
    const remarks = this.ensureArray(
      reservation["stl19:Remarks"]?.["stl19:Remark"] ||
      reservation.Remarks?.Remark
    );
    
    for (const remark of remarks) {
      const text = this.getRemarkText(remark);
      if (text?.startsWith("AUTH-")) {
        // Parse authorization details
        const authMatch = text.match(/AUTH-(.+?)\/(.+?)\/(\d+[A-Z]{3})\/(\d+)/);
        if (authMatch && payments.length > 0) {
          payments[0].authorizationCode = authMatch[4];
          payments[0].authorizationDate = authMatch[3];
        }
      }
    }
    
    return payments;
  }
  
  /**
   * Parse remarks
   */
  private static async parseRemarks(reservation: any): Promise<RemarkInfo[]> {
    const remarksData = this.ensureArray(
      reservation["stl19:Remarks"]?.["stl19:Remark"] ||
      reservation.Remarks?.Remark
    );
    
    const remarks: RemarkInfo[] = [];
    
    for (const remark of remarksData) {
      const attrs = remark.$ || {};
      const text = this.getRemarkText(remark);
      
      if (text) {
        remarks.push({
          id: attrs.id,
          elementId: attrs.elementId,
          index: attrs.index,
          type: attrs.type || "GENERAL",
          code: attrs.code,
          text,
          segmentAssociation: attrs.segmentNumber,
        });
      }
    }
    
    return remarks;
  }
  
  /**
   * Parse special requests
   */
  private static async parseSpecialRequests(reservation: any): Promise<SpecialRequest[]> {
    const specialRequests: SpecialRequest[] = [];
    
    // From GenericSpecialRequests
    const genericRequests = this.ensureArray(
      reservation["stl19:GenericSpecialRequests"] ||
      reservation.GenericSpecialRequests
    );
    
    for (const req of genericRequests) {
      const attrs = req.$ || {};
      specialRequests.push({
        id: attrs.id,
        type: attrs.type || "G",
        code: req["stl19:Code"] || req.Code || "",
        airlineCode: req["stl19:AirlineCode"] || req.AirlineCode,
        freeText: req["stl19:FreeText"] || req.FreeText,
        fullText: req["stl19:FullText"] || req.FullText,
      });
    }
    
    return specialRequests;
  }
  
  /**
   * Generate trip summary
   */
  private static generateTripSummary(
    booking: BookingInfo,
    passengers: PassengerDetails[],
    flights: FlightSegment[],
    hotels: HotelSegment[],
    cars: CarRentalSegment[],
    pricing: PricingInfo,
    remarks: RemarkInfo[]
  ): TripSummary {
    // Extract trip name
    const tripNameRemark = remarks.find(r => r.text?.startsWith("CB/TRP/"));
    const tripName = tripNameRemark 
      ? tripNameRemark.text!.replace("CB/TRP/", "").trim()
      : passengers[0] 
        ? `Trip for ${passengers[0].firstName} ${passengers[0].lastName}`
        : "Business Trip";
    
    // Extract trip number
    const tripNumberRemark = remarks.find(r => r.text?.startsWith("CB/TRIPLOC/"));
    const tripNumber = tripNumberRemark
      ? tripNumberRemark.text!.replace("CB/TRIPLOC/", "").trim()
      : undefined;
    
    // Origin and destination
    const origin = flights[0]?.departureAirport || "";
    const destination = flights[flights.length - 1]?.arrivalAirport || "";
    
    // Dates
    const departureDate = flights[0]?.departureDateTime || "";
    const returnDate = flights[flights.length - 1]?.arrivalDateTime;
    
    // Calculate duration
    let duration: number | undefined;
    if (departureDate && returnDate) {
      const dep = new Date(departureDate);
      const ret = new Date(returnDate);
      duration = Math.ceil((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // Collect cities and countries
    const cities = new Set<string>();
    const countries = new Set<string>();
    
    for (const flight of flights) {
      cities.add(flight.departureAirport);
      cities.add(flight.arrivalAirport);
    }
    
    for (const hotel of hotels) {
      if (hotel.cityCode) cities.add(hotel.cityCode);
      if (hotel.countryCode) countries.add(hotel.countryCode);
    }
    
    // Add car rental locations to cities
    for (const car of cars) {
      if (car.pickupLocation) cities.add(car.pickupLocation);
      if (car.returnLocation) cities.add(car.returnLocation);
    }
    
    // Trip type
    const isRoundTrip = flights.length >= 2 && 
                        flights[0].departureAirport === flights[flights.length - 1].arrivalAirport;
    const isMultiCity = cities.size > 2;
    
    // ========== HOTEL SUMMARY ==========
    let hotelSummary: TripSummary['hotelSummary'];
    if (hotels.length > 0) {
      const totalNights = hotels.reduce((sum, hotel) => {
        return sum + (hotel.numberOfNights || 0);
      }, 0);
      
      const hotelCities = new Set<string>();
      hotels.forEach(h => {
        if (h.cityCode) hotelCities.add(h.cityCode);
      });
      
      hotelSummary = {
        totalNights,
        numberOfHotels: hotels.length,
        cities: Array.from(hotelCities),
      };
      
      logger.debug("Hotel summary generated", {
        totalNights,
        numberOfHotels: hotels.length,
      });
    }
    
    // ========== CAR RENTAL SUMMARY ==========
    let carSummary: TripSummary['carSummary'];
    if (cars.length > 0) {
      const totalRentalDays = cars.reduce((sum, car) => {
        return sum + (car.rentalDays || 0);
      }, 0);
      
      const vendors = new Set<string>();
      const pickupLocations = new Set<string>();
      const returnLocations = new Set<string>();
      
      cars.forEach(car => {
        if (car.vendor) vendors.add(car.vendor);
        if (car.pickupLocation) pickupLocations.add(car.pickupLocation);
        if (car.returnLocation) returnLocations.add(car.returnLocation);
      });
      
      carSummary = {
        totalRentalDays,
        numberOfRentals: cars.length,
        vendors: Array.from(vendors),
        pickupLocations: Array.from(pickupLocations),
        returnLocations: Array.from(returnLocations),
      };
      
      logger.debug("Car rental summary generated", {
        totalRentalDays,
        numberOfRentals: cars.length,
        vendors: Array.from(vendors),
      });
    }
    
    // Purpose
    const purposeDescription = tripName;
    const hotelCodeRemark = remarks.find(r => r.text?.includes("*35-"));
    const carCodeRemark = remarks.find(r => r.text?.includes("*53-"));
    
    // Approval
    const approverRemark = remarks.find(r => r.text?.includes("DESIGNATED APPROVER-"));
    const finishingRemark = remarks.find(r => r.text?.includes("FINISHING COMPLETE"));
    
    let approvedAt: string | undefined;
    if (finishingRemark) {
      const dateMatch = finishingRemark.text?.match(/\d{1,2}\s\d{1,2}\s\d{4}/);
      if (dateMatch) {
        approvedAt = new Date(dateMatch[0]).toISOString();
      }
    }
    
    // Policy compliance
    const inPolicy = !remarks.some(r => 
      r.text?.includes("OUT OF POLICY") || r.text?.includes("POLICY VIOLATION")
    );
    
    return {
      tripName,
      tripNumber,
      origin,
      destination,
      departureDate,
      returnDate,
      duration,
      isRoundTrip,
      isMultiCity,
      isInternational: booking.isInternational,
      cities: Array.from(cities),
      countries: Array.from(countries),
      estimatedCost: pricing.totalAmount,
      actualCost: pricing.totalAmount,
      currency: pricing.currency,
      status: booking.status,
      segments: {
        flights: flights.length,
        hotels: hotels.length,
        cars: cars.length,
      },
      hotelSummary,
      carSummary,
      purpose: {
        description: purposeDescription,
        hotelCode: hotelCodeRemark?.text?.split("-")[1],
        carCode: carCodeRemark?.text?.split("-")[1],
      },
      approval: {
        required: !remarks.some(r => r.text?.includes("NO NN")),
        approver: approverRemark?.text?.split("-")[1]?.trim(),
        approvedAt,
      },
      inPolicy,
    };
  }
  
  /**
   * Utility: Ensure array
   */
  private static ensureArray<T>(item: T | T[] | undefined): T[] {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }
  
  /**
   * Utility: Get remark text
   */
  private static getRemarkText(remark: any): string | undefined {
    return remark["stl19:RemarkLines"]?.["stl19:RemarkLine"]?.["stl19:Text"] ||
           remark.RemarkLines?.RemarkLine?.Text ||
           remark.RemarkLines?.RemarkLine;
  }
  
  /**
   * Utility: Find GDS Profile ID
   */
  private static findGDSProfileId(profiles: any[]): string | undefined {
    // Priority: TVL > CRP > AGY
    const tvlProfile = profiles.find(p => 
      (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "TVL"
    );
    if (tvlProfile) {
      return tvlProfile["stl19:ProfileID"] || tvlProfile.ProfileID;
    }
    
    const crpProfile = profiles.find(p => 
      (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "CRP"
    );
    if (crpProfile) {
      return crpProfile["stl19:ProfileID"] || crpProfile.ProfileID;
    }
    
    const agyProfile = profiles.find(p => 
      (p["stl19:ProfileType"] || p.ProfileType || p.$?.type) === "AGY"
    );
    if (agyProfile) {
      return agyProfile["stl19:ProfileID"] || agyProfile.ProfileID;
    }
    
    return profiles[0]?.["stl19:ProfileID"] || profiles[0]?.ProfileID;
  }
  
  /**
   * Utility: Determine booking status
   */
  private static determineBookingStatus(segments: any[], ticketed: any): string {
    if (ticketed) return "ticketed";
    
    const isPast = segments.some((seg: any) => {
      const air = seg["stl19:Air"] || seg.Air;
      const hotel = seg["stl19:Hotel"] || seg.Hotel;
      const vehicle = seg["stl19:Vehicle"] || seg.Vehicle;
      
      return air?.isPast === "true" || hotel?.isPast === "true" || vehicle?.isPast === "true";
    });
    
    if (isPast) return "completed";
    
    const cancelled = segments.some((seg: any) => {
      const air = seg["stl19:Air"] || seg.Air;
      const hotel = seg["stl19:Hotel"] || seg.Hotel;
      const vehicle = seg["stl19:Vehicle"] || seg.Vehicle;
      
      const status = air?.ActionCode || hotel?.Reservation?.LineStatus || vehicle?.LineStatus;
      return ["XX", "HX", "NO", "XL"].includes(status);
    });
    
    if (cancelled) return "cancelled";
    
    return "booked";
  }
  
  /**
   * Utility: Get airline name
   */
  private static getAirlineName(code?: string): string | undefined {
    const airlines: Record<string, string> = {
      "KQ": "Kenya Airways",
      "AA": "American Airlines",
      "UA": "United Airlines",
      "DL": "Delta Air Lines",
      "BA": "British Airways",
      "AF": "Air France",
      "LH": "Lufthansa",
      "EK": "Emirates",
      "QR": "Qatar Airways",
      "ET": "Ethiopian Airlines",
      "TK": "Turkish Airlines",
      // Add more as needed
    };
    return code ? airlines[code] : undefined;
  }
  
  /**
   * Utility: Get equipment name
   */
  private static getEquipmentName(code?: string): string | undefined {
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
  
  /**
   * Utility: Validate seat assignments and generate report
   */
  static validateSeatAssignments(data: CompletePNRData): {
    valid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    for (const flight of data.flights) {
      // Check past flights
      if (flight.isPast) {
        const hasValidSeats = flight.seats.some(
          s => s.seatNumber && s.seatNumber !== "0" && s.status !== "UC"
        );
        
        if (!hasValidSeats) {
          issues.push(
            `Flight ${flight.marketingAirline}${flight.flightNumber} (${flight.departureAirport}-${flight.arrivalAirport}) ` +
            `departed on ${flight.departureDate} but has no seat assignments`
          );
          recommendations.push(
            `Retrieve boarding pass or contact airline ${flight.marketingAirline} for actual seat assignment on flight ${flight.flightNumber}`
          );
        } else {
          // Check if seats are unconfirmed
          const unconfirmedSeats = flight.seats.filter(s => s.status === "UC");
          if (unconfirmedSeats.length > 0) {
            issues.push(
              `Flight ${flight.marketingAirline}${flight.flightNumber} has unconfirmed seat status despite being in the past`
            );
          }
        }
      }
      
      // Check future flights
      if (!flight.isPast) {
        const hasAssignedSeats = flight.seats.some(
          s => s.seatNumber && s.seatNumber !== "0"
        );
        
        if (!hasAssignedSeats) {
          recommendations.push(
            `Upcoming flight ${flight.marketingAirline}${flight.flightNumber} (${flight.departureDate}): ` +
            `Assign seats via airline website or at check-in`
          );
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }
  
  /**
   * Utility: Get seat map summary
   */
  static getSeatSummary(data: CompletePNRData): {
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
    const details = data.flights.map(f => {
      const seatNumbers = f.seats
        .map(s => s.seatNumber)
        .filter(s => s && s !== "0") as string[];
      
      return {
        flight: `${f.marketingAirline}${f.flightNumber}`,
        route: `${f.departureAirport}-${f.arrivalAirport}`,
        date: f.departureDate,
        isPast: f.isPast,
        seatNumbers,
        hasSeats: seatNumbers.length > 0,
      };
    });
    
    const flightsWithSeats = details.filter(d => d.hasSeats).length;
    const flightsWithoutSeats = details.filter(d => !d.hasSeats).length;
    const pastFlightsMissingSeats = details.filter(d => d.isPast && !d.hasSeats).length;
    
    return {
      totalFlights: data.flights.length,
      flightsWithSeats,
      flightsWithoutSeats,
      pastFlightsMissingSeats,
      details,
    };
  }
}

/**
 * ============================================================================
 * EXPORT - Main parsing function for backward compatibility
 * ============================================================================
 */

export const parsePNRDetails = async (pnrData: any) => {
  try {
    const result = await ComprehensivePNRParser.parse(pnrData);
    
    // Return in legacy format for compatibility
    return {
      pnr: result.booking.pnr,
      tripName: result.trip.tripName,
      tripNumber: result.trip.tripNumber,
      status: result.booking.status,
      isInternational: result.booking.isInternational,
      departureDate: result.trip.departureDate,
      returnDate: result.trip.returnDate,
      originCity: result.trip.origin,
      destinationCity: result.trip.destination,
      costs: {
        estimated: result.pricing.totalAmount,
        actual: result.pricing.totalAmount,
      },
      purpose: result.trip.purpose,
      approval: result.trip.approval,
      approvedAt: result.trip.approval?.approvedAt,
      flightInfo: result.flights.map(f => ({
        airline: f.marketingAirline,
        flightNumber: f.flightNumber,
        origin: f.departureAirport,
        destination: f.arrivalAirport,
        departure: f.departureDateTime,
        arrivalDate: f.arrivalDateTime,
        status: f.status,
        classOfService: f.bookingClass,
        seatNumber: f.seats[0]?.seatNumber || null,
        notes: f.banner,
      })),
      hotelInfo: result.hotels.map(h => ({
        name: h.name,
        hotelChain: h.chainCode,
        confirmation: h.confirmationNumber,
        checkInDate: h.checkInDate,
        checkOutDate: h.checkOutDate,
        city: h.cityCode,
        address: h.address,
        country: h.countryCode,
        rate: h.rate,
        currency: h.currency,
        roomType: h.roomType,
        numberOfRooms: h.numberOfRooms,
        status: h.status,
        rawData: h.rawData,
      })),
      carRentalInfo: result.cars.map(c => ({
        vendor: c.vendor,
        confirmation: c.confirmationNumber,
        pickupLocation: c.pickupLocation,
        returnLocation: c.returnLocation,
        pickupDate: c.pickupDate,
        returnDate: c.returnDate,
        status: c.status,
        rate: c.rate,
      })),
      travelers: result.passengers.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        gdsProfileId: p.gdsProfileId,
        profileId: p.profileId,
        isPrimary: p.isPrimary,
      })),
      rawData: result.rawData,
      trips: result.trip,
      
      // Add complete parsed data
      completeParsedData: result,
    };
  } catch (error) {
    logger.error("PNR parsing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: (error as Error).message };
  }
};