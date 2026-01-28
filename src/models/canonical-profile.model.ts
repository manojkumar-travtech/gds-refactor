/**
 * Canonical Profile Model
 *
 * This module defines the standardized profile structure that all GDS-specific
 * profiles are parsed into. This allows for consistent handling of traveler
 * data regardless of the source system.
 *
 * @module models/canonical-profile
 */

/**
 * Profile type classification
 */
export enum ProfileType {
  PERSONAL = "PERSONAL",
  BUSINESS = "BUSINESS",
  GROUP = "GROUP",
  AGENCY = "AGENCY",
}

/**
 * Profile status
 */
export enum ProfileStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  DELETED = "DELETED",
  PENDING = "PENDING",
}

/**
 * Gender specification
 */
export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  UNSPECIFIED = "UNSPECIFIED",
  OTHER = "OTHER",
}

/**
 * Travel document types
 */
export enum DocumentType {
  PASSPORT = "PASSPORT",
  VISA = "VISA",
  NATIONAL_ID = "NATIONAL_ID",
  DRIVERS_LICENSE = "DRIVERS_LICENSE",
  KNOWN_TRAVELER_NUMBER = "KNOWN_TRAVELER_NUMBER",
  REDRESS_NUMBER = "REDRESS_NUMBER",
  OTHER = "OTHER",
}

/**
 * Payment method types
 */
export enum PaymentType {
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  BANK_ACCOUNT = "BANK_ACCOUNT",
  TRAVEL_ACCOUNT = "TRAVEL_ACCOUNT",
  CORPORATE_CARD = "CORPORATE_CARD",
  OTHER = "OTHER",
}

/**
 * Preference level for travel preferences
 */
export enum PreferenceLevel {
  PREFERRED = "PREFERRED",
  ACCEPTABLE = "ACCEPTABLE",
  RESTRICTED = "RESTRICTED",
  EXCLUDED = "EXCLUDED",
  UNSPECIFIED = "UNSPECIFIED",
}

/**
 * Seat position preferences
 */
export enum SeatPosition {
  WINDOW = "WINDOW",
  AISLE = "AISLE",
  MIDDLE = "MIDDLE",
  ANY = "ANY",
}

/**
 * Smoking preferences
 */
export enum SmokingPreference {
  SMOKING = "SMOKING",
  NON_SMOKING = "NON_SMOKING",
  NO_PREFERENCE = "NO_PREFERENCE",
}

/**
 * Vehicle transmission type
 */
export enum TransmissionType {
  AUTOMATIC = "AUTOMATIC",
  MANUAL = "MANUAL",
  NO_PREFERENCE = "NO_PREFERENCE",
}

/**
 * Remark/note types
 */
export enum RemarkType {
  GENERAL = "GENERAL",
  INVOICE = "INVOICE",
  ITINERARY = "ITINERARY",
  HISTORICAL = "HISTORICAL",
  HIDDEN = "HIDDEN",
  CORPORATE = "CORPORATE",
  ACCOUNTING = "ACCOUNTING",
  CUSTOM = "CUSTOM",
}

/**
 * Source GDS system
 */
export enum GDSSource {
  SABRE = "SABRE",
  AMADEUS = "AMADEUS",
  GALILEO = "GALILEO",
  WORLDSPAN = "WORLDSPAN",
  APOLLO = "APOLLO",
  OTHER = "OTHER",
}

/**
 * Personal information
 */
export interface PersonalInfo {
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  preferredName?: string;
  dob?: Date;
  gender?: Gender;
  nationality?: string;
}

/**
 * Email address
 */
export interface EmailAddress {
  type: string;
  address: string;
  primary?: boolean;
  verified?: boolean;
}

/**
 * Phone number
 */
export interface PhoneNumber {
  type: string;
  number: string;
  countryCode?: string;
  extension?: string;
  primary?: boolean;
  verified?: boolean;
}

/**
 * Physical address
 */
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

/**
 * Contact information
 */
export interface ContactInfo {
  emails: EmailAddress[];
  phones: PhoneNumber[];
  addresses: Address[];
}

/**
 * Employment information
 */
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

/**
 * Emergency contact
 */
export interface EmergencyContact {
  firstName?: string;
  lastName?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address?: Address;
  primary?: boolean;
}

/**
 * Related traveler
 */
export interface RelatedTraveler {
  firstName?: string;
  lastName?: string;
  relationType?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: Date;
  profileId?: string;
}

/**
 * Travel document
 */
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
  issueDate?: Date;
}

/**
 * Loyalty program membership
 */
export interface LoyaltyProgram {
  programName: string;
  providerType: string;
  providerName: string;
  number: string;
  tier?: string;
  expirationDate?: Date;
  primary?: boolean;
}

/**
 * Payment method
 */
export interface PaymentMethod {
  type: PaymentType;
  cardType?: string;
  maskedNumber?: string;
  expiration?: string;
  holderName?: string;
  billingAddress?: Address;
  primary?: boolean;
  expirationMonth?: number;
  expirationYear?: number;
}

/**
 * Seat preference details
 */
export interface SeatPreference {
  position?: SeatPosition;
  location?: string;
  type?: string;
  characteristics?: string[];
}

/**
 * Airline preference
 */
export interface AirlinePreference {
  airline?: string;
  level?: PreferenceLevel;
  seat?: SeatPreference;
  meal?: string;
  specialService?: string[];
  notes?: string;
}

/**
 * Hotel preference
 */
export interface HotelPreference {
  chain?: string;
  level?: PreferenceLevel;
  roomType?: string;
  smokingPreference?: SmokingPreference;
  bedType?: string;
  floor?: string;
  amenities?: string[];
  notes?: string;
}

/**
 * Car rental preference
 */
export interface CarPreference {
  vendor?: string;
  level?: PreferenceLevel;
  vehicleType?: string;
  transmission?: TransmissionType;
  airConditioning?: boolean;
  notes?: string;
}

/**
 * Travel preferences
 */
export interface TravelPreferences {
  airlines: AirlinePreference[];
  hotels: HotelPreference[];
  cars: CarPreference[];
}

/**
 * Travel policy information
 */
export interface TravelPolicy {
  name: string;
  policyId?: string;
  allowance?: string;
  restrictions?: string[];
  approvalRequired?: boolean;
}

/**
 * Tax information
 */
export interface TaxInfo {
  taxId: string;
  type?: string;
  country?: string;
}

/**
 * Remark/note
 */
export interface Remark {
  type: RemarkType;
  category?: string;
  text: string;
  timestamp?: Date;
  userId?: string;
  source?: string;
}

/**
 * Profile metadata
 */
export interface ProfileMetadata {
  sourceGDS: GDSSource;
  sourceId: string;
  sourcePCC: string;
  lastSyncDate: Date;
  syncVersion: string;
  customFields?: Record<string, any>;
  tags?: string[];
}

/**
 * Main canonical profile structure
 */
export interface CanonicalProfile {
  // Identity
  id: string;
  profileName?: string;
  type: ProfileType;
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
  taxInfo?: TaxInfo[];

  // Additional Data
  remarks: Remark[];
  metadata: ProfileMetadata;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}
