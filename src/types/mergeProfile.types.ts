export enum ProfileType {
  PERSONAL = "personal",
  BUSINESS = "business",
}

export interface Identity {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

export interface RelatedUser {
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  similarity_score?: number;
}

export interface FindOrCreateUserResult {
  userId: string;
  isNew: boolean;
  relatedUsers?: RelatedUser[];
}

export interface ProvenanceRecord {
  source: string;
  source_id: string;
  timestamp: string;
  confidence: number;
}

export interface Provenance {
  [field: string]: ProvenanceRecord;
}

export interface Email {
  address: string;
  type: string;
  primary: boolean;
  id?: string;
}

export interface Phone {
  number: string;
  type: string;
  primary: boolean;
  countryCode?: string;
  id?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  zip?: string;
  postalCode?: string;
  country: string;
  type: string;
  primary: boolean;
  id?: string;
}

export interface TravelDocument {
  type: string;
  number: string;
  issuingCountry: string;
  issueDate?: string;
  expirationDate?: string;
  expiryDate?: string;
  isVerified?: boolean;
  nationality?: string;
  givenName?: string;
  surname?: string;
  dateOfBirth?: string;
  gender?: string;
  documentType?: string;
  documentNumber?: string;
  id?: string;
}

export interface LoyaltyProgram {
  providerType?: string;
  providerName: string;
  providerCode?: string;
  programName: string;
  number?: string;
  memberNumber?: string;
  tier?: string;
  tierStatus?: string;
  tierLevel?: string;
  expirationDate?: string;
  pointsBalance?: number;
  memberSince?: string;
  tierExpiryDate?: string;
  isPrimary?: boolean;
  id?: string;
}

export interface AirlinePreference {
  airline: string;
  seat?: string;
  meal?: string;
  specialService?: string;
  level?: string;
}

export interface HotelPreference {
  chain: string;
  roomType?: string;
  bedType?: string;
  smokingPreference?: string;
  level?: string;
}

export interface CarPreference {
  vendor: string;
  vehicleType?: string;
  transmission?: string;
  level?: string;
}

export interface TravelPreferences {
  airlines?: AirlinePreference[];
  hotels?: HotelPreference[];
  cars?: CarPreference[];
}

export interface Employment {
  company?: string;
  title?: string;
  department?: string;
  employeeId?: string;
  costCenter?: string;
  division?: string;
  businessUnit?: string;
  projectID?: string;
  projectId?: string;
  hireDate?: string;
  location?: string;
  region?: string;
  isCurrent?: boolean;
}

export interface EmergencyContact {
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface PaymentMethod {
  paymentType: string;
  cardType: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  cardHolderName: string;
  isPrimary?: boolean;
  billingAddress?: any;
  isDefault?: boolean;
}

export interface GDSMetadata {
  sourceGDS: string;
  sourceId: string;
  sourcePcc?: string;
  lastSyncedAt?: string;
  syncDirection?: string;
  syncedFields?: string[];
}

export interface CanonicalProfile {
  id: string;
  type?: ProfileType;
  profileName?: string;
  personal: {
    firstName: string;
    middleName?: string;
    lastName: string;
    dob?: string;
    dateOfBirth?: string;
    gender?: string;
  };
  contact: {
    emails: Email[];
    phones: Phone[];
    addresses: Address[];
  };
  documents?: TravelDocument[];
  loyalty?: LoyaltyProgram[];
  loyaltyPrograms?: LoyaltyProgram[];
  preferences?: TravelPreferences;
  employment?: Employment;
  metadata: GDSMetadata;
  emergencyContacts?: EmergencyContact[];
  travelDocuments?: TravelDocument[];
  paymentMethods?: PaymentMethod[];
}

export interface CompleteProfile {
  id: string;
  user_id: string;
  organization_id?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth?: string;
  email?: string;
  phone?: string;
  profile_type: string;
  completeness_score: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  emails: Email[];
  phones: Phone[];
  addresses: Address[];
  documents: TravelDocument[];
  loyaltyPrograms: LoyaltyProgram[];
  gender: string;
}

export interface ImportResult {
  userId: string;
  profileId: string;
  gdsProfileId: string;
  isNewUser: boolean;
  isNewProfile: boolean;
  relatedUsers: RelatedUser[];
}

export interface UserUpdate {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phone?: string;
  preferences?: any;
  contact?: {
    phones?: Array<{ phoneNumber: string; primary: boolean }>;
    addresses?: Array<{
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      country: string;
      postalCode?: string;
      primary: boolean;
    }>;
  };
}

export interface RelationshipMetadata {
  subtype?: string;
  confidenceScore?: number;
  reason?: any;
  sameEmail?: boolean;
  sameAddress?: boolean;
  sameCompany?: boolean;
  samePcc?: boolean;
}