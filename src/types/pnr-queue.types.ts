import { Pool } from "../config/database";

/**
 * PNR Queue Processor Configuration
 */
export interface PNRQueueProcessorConfig {
  queueBatchSize?: number;
  maxRetries?: number;
  delayBetweenPNRs?: number;
  pcc?: string;
  sourceQueue?: string;
  targetQueue?: string;
  errorQueue?: string;
  REMOVE_FROM_SOURCE?: boolean | string;
  pool?: Pool;
}

/**
 * Sabre Connector Configuration
 */
export interface SabreConnectorConfig {
  endpoint?: string;
  pcc?: string;
  organization?: string;
  username?: string;
  password?: string;
  domain?: string;
  clientId?: string;
  clientSecret?: string;
  pool?: Pool;
}

/**
 * Queue Information
 */
export interface QueueInfo {
  queueNumber: string;
  count: number;
}

/**
 * Queue Count Response
 */
export interface QueueCountResponse {
  queues: QueueInfo[];
}

/**
 * PNR Structure from Sabre
 */
export interface PNREnvelope {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        Line?: {
          UniqueID?: {
            $?: {
              ID?: string;
            };
          };
        };
      };
    };
  };
  recordLocator?: string;
  queueNumber?: string;
}

/**
 * PNR Details
 */
export interface PNRDetails {
  recordLocator: string;
  queueNumber?: string;
  processedAt?: string;
  [key: string]: any;
}

/**
 * Processing Result
 */
export interface ProcessingResult {
  processed: number;
  errors: number;
  total: number;
}

/**
 * Single PNR Processing Result
 */
export interface SinglePNRResult {
  success: boolean;
  pnrId?: string;
  error?: string;
}

/**
 * Queue Processing Callback
 */
export type QueueProcessingCallback = (pnr: PNREnvelope) => Promise<{
  success: boolean;
  error?: string;
}>;

/**
 * Queue Placement Options
 */
export interface QueuePlacementOptions {
  prefatoryInstructionCode?: string;
  pseudoCityCode?: string;
  removeFromSource?: boolean | string;
}

/**
 * Process All Queues Options
 */
export interface ProcessAllQueuesOptions {
  targetQueue?: string;
}

/**
 * Process All Queues Result
 */
export interface ProcessAllQueuesResult {
  success: boolean;
  totalQueues: number;
  processed: number;
  skipped: number;
  errors: number;
  details: QueueProcessingDetail[];
}

/**
 * Queue Processing Detail
 */
export interface QueueProcessingDetail {
  queue: string;
  targetQueue?: string;
  status: "processed" | "skipped" | "error";
  count?: number;
  reason?: string;
  error?: string;
}

/**
 * Error Log Entry
 */
export interface ErrorLogEntry {
  recordLocator: string;
  errorMessage: string;
  errorStack: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Transformed PNR Data
 */
export interface TransformedPNRData extends PNRDetails {
  processedAt: string;
}
