export interface IQueueClient {
  getQueueCount(queueNumber: number): Promise<QueueCountResponse>;
  hasQueueItem(response: QueueResponse): boolean;
  buildQueueAccessRequest(queueNumber: number): string;
  buildNavigationRequest(action: string): string;
  sendQueueRequest(
    requestType: string,
    elementName: string,
    request: string,
  ): Promise<QueueResponse>;
}

export const QueueProcessConfig = {
  // Processing limits
  MAX_ITERATIONS: 1000,
  MAX_CONSECUTIVE_FAILURES: 3,
  MAX_RETRIES: 3,

  // Timing configurations
  BASE_RETRY_DELAY: 2000, // 2 seconds
  MAX_RETRY_DELAY: 10000, // 10 seconds
  RETRY_JITTER: 1000, // Random jitter up to 1 second

  // Session management
  SESSION_REFRESH_INTERVAL: 100, // Refresh session every N items

  // Logging
  ENABLE_PROGRESS_LOGGING: true,
  PROGRESS_LOG_INTERVAL: 10, // Log progress every N items

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT: 30000, // 30 seconds
} as const;

export type QueueConfigType = typeof QueueProcessConfig;

/**
 * Partial configuration type for overrides
 */
export type QueueConfigOverrides = Partial<QueueConfigType>;

/**
 * Error type classifications
 */
export enum ErrorType {
  END_OF_QUEUE = "end_of_queue", // Expected end, stop gracefully
  TRANSIENT = "transient", // Network/temporary issues, retry
  FATAL = "fatal", // Unrecoverable, stop immediately
  ITEM_ERROR = "item_error", // Single item failed, skip and continue
  SESSION_ERROR = "session_error", // Session expired, refresh and retry
}

/**
 * Queue navigation actions
 */
export enum QueueAction {
  ACCESS = "ACCESS", // Initial queue access
  NEXT = "I", // Navigate to next item
  END = "QXI", // End queue access
}

/**
 * End-of-queue indicators
 */
export const END_OF_QUEUE_INDICATORS = [
  "END OF QUEUE",
  "NO ITEM FOUND",
  "QUEUE EMPTY",
  "NO MORE ITEMS",
] as const;

/**
 * Callback control signals
 */
export enum CallbackAction {
  CONTINUE = "continue",
  SKIP = "skip",
  STOP = "stop",
  RETRY = "retry",
}

/**
 * Progress information passed to callbacks
 */
export interface ProgressInfo {
  current: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  consecutiveFailures: number;
}

/**
 * Callback return type for controlling processing
 */
export interface CallbackControl {
  action: CallbackAction;
  reason?: string;
}

/**
 * Error record
 */
export interface ErrorRecord {
  queueNumber: number;
  itemNumber: number;
  error: string;
  timestamp: Date;
}

/**
 * Warning record
 */
export interface WarningRecord {
  type: string;
  reason: string;
  timestamp: Date;
}

/**
 * Queue processing result
 */
export interface QueueProcessingResult {
  success: boolean;
  queueNumber: number;
  expectedItems: number;
  processedItems: number;
  skippedItems: number;
  failedItems: number;
  totalRetries: number;
  endedNaturally: boolean;
  duration: string;
  successRate: string;
  averageProcessingTime: string;
  rate: string;
  errors: ErrorRecord[];
  warnings: WarningRecord[];
  finalPosition: number;
  circuitBreakerState?: CircuitBreakerState;
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureTime: number | null;
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  type: ErrorType;
  message: string;
  isRecoverable: boolean;
  shouldRetry: boolean;
}

/**
 * Queue data from API
 */
export interface QueueData {
  queueNumber: string;
  count: number;
  pnrCount?: number;
}

/**
 * Queue count response
 */
export interface QueueCountResponse {
  queues: QueueData[];
}

/**
 * Queue response structure (adjust based on your actual API)
 */
export interface QueueResponse {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        ApplicationResults?: {
          Info?: any;
          Warning?: any;
          Success?: any;
          Paragraph?: any;
          Error?: {
            Code?: string;
            SystemSpecificResults?: {
              ShortText?: string;
            };
            Message: string;
          };
        };
        Line?:
          | {
              UniqueID?: any;
              PNRBFManagement_RS?: any;
            }
          | Array<{ UniqueID?: any; PNRBFManagement_RS?: any }>;
      };
    };
  };
}

/**
 * Queue request structure
 */
export interface QueueRequest {
  type: string;
  queueNumber?: number;
  action?: string;
  [key: string]: unknown;
}

/**
 * Process callback function type
 */
export type ProcessCallback = (
  response: QueueResponse,
  progress: ProgressInfo,
) => Promise<void | CallbackControl>;

/**
 * Retry options
 */
export interface RetryOptions {
  context?: string;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * Retry handler configuration
 */
export interface RetryHandlerConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  threshold?: number;
  timeout?: number;
}
