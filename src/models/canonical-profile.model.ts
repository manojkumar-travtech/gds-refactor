export enum ProfileType {
  PERSONAL = "PERSONAL",
  BUSINESS = "BUSINESS",
  AGENCY = "AGENCY",
  GROUP = "GROUP",
}
export type SabreProfileType = "TVL" | "AGT" | "CRP" | "GRP" | string;

export enum ProfileStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING",
  SUSPENDED = "SUSPENDED",
  DELETED = "DELETED",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  UNSPECIFIED = "UNSPECIFIED",
}

export enum DocumentType {
  PASSPORT = "PASSPORT",
  VISA = "VISA",
  NATIONAL_ID = "NATIONAL_ID",
  DRIVERS_LICENSE = "DRIVERS_LICENSE",
  KNOWN_TRAVELER_NUMBER = "KNOWN_TRAVELER_NUMBER",
  REDRESS_NUMBER = "REDRESS_NUMBER",
  OTHER = "OTHER",
}

export enum PaymentType {
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  BANK_ACCOUNT = "BANK_ACCOUNT",
  OTHER = "OTHER",
}

export enum PreferenceLevel {
  PREFERRED = "PREFERRED",
  ACCEPTABLE = "ACCEPTABLE",
  RESTRICTED = "RESTRICTED",
  EXCLUDED = "EXCLUDED",
  UNSPECIFIED = "UNSPECIFIED",
}

export enum SeatPosition {
  WINDOW = "WINDOW",
  AISLE = "AISLE",
  MIDDLE = "MIDDLE",
  ANY = "ANY",
}

export enum SmokingPreference {
  SMOKING = "SMOKING",
  NON_SMOKING = "NON_SMOKING",
  NO_PREFERENCE = "NO_PREFERENCE",
}

export enum TransmissionType {
  AUTOMATIC = "AUTOMATIC",
  MANUAL = "MANUAL",
  NO_PREFERENCE = "NO_PREFERENCE",
}

export enum RemarkType {
  GENERAL = "GENERAL",
  INVOICE = "INVOICE",
  ITINERARY = "ITINERARY",
  HISTORICAL = "HISTORICAL",
  HIDDEN = "HIDDEN",
  CORPORATE = "CORPORATE",
  ACCOUNTING = "ACCOUNTING",
  PRIORITY = "PRIORITY",
}

export enum GDSSource {
  SABRE = "SABRE",
  AMADEUS = "AMADEUS",
  GALILEO = "GALILEO",
  WORLDSPAN = "WORLDSPAN",
  TRAVELPORT = "TRAVELPORT",
  OTHER = "OTHER",
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface PersonalInfo {
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  dob?: Date;
  gender?: Gender;
  nationality?: string;
  countryOfResidence?: string;
}

export interface EmailAddress {
  type: string;
  address: string;
  primary?: boolean;
  verified?: boolean;
}

export interface PhoneNumber {
  type: string;
  number: string;
  countryCode?: string;
  extension?: string;
  primary?: boolean;
  verified?: boolean;
}

export interface Address {
  type: string;
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  primary?: boolean;
  validated?: boolean;
}

export interface ContactInfo {
  emails: EmailAddress[];
  phones: PhoneNumber[];
  addresses: Address[];
}

export interface EmploymentInfo {
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
  manager?: string;
}

export interface EmergencyContact {
  firstName?: string;
  lastName?: string;
  title?: string;
  suffix?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address?: Address;
  dateOfBirth?: Date;
  primary?: boolean;
}

export interface RelatedTraveler {
  firstName?: string;
  lastName?: string;
  relationType?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: Date;
  profileId?: string;
}

export interface TravelDocument {
  type: DocumentType;
  number: string;
  issuingCountry?: string;
  citizenship?: string;
  effectiveDate?: Date;
  expirationDate?: Date;
  holderName?: string;
  issueLocation?: string;
  primary?: boolean;
}

export interface LoyaltyProgram {
  programName: string;
  providerType: string;
  providerName: string;
  number: string;
  tier?: string;
  expirationDate?: Date;
  primary?: boolean;
}

export interface PaymentMethod {
  type: PaymentType;
  cardType?: string;
  maskedNumber?: string;
  expiration?: string;
  holderName?: string;
  primary?: boolean;
}

export interface SeatPreference {
  position?: SeatPosition;
  location?: string;
  type?: string;
}

export interface AirlinePreference {
  airline?: string;
  level: PreferenceLevel;
  seat?: SeatPreference;
  meal?: string;
  specialService?: string[];
}

export interface HotelPreference {
  chain?: string;
  level: PreferenceLevel;
  roomType?: string;
  smokingPreference?: SmokingPreference;
  bedType?: string;
  floor?: string;
  maxRate?: string;
  currency?: string;
}

export interface CarPreference {
  vendor?: string;
  level: PreferenceLevel;
  vehicleType?: string;
  transmission?: TransmissionType;
  airConditioning?: boolean;
  maxRate?: string;
  currency?: string;
}

export interface TravelPreferences {
  airlines: AirlinePreference[];
  hotels: HotelPreference[];
  cars: CarPreference[];
}

export interface TravelPolicy {
  name: string;
  policyId?: string;
  allowance?: string;
  restrictions: string[];
  approvalRequired?: boolean;
}

export interface TaxInfo {
  taxId: string;
  type?: string;
  country?: string;
}

export interface Remark {
  type: RemarkType;
  category?: string;
  text: string;
  timestamp?: Date;
  userId?: string;
  source?: string;
}

export interface ProfileMetadata {
  sourceGDS: GDSSource;
  sourceId: string;
  sourcePCC: string;
  lastSyncDate: Date;
  syncVersion: string;
  customFields: Record<string, any>;
}

export interface CanonicalProfile {
  // Identity
  id: string;
  profileName?: string;
  type: SabreProfileType;
  domain?: string;
  status: ProfileStatus;
  created?: Date;
  updated?: Date;

  // Core Information
  personal: PersonalInfo;
  contact: ContactInfo;
  employment?: EmploymentInfo;

  // Relationships
  emergencyContacts: EmergencyContact[];
  relatedTravelers: RelatedTraveler[];

  // Travel Information
  documents: TravelDocument[];
  loyalty: LoyaltyProgram[];
  paymentMethods: PaymentMethod[];
  preferences: TravelPreferences;

  // Policy & Compliance
  travelPolicy?: TravelPolicy;
  taxInfo: TaxInfo[];

  // Additional Data
  remarks: Remark[];
  metadata: ProfileMetadata;
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationError {
  field?: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field?: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
