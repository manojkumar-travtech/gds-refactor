/**
 * Canonical Profile Data Model
 * This model represents a unified structure for profile data across all GDS systems
 * Aligned with the 'dimensions' schema and 'provenance' tracking.
 */

// ============================================================================
// PROVENANCE & METADATA
// ============================================================================

export interface ProvenanceRecord {
  source: GDSSource | 'USER' | 'ADMIN' | 'API' | 'SYSTEM';
  sourceId?: string;
  timestamp: Date;
  confidence?: number; // 0.0 to 1.0
  modifiedBy?: string; // User ID or System Process
}

export interface Provenance {
  [field: string]: ProvenanceRecord;
}

export interface WithProvenance {
  provenance?: Provenance;
}

// ============================================================================
// CORE PROFILE
// ============================================================================

export interface CanonicalProfile extends WithProvenance {
  // Core Identity
  id: string;
  profileName?: string;
  type: ProfileType;
  domain?: string;
  status: ProfileStatus; // Mapped to is_active in DB
  
  // Timestamps
  created?: Date;
  updated?: Date;
  deleted?: Date;

  // Personal Information
  personal: PersonalInfo;

  // Contact Information
  contact: ContactInfo;

  // Employment Information
  employment?: EmploymentInfo;

  // Emergency Contacts
  emergencyContacts?: EmergencyContact[];

  // Related Travelers
  relatedTravelers?: RelatedTraveler[];

  // Travel Policy
  travelPolicy?: TravelPolicy;

  // Tax Information
  taxInfo?: TaxInfo[];

  // Travel Documents
  documents: TravelDocument[];

  // Loyalty Programs
  loyalty: LoyaltyProgram[];

  // Payment Methods
  paymentMethods: PaymentMethod[];

  // Travel Preferences
  preferences: TravelPreferences;

  // Remarks and Notes
  remarks: Remark[];

  // Metadata
  metadata: ProfileMetadata;
}

// ============================================================================
// ENUMS (Aligned with dimensions schema)
// ============================================================================

export enum ProfileType {
  PERSONAL = 'personal',
  BUSINESS = 'business'
}

export enum ProfileStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DELETED = 'deleted',
  SUSPENDED = 'suspended'
}

export enum GDSSource {
  SABRE = 'sabre',
  AMADEUS = 'amadeus',
  GALILEO = 'galileo',
  WORLDSPAN = 'worldspan',
  APOLLO = 'apollo',
  OTHER = 'other'
}

export enum DocumentType {
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  NATIONAL_ID = 'national_id',
  VISA = 'visa',
  KNOWN_TRAVELER_NUMBER = 'known_traveler_number',
  REDRESS_NUMBER = 'redress_number',
  OTHER = 'other'
}

export enum BookingStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  BOOKED = 'booked',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

export enum SegmentType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
  CAR_RENTAL = 'car_rental',
  ACTIVITY = 'activity',
  TRANSFER = 'transfer',
  OTHER = 'other'
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  TRAVEL_MANAGER = 'travel_manager',
  TRAVELER = 'traveler',
  APPROVER = 'approver'
}

// ============================================================================
// SUB-INTERFACES
// ============================================================================

export interface PersonalInfo extends WithProvenance {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  title?: string;
  suffix?: string;
  dob?: Date;
  gender?: Gender;
  nationality?: string;
}

export enum Gender {
  MALE = 'M',
  FEMALE = 'F',
  OTHER = 'O',
  UNSPECIFIED = 'U'
}

export interface ContactInfo extends WithProvenance {
  emails: EmailAddress[];
  phones: PhoneNumber[];
  addresses: Address[];
}

export interface EmailAddress extends WithProvenance {
  type: string; // WORK, PERSONAL
  address: string;
  primary: boolean;
}

export interface PhoneNumber extends WithProvenance {
  type: string; // MOBILE, HOME, WORK
  number: string;
  countryCode?: string;
  extension?: string;
  primary?: boolean;
}

export interface Address extends WithProvenance {
  type: string; // HOME, WORK
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  primary?: boolean;
}

export interface EmploymentInfo extends WithProvenance {
  company?: string;
  title?: string;
  department?: string;
  employeeId?: string;
  costCenter?: string;
  division?: string;
  businessUnit?: string;
  projectID?: string;
  hireDate?: Date;
  location?: string;
  region?: string;
  isCurrent?: boolean;
}

