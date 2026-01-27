import {
  QueueProcessConfig,
  RetryHandlerConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  RetryOptions,
} from "../constants/QueueConstant";

/**
 * Unified resilience executor combining retry logic and circuit breaker pattern
 */
export class ResilienceExecutor {
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;
  private jitter: number;
  private threshold: number;
  private timeout: number;
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    retryConfig: RetryHandlerConfig = {},
    circuitBreakerConfig: CircuitBreakerConfig = {},
  ) {
    // Retry configuration
    this.maxRetries = retryConfig.maxRetries ?? QueueProcessConfig.MAX_RETRIES;
    this.baseDelay =
      retryConfig.baseDelay ?? QueueProcessConfig.BASE_RETRY_DELAY;
    this.maxDelay = retryConfig.maxDelay ?? QueueProcessConfig.MAX_RETRY_DELAY;
    this.jitter = retryConfig.jitter ?? QueueProcessConfig.RETRY_JITTER;

    // Circuit breaker configuration
    this.threshold =
      circuitBreakerConfig.threshold ??
      QueueProcessConfig.CIRCUIT_BREAKER_THRESHOLD;
    this.timeout =
      circuitBreakerConfig.timeout ??
      QueueProcessConfig.CIRCUIT_BREAKER_TIMEOUT;
  }

  /**
   * Execute a function with retry logic and circuit breaker protection
   * @param fn - Async function to execute
   * @param options - Retry options
   * @returns Result of the function
   */
  async execute<T>(
    fn: (attempt: number) => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const {
      context = "",
      shouldRetry = () => true,
      onRetry = () => {},
    } = options;

    // Check circuit breaker state first
    this.checkCircuitState(context);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn(attempt);

        // Success - handle circuit breaker state
        this.onSuccess(context);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for circuit breaker
        this.onFailure();

        // Check if we should retry
        if (attempt >= this.maxRetries || !shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);

        console.log(
          `[RESILIENCE] ${context} - Attempt ${attempt}/${this.maxRetries} failed. ` +
            `Circuit state: ${this.state}, Failures: ${this.failureCount}. ` +
            `Retrying in ${delay}ms... Error: ${lastError.message}`,
        );

        // Call retry callback
        onRetry(lastError, attempt, delay);

        // Wait before retrying
        await this.sleep(delay);

        // Re-check circuit state before next attempt
        this.checkCircuitState(context);
      }
    }

    throw lastError!;
  }

  /**
   * Check and update circuit breaker state
   */
  private checkCircuitState(context: string): void {
    if (this.state === "OPEN") {
      // Check if timeout has passed
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime > this.timeout
      ) {
        console.log(
          `[RESILIENCE] ${context} - Circuit moving to HALF_OPEN state`,
        );
        this.state = "HALF_OPEN";
        this.failureCount = 0;
      } else {
        const timeRemaining = this.lastFailureTime
          ? Math.ceil(
              (this.timeout - (Date.now() - this.lastFailureTime)) / 1000,
            )
          : 0;

        throw new Error(
          `Circuit breaker is OPEN for ${context}. ` +
            `Too many failures (${this.failureCount}). ` +
            `Try again in ${timeRemaining}s`,
        );
      }
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(context: string): void {
    if (this.state === "HALF_OPEN") {
      console.log(
        `[RESILIENCE] ${context} - Circuit CLOSED after successful recovery`,
      );
      this.state = "CLOSED";
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Check if we should open the circuit
    if (this.state !== "OPEN" && this.failureCount >= this.threshold) {
      console.log(
        `[RESILIENCE] Circuit OPEN after ${this.failureCount} consecutive failures`,
      );
      this.state = "OPEN";
    }
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);

    // Add random jitter to prevent thundering herd
    const jitter = Math.random() * this.jitter;

    // Cap at maximum delay
    return Math.min(this.maxDelay, exponentialDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset circuit breaker and retry state
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = null;
    console.log("[RESILIENCE] Circuit breaker and retry state reset");
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Legacy RetryHandler - kept for backward compatibility
 * @deprecated Use ResilienceExecutor instead
 */
export class RetryHandler {
  private executor: ResilienceExecutor;

  constructor(config: RetryHandlerConfig = {}) {
    this.executor = new ResilienceExecutor(config, {});
  }

  async execute<T>(
    fn: (attempt: number) => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    return this.executor.execute(fn, options);
  }
}

/**
 * Legacy CircuitBreaker - kept for backward compatibility
 * @deprecated Use ResilienceExecutor instead
 */
export class CircuitBreaker {
  private executor: ResilienceExecutor;

  constructor(config: CircuitBreakerConfig = {}) {
    this.executor = new ResilienceExecutor({}, config);
  }

  async execute<T>(fn: () => Promise<T>, context: string = ""): Promise<T> {
    return this.executor.execute(() => fn(), { context });
  }

  reset(): void {
    this.executor.reset();
  }

  getState(): CircuitBreakerState {
    return this.executor.getState();
  }
}
