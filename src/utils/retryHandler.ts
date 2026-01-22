/**
 * Retry Handler - Manages retry logic with exponential backoff
 */

import { SabreConnector } from "../connectors/sabre.connector";

export class RetryHandler {
  constructor(
    private connector: SabreConnector,
    private maxRetries: number = 3,
  ) {}

  /**
   * Handle retry with exponential backoff
   */
  async handleRetry(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Cap at 30s
    console.log(`Retry attempt ${attempt}, waiting ${delay}ms...`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Re-authenticate before retry
      await this.connector.logout();
      await this.connector.login();
    } catch (error) {
      console.error("Error during re-authentication:", error);
      throw error;
    }
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: string = "Operation",
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.error(
          `${context} failed (attempt ${attempt + 1}/${this.maxRetries}):`,
          error,
        );

        if (attempt < this.maxRetries - 1) {
          await this.handleRetry(attempt);
        }
      }
    }

    throw new Error(
      `${context} failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Add delay between operations
   */
  async delay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}
