import { ProgressInfo } from "../../../constants/QueueConstant";

/**
 * State snapshot interface
 */
interface StateSnapshot {
  queueNumber: number;
  totalItems: number;
  currentPosition: number;
  isActive: boolean;
  isEnded: boolean;
  lastSuccessfulPosition: number;
  consecutiveFailures: number;
}

/**
 * Manages queue processing state
 */
export class QueueState {
  readonly queueNumber: number;
  readonly totalItems: number;

  currentPosition: number = 0;
  isActive: boolean = false;
  isEnded: boolean = false;
  lastSuccessfulPosition: number = 0;
  consecutiveFailures: number = 0;
  sessionRefreshNeeded: boolean = false;

  constructor(queueNumber: number, totalItems: number) {
    this.queueNumber = queueNumber;
    this.totalItems = totalItems;
  }

  /**
   * Start queue processing
   */
  start(): void {
    this.isActive = true;
    this.currentPosition = 1; // First item
  }

  /**
   * Move to next position
   */
  advance(): void {
    this.currentPosition++;
    this.lastSuccessfulPosition = this.currentPosition;
    this.consecutiveFailures = 0;
  }

  /**
   * Record failure at current position
   */
  recordFailure(): void {
    this.consecutiveFailures++;
  }

  /**
   * Reset consecutive failures
   */
  resetFailures(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Mark queue as ended
   */
  end(): void {
    this.isActive = false;
    this.isEnded = true;
  }

  /**
   * Check if at last item
   */
  isLastItem(): boolean {
    return this.currentPosition >= this.totalItems;
  }

  /**
   * Check if should refresh session
   */
  shouldRefreshSession(interval: number): boolean {
    return this.currentPosition > 0 && this.currentPosition % interval === 0;
  }

  /**
   * Check if should stop due to consecutive failures
   */
  shouldStopDueToFailures(maxFailures: number): boolean {
    return this.consecutiveFailures >= maxFailures;
  }

  /**
   * Get progress information
   */
  getProgress(): ProgressInfo {
    return {
      current: this.currentPosition,
      total: this.totalItems,
      isFirst: this.currentPosition === 1,
      isLast: this.isLastItem(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Get state snapshot
   */
  getSnapshot(): StateSnapshot {
    return {
      queueNumber: this.queueNumber,
      totalItems: this.totalItems,
      currentPosition: this.currentPosition,
      isActive: this.isActive,
      isEnded: this.isEnded,
      lastSuccessfulPosition: this.lastSuccessfulPosition,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
