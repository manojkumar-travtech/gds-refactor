export interface PassengerDetails {
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
  email: string | null;
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

export interface PhoneNumber {
  id?: string;
  elementId?: string;
  index?: string;
  type: string;
  cityCode?: string;
  number: string;
  countryCode?: string;
  extension?: string;
}

export interface Address {
  id?: string;
  type: string;
  addressLines: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface PassportInfo {
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

export interface VisaInfo {
  id?: string;
  type: string;
  documentNumber: string;
  issuingCountry: string;
  applicableCountry: string;
  expirationDate?: string;
  placeOfIssue?: string;
}

export interface SeatAssignment {
  id?: string;
  segmentId?: string;
  seatNumber: string | null;
  status: string;
  boardPoint: string;
  offPoint: string;
  smoking: boolean;
  characteristics?: string[];
}

export interface TicketInfo {
  id?: string;
  elementId?: string;
  index?: string;
  ticketNumber: string;
  eTicketNumber?: string;
  transactionIndicator: string;
  validatingCarrier: string;
  passengerName: string;
  issueDate: string;
  agencyLocation: string;
  agentSine: string;
  dutyCode?: string;
  conjunctionTickets?: string[];
}

export interface SpecialRequest {
  id?: string;
  type: string;
  code: string;
  airlineCode?: string;
  actionCode?: string;
  status?: string;
  freeText?: string;
  fullText?: string;
  numberOfPassengers?: number;
  segmentAssociation?: string;
}

export interface FrequentFlyerInfo {
  airlineCode: string;
  number: string;
  tier?: string;
}

export interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
  email?: string;
}

export interface FlightSegment {
  id: string;
  sequence: number;
  segmentAssociationId: string;

  marketingAirline: string;
  marketingAirlineName?: string;
  operatingAirline: string;
  operatingAirlineName?: string;

  flightNumber: string;
  operatingFlightNumber?: string;

  departureAirport: string;
  departureAirportName?: string;
  arrivalAirport: string;
  arrivalAirportName?: string;

  departureDateTime: string;
  arrivalDateTime: string;
  departureDate: string;
  arrivalDate: string;
  departureTime: string;
  arrivalTime: string;
  dayOfWeek?: number;

  status: string;
  isPast: boolean;

  bookingClass: string;
  marketingClass?: string;
  operatingClass?: string;
  fareBasis?: string;

  equipmentType?: string;
  equipmentName?: string;

  duration?: number;
  distance?: number;
  meals?: string;
  codeShare: boolean;
  marriageGroup?: MarriageGroup;
  connections: ConnectionInfo;

  scheduleChange: boolean;
  bookingDate?: string;

  banner?: string;
  warnings?: string[];

  seats: SeatAssignment[];
}

export interface MarriageGroup {
  indicator: string;
  group: string;
  sequence: string;
}

export interface ConnectionInfo {
  inbound: boolean;
  outbound: boolean;
  connectionTime?: number;
}

export interface HotelSegment {
  id: string;
  sequence: number;

  name: string;
  chainCode?: string;
  chainName?: string;
  hotelCode?: string;

  cityCode: string;
  cityName?: string;
  address?: string;
  addressLines?: string[];
  postalCode?: string;
  countryCode?: string;
  countryName?: string;

  latitude?: number;
  longitude?: number;

  confirmationNumber?: string;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
  numberOfNights?: number;

  roomType?: string;
  roomDescription?: string;
  numberOfRooms: number;
  bedType?: string;
  smokingPreference?: string;

  rate?: string;
  rateBeforeTax?: string;
  totalAmount?: string;
  currency: string;
  ratePlan?: string;

  status: string;
  isPast: boolean;

  phone?: string;
  email?: string;
  website?: string;

  amenities?: string[];

  specialRequests?: string[];

  guarantee?: string;
  cancellationPolicy?: string;
  bookingDate?: string;

  // Guest information
  guestEmail?: string;
  guestName?: string;
  guestPhone?: string;

  rawData?: any;
}

export interface CarRentalSegment {
  id: string;
  sequence: number;

  vendor: string;
  vendorName?: string;
  confirmationNumber?: string;

  pickupLocation: string;
  pickupLocationName?: string;
  pickupAddress?: string;
  pickupDate: string;
  pickupTime?: string;

  returnLocation: string;
  returnLocationName?: string;
  returnAddress?: string;
  returnDate: string;
  returnTime?: string;

  rentalDays?: number;

  vehicleType?: string;
  vehicleClass?: string;
  vehicleDescription?: string;
  transmission?: string;
  fuelType?: string;
  airConditioning?: boolean;
  passengerCapacity?: number;

  rate?: string;
  ratePerDay?: string;
  estimatedTotal?: string;
  currency?: string;
  rateCode?: string;

  status: string;
  isPast: boolean;

  mileage?: string;
  insurance?: string[];
  specialEquipment?: string[];
  additionalDriver?: boolean;

  frequentRenterNumber?: string;

  // Renter information
  renterEmail?: string;
  renterName?: string;
  renterPhone?: string;

  bookingDate?: string;
}

export interface PaymentInfo {
  id?: string;
  elementId?: string;

  cardType: string;
  cardNumber: string;
  expiryMonth?: string;
  expiryYear?: string;
  cardHolderName?: string;

  authorizationCode?: string;
  authorizationAmount?: string;
  authorizationDate?: string;
  authorizationCurrency?: string;

  billingAddress?: Address;

  usageType: string;

  approved?: boolean;
  declineReason?: string;

  cvvProvided?: boolean;
  avsResult?: string;
}

export interface AccountingLine {
  id?: string;
  elementId?: string;
  index?: string;

  baseFare: number;
  taxAmount: number;
  totalAmount: number;
  currency?: string;

  commissionAmount?: number;
  commissionPercentage?: number;

  airlineDesignator: string;
  documentNumber: string;
  numberOfConjunctedDocuments?: number;

  passengerName: string;
  passengerType?: string;

  formOfPaymentCode: string;
  formOfPaymentType?: string;

  fareApplication?: string;
  tariffBasis?: string;
  tourCode?: string;
  endorsements?: string;
}

export interface PricingInfo {
  baseFare: number;
  totalTax: number;
  totalAmount: number;
  currency: string;

  taxes: TaxBreakdown[];
  fees: FeeBreakdown[];

  fareBasis?: string[];
  fareType?: string;
  refundable: boolean;
  changeable: boolean;
  penalties?: PenaltyInfo;

  validatingCarrier?: string;

  pricingDate?: string;
  ticketingDeadline?: string;

  lowestFare?: number;
  savings?: number;
  savingsPercentage?: number;
}

export interface TaxBreakdown {
  code: string;
  amount: number;
  currency?: string;
  description?: string;
}

export interface FeeBreakdown {
  type: string;
  amount: number;
  currency?: string;
  description?: string;
}

export interface PenaltyInfo {
  beforeDeparture?: {
    change?: number;
    cancel?: number;
  };
  afterDeparture?: {
    change?: number;
    cancel?: number;
  };
}

export interface BookingInfo {
  pnr: string;
  supplierPNR?: string;

  createdDate: string;
  createdTime?: string;
  createdBy: string;
  createdByAgent?: string;
  systemCreationDate?: string;

  lastModifiedDate: string;
  lastModifiedTime?: string;
  lastModifiedBy?: string;
  pnrSequence?: number;
  updateToken?: string;

  status: string;

  estimatedPurgeDate?: string;

  agencyPCC: string;
  agencyName?: string;
  homePCC?: string;
  agencyIATA?: string;
  agencyLocation?: string;

  primeHostId?: string;
  bookingSource?: string;

  firstDepartureDate?: string;
  lastArrivalDate?: string;
  travelDateRange?: {
    start: string;
    end: string;
  };

  numberOfPassengers: number;
  numberOfInfants: number;
  passengerMix?: string;

  queues?: QueueInfo[];

  receivedFrom?: string;

  corporateId?: string;
  corporateName?: string;

  ticketed: boolean;
  ticketingDate?: string;
  ticketNumbers: string[];

  isInternational: boolean;

  tripName?: string;
  tripNumber?: string;
  tripPurpose?: string;
  recordLocator?: string;
}

export interface QueueInfo {
  pcc: string;
  queueNumber: string;
  category?: string;
  dateTime: string;
  reason?: string;
}

export interface RemarkInfo {
  id?: string;
  elementId?: string;
  index?: string;
  type: string;
  code?: string;
  text: string;
  segmentAssociation?: string;
}

export interface CompletePNRData {
  booking: BookingInfo;

  passengers: PassengerDetails[];

  flights: FlightSegment[];
  hotels: HotelSegment[];
  cars: CarRentalSegment[];

  pricing: PricingInfo;
  accounting: AccountingLine[];
  payments: PaymentInfo[];

  remarks: RemarkInfo[];
  specialRequests: SpecialRequest[];

  trip: TripSummary;

  rawData: any;

  parsedAt: string;
  parserVersion: string;
}

export interface TripSummary {
  tripName: string;
  tripNumber?: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  duration?: number;
  isRoundTrip: boolean;
  isMultiCity: boolean;
  isInternational: boolean;
  cities: string[];
  countries: string[];

  estimatedCost: number;
  actualCost: number;
  currency: string;

  status: string;

  segments: {
    flights: number;
    hotels: number;
    cars: number;
  };

  hotelSummary?: {
    totalNights: number;
    numberOfHotels: number;
    cities: string[];
  };

  carSummary?: {
    totalRentalDays: number;
    numberOfRentals: number;
    vendors: string[];
    pickupLocations: string[];
    returnLocations: string[];
  };

  purpose?: {
    description?: string;
    reasonCode?: string;
    hotelCode?: string;
    carCode?: string;
  };

  approval?: {
    required: boolean;
    approver?: string;
    approvedAt?: string;
    approvalStatus?: string;
  };

  inPolicy: boolean;
  policyViolations?: string[];
}

export interface PassengerProfile {
  passengerId: string;
  profileId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  gdsProfileId?: string;
}
