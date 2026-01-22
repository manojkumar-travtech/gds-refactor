import { Pool } from "pg";
import { FlightInfo } from "./flightInfo.types";
import { CarRentalSegment } from "./carDetails.types";
import { HotelSegment } from "./hotelDetails.types";

/**
 * Sabre-specific configuration
 */
export interface SabreConfig {
  endpoint: string;
  username: string;
  password: string;
  organization: string;
  domain: string;
  pcc: string;
  clientId?: string;
  clientSecret?: string;
  clientCode?: string;
  clientContext?: string;
  timeout?: number;
  pool?: Pool;
}

/**
 * Canonical profile model
 */
export interface CanonicalProfile {
  id?: string;
  type: string;
  status: string;
  domain: string;
  clientCode: string;
  clientContext: string;
  created: Date;
  updated: Date;
  personal: PersonalInfo;
  contact: ContactInfo;
  metadata?: Record<string, any>;
}

/**
 * Personal information
 */
export interface PersonalInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  gender?: string;
  dateOfBirth?: string;
}

/**
 * Contact information
 */
export interface ContactInfo {
  emails: Email[];
  phones: Phone[];
  addresses: Address[];
}

/**
 * Email information
 */
export interface Email {
  address: string;
  type: string;
  isPrimary: boolean;
}

/**
 * Phone information
 */
export interface Phone {
  number: string;
  type: string;
  isPrimary: boolean;
}

/**
 * Address information
 */
export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  type?: string;
  isPrimary?: boolean;
}

/**
 * Traveler information
 */
export interface TravelerInfo {
  profileId: string;
  firstName?: string;
  lastName?: string;
  isPrimary?: boolean;
}

/**
 * PNR details
 */
export interface PNRDetails {
  pnrNumber: string;
  passengerName?: string;
  profileId?: string;
  flightInfo?: FlightInfo[];
  carRentalInfo?: CarRentalSegment[];
  hotelInfo?: HotelSegment[];
  travelers?: TravelerInfo[];
  contactInfo?: any;
  ticketingInfo?: any;
  frequentFlyer?: any;
  trips?: TripInfo;
  rawData?: any;
  timestamp: string;
}

/**
 * Trip information
 */
export interface TripInfo {
  tripName?: string;
  tripNumber?: string;
  originCity?: string;
  destinationCity?: string;
  departureDate?: Date;
  returnDate?: Date;
  purpose?: {
    description?: string;
  };
  isInternational?: boolean;
  status?: string;
  costs?: {
    estimated?: number;
    actual?: number;
  };
  currency?: string;
  approval?: {
    requiresApproval?: boolean;
  };
  approvedAt?: Date;
  metadata?: Record<string, any>;
  user_id?: string;
}

/**
 * Queue information
 */
export interface QueueInfo {
  queueNumber: string | number;
  pnrCount?: number;
  messageCount?: number;
  endedCount?: number;
  ignoredCount?: number;
  movedCount?: number;
  removedCount?: number;
  transferredCount?: number;
  leftMessageToContactCount?: number;
  unableToReachCount?: number;
  hasMessages?: boolean;
}

/**
 * Queue processing result
 */
export interface QueueProcessResult {
  success: boolean;
  queueNumber?: string | number;
  pnrCount?: number;
  processedQueues: number;
  processedPnrs: number;
  failedQueues: number;
  errors: QueueError[];
  pnrs?: string[];
  pnrDetails?: PNRInfo[];
  endOfQueue?: boolean;
  requestDetails?: any;
  responseDetails?: any;
  response?: any;
  processedItems?: number;
}

/**
 * Queue error information
 */
export interface QueueError {
  queueNumber?: string | number;
  pnr?: string;
  error: string;
  message?: string;
  position?: number;
  timestamp: Date | string;
  stack?: string;
}

/**
 * PNR information
 */
export interface PNRInfo {
  pnr: string;
  details: PNRDetails;
  profileId?: string;
  profile_id?: string;
  queueNumber: string | number;
  timestamp: Date;
}

/**
 * Profile change information
 */
export interface ProfileChange {
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Update result
 */
export interface UpdateResult {
  updated: boolean;
  changes?: ProfileChange[];
  profileId?: string;
  timestamp?: string;
}

/**
 * GDS source enumeration
 */
export enum GDSSource {
  SABRE = "SABRE",
  AMADEUS = "AMADEUS",
  TRAVELPORT = "TRAVELPORT",
}

/**
 * Queue access options
 */
export interface QueueAccessOptions {
  queueNumber: string | number;
  position?: number;
  navigationAction?: string;
}

/**
 * Queue count result
 */
export interface QueueCountResult {
  success: boolean;
  queueNumber?: string | number;
  queues: QueueInfo[];
  totalMessages: number;
  totalSpecials: number;
  totalPNRs: number;
  timestamp: Date;
}
