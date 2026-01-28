/**
 * Configuration Manager - Manages application configuration
 */

export class ConfigManager {
  private static instance: ConfigManager;

  /**
   * Queue configuration
   * Access: ConfigManager.getInstance().queue
   */
  public readonly queue: {
    batchSize: number;
    maxRetries: number;
    delayBetweenPNRs: number;
    sourceQueue?: string[];
    targetQueue: string;
    errorQueue?: string;
    removeFromSource: boolean;
  };

  /**
   * Sabre configuration
   * Access: ConfigManager.getInstance().sabre
   */
  public readonly sabre: {
    endpoint: string;
    pcc: string;
    organization: string;
    username: string;
    password: string;
    domain: string;
    clientId: string;
    clientSecret: string;
    clientCode: string;
    clientContext: string;
  };

  /**
   * Private constructor (Singleton)
   */
  private constructor() {
    // -----------------------------
    // Queue Configuration
    // -----------------------------
    this.queue = {
      batchSize: parseInt(process.env.PNR_BATCH_SIZE || "5", 10),
      maxRetries: parseInt(process.env.PNR_MAX_RETRIES || "3", 10),
      delayBetweenPNRs: parseInt(
        process.env.PNR_PROCESSING_DELAY_MS || "1000",
        10,
      ),
      sourceQueue: this.parseSourceQueues(process.env.SOURCE_QUEUE),
      targetQueue: process.env.TARGET_QUEUE || "",
      errorQueue: process.env.ERROR_QUEUE,
      removeFromSource: process.env.REMOVE_FROM_SOURCE === "true",
    };

    // -----------------------------
    // Sabre Configuration
    // -----------------------------
    this.sabre = {
      endpoint: this.getRequiredEnv("SABRE_ENDPOINT"),
      pcc: this.getRequiredEnv("SABRE_PCC"),
      organization: this.getRequiredEnv("SABRE_ORGANIZATION"),
      username: this.getRequiredEnv("SABRE_USERNAME"),
      password: this.getRequiredEnv("SABRE_PASSWORD"),
      domain: this.getRequiredEnv("SABRE_DOMAIN"),
      clientId: this.getRequiredEnv("SABRE_CLIENT_ID"),
      clientSecret: this.getRequiredEnv("SABRE_CLIENT_SECRET"),
      clientCode: this.getRequiredEnv("SABRE_CLIENT_CODE"),
      clientContext: this.getRequiredEnv("SABRE_CLIENT_CONTEXT"),
    };

    this.logConfiguration();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get required environment variable
   */
  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }
  private parseSourceQueues(value?: string): string[] {
    if (!value) return [];

    // Try to parse as JSON array first
    if (value.startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fall through to comma-separated parsing
      }
    }

    // Parse comma-separated values and return as array
    return value
      .split(",")
      .map((q) => q.trim())
      .filter(Boolean);
  }
  /**
   * Log configuration (no secrets)
   */
  private logConfiguration(): void {
    if (this.queue.sourceQueue?.length) {
      console.log(`Will process queues: ${this.queue.sourceQueue.join(", ")}`);
    } else {
      console.log("No source queues specified - will process all queues");
    }
  }

  /**
   * Validate configuration
   */
  public validate(): void {
    const errors: string[] = [];

    if (!this.sabre.pcc) {
      errors.push("SABRE_PCC is required");
    }

    if (!this.queue.targetQueue && !this.queue.errorQueue) {
      errors.push(
        "At least one of TARGET_QUEUE or ERROR_QUEUE must be configured",
      );
    }

    if (this.queue.batchSize < 1) {
      errors.push("PNR_BATCH_SIZE must be >= 1");
    }

    if (this.queue.maxRetries < 1) {
      errors.push("PNR_MAX_RETRIES must be >= 1");
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
    }
  }
}