export interface TravelPolicy {
  name: string;
  policyId?: string;
  allowance?: string;
  restrictions?: string[];
}

export interface TaxInfo {
  taxId: string;
  type: string;
  country?: string;
}

export interface EmergencyContact extends WithProvenance {
  firstName?: string;
  lastName?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address?: Address;
  primary?: boolean;
}

export interface RelatedTraveler {
  firstName?: string;
  lastName?: string;
  relationType?: string;
  phone?: string;
  email?: string;
}

export interface TravelDocument extends WithProvenance {
  type: DocumentType;
  number: string;
  issuingCountry?: string;
  citizenship?: string;
  issueDate?: Date;
  expirationDate?: Date;
  holderName?: string;
  isVerified?: boolean;
}

export interface LoyaltyProgram extends WithProvenance {
  programName: string;
  providerType: string; // AIRLINE, HOTEL, CAR
  providerName: string;
  number: string;
  tier?: string;
  expirationDate?: Date;
  pointsBalance?: number;
}

export interface PaymentMethod extends WithProvenance {
  type: PaymentType;
  cardType?: string;
  maskedNumber?: string;
  expirationMonth?: number;
  expirationYear?: number;
  holderName?: string;
  billingAddress?: Address;
  isCorporate?: boolean;
  isDefault?: boolean;
}

export enum PaymentType {
  CREDIT_CARD = 'CC',
  DEBIT_CARD = 'DC',
  INVOICE = 'INV',
  OTHER = 'OTH'
}

export interface TravelPreferences extends WithProvenance {
  airlines: AirlinePreference[];
  hotels: HotelPreference[];
  cars: CarPreference[];
  rail?: RailPreference[];
  general?: GeneralPreference[];
}

export interface AirlinePreference {
  airline?: string;
  level: PreferenceLevel;
  seat?: SeatPreference;
  meal?: string;
  specialService?: string[];
}

export interface SeatPreference {
  position?: SeatPosition;
  location?: SeatLocation;
  type?: string;
}

export enum SeatPosition {
  WINDOW = 'Window',
  AISLE = 'Aisle',
  MIDDLE = 'Middle',
  ANY = 'Any'
}

export enum SeatLocation {
  FRONT = 'Front',
  MIDDLE = 'Middle',
  REAR = 'Rear',
  EXIT_ROW = 'ExitRow',
  BULKHEAD = 'Bulkhead',
  ANY = 'Any'
}

export interface HotelPreference {
  chain?: string;
  level: PreferenceLevel;
  roomType?: string;
  smokingPreference?: SmokingPreference;
  bedType?: string;
}

export enum SmokingPreference {
  SMOKING = 'S',
  NON_SMOKING = 'NS',
  NO_PREFERENCE = 'N'
}

export interface CarPreference {
  vendor?: string;
  level: PreferenceLevel;
  vehicleType?: string;
  transmission?: TransmissionType;
}

export enum TransmissionType {
  AUTOMATIC = 'A',
  MANUAL = 'M',
  NO_PREFERENCE = 'N'
}

export interface RailPreference {
  vendor?: string;
  level: PreferenceLevel;
  seatType?: string;
  class?: string;
}

export interface GeneralPreference {
  category: string;
  type: string;
  value: string;
}

export enum PreferenceLevel {
  PREFERRED = 'Preferred',
  ACCEPTABLE = 'Acceptable',
  RESTRICTED = 'Restricted',
  EXCLUDED = 'Excluded'
}

export interface Remark {
  type: RemarkType;
  category?: string;
  text: string;
  timestamp?: Date;
  userId?: string;
}

export enum RemarkType {
  GENERAL = 'General',
  INVOICE = 'Invoice',
  ITINERARY = 'Itinerary',
  HISTORICAL = 'Historical',
  HIDDEN = 'Hidden',
  CORPORATE = 'Corporate',
  ACCOUNTING = 'Accounting'
}

export interface ProfileMetadata {
  sourceGDS: GDSSource;
  sourceId: string;
  sourcePCC: string;
  lastSyncDate?: Date;
  syncVersion?: string;
  completenessScore?: number;
  customFields?: Record<string, any>;
}

