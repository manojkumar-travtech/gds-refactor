/**
 * Shared types for Profile Related Data processing
 */

export interface ProfileRelatedData {
  profileId: string;
  organizationId: string;
  gdsProfileId: string;
  rawData: any;
  source?: string; // e.g., "SABRE", "AMADEUS"
}

export interface InsertionResult {
  profileId: string;
  loyaltyPrograms: number;
  emergencyContacts: number;
  travelDocuments: number;
  paymentMethods: number;
  addresses: number;
  emails: number;
  phones: number;
  errors: string[];
}

export interface ProvenanceRecord {
  source: string;
  source_id: string;
  timestamp: string;
  confidence: number;
}