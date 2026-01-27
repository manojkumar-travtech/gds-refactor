// SabreSessionPool.ts
import logger from "../utils/logger";
import { SabreSessionService } from "./sabreSessionService.service";

interface PooledSession {
  service: SabreSessionService;
  token: string;
  conversationId?: string;
  inUse: boolean;
  createdAt: number;
  expiresAt: number;
}

export class SabreSessionPool {
  private static instance: SabreSessionPool;
  private sessions: PooledSession[] = [];
  private readonly maxPoolSize: number;
  private readonly sessionTimeout: number = 20 * 60 * 1000;
  private isShuttingDown = false;
  private sessionCreationPromises: Map<number, Promise<PooledSession>> = new Map(); // 👈 Track per-slot creation

  private constructor(maxPoolSize: number = 10) {
    this.maxPoolSize = Math.min(maxPoolSize, 10);
    this.registerShutdownHooks();
    logger.info(
      `Session pool initialized with max size: ${this.maxPoolSize} (sessions will be created on-demand)`,
    );
  }

  static getInstance(maxPoolSize: number = 10): SabreSessionPool {
    if (!SabreSessionPool.instance) {
      SabreSessionPool.instance = new SabreSessionPool(maxPoolSize);
    }
    return SabreSessionPool.instance;
  }

  /**
   * Create a new Sabre session by bypassing the singleton pattern
   */
  private async createNewSession(): Promise<PooledSession> {
    try {
      const sessionIndex = this.sessions.length + this.sessionCreationPromises.size;
      logger.info(
        `Creating Sabre session ${sessionIndex} (current pool: ${this.sessions.length}, creating: ${this.sessionCreationPromises.size}, max: ${this.maxPoolSize})...`,
      );

      // 👇 Create a new instance by manually calling the constructor
      const ServiceConstructor = SabreSessionService as any;
      const service = new ServiceConstructor.__proto__.constructor();

      // Copy prototype methods
      Object.setPrototypeOf(service, SabreSessionService.prototype);

      // Initialize the service
      await this.initializeService(service);

      // Perform login
      await service.login();

      const token = await service.getAccessToken();
      const conversationId = await service.getConversationId();

      const pooledSession: PooledSession = {
        service,
        token,
        conversationId,
        inUse: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.sessionTimeout,
      };

      logger.info(
        `✅ Session created successfully (Token: ${token.substring(0, 20)}...)`,
      );

      return pooledSession;
    } catch (error) {
      logger.error(`❌ Failed to create session:`, error);
      throw error;
    }
  }

  /**
   * Manually initialize a service instance
   */
  private async initializeService(service: any): Promise<void> {
    const axios = await import("axios");
    const { Parser } = await import("xml2js");
    const { ConfigManager } = await import("../config/config.manager");

    const config = ConfigManager.getInstance();
    const sabre = config.sabre;

    service.httpClient = axios.default.create({
      baseURL: sabre.endpoint,
      timeout: 30000,
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
      },
    });

    service.parser = new Parser({
      explicitArray: false,
      ignoreAttrs: false,
    });

    service.config = config;
    service.isAuthenticated = false;
  }

  /**
   * Acquire a session from the pool (creates new session if needed)
   * Uses per-slot tracking to prevent race conditions
   */
  async acquireSession(): Promise<{
    service: SabreSessionService;
    token: string;
    conversationId?: string;
  }> {
    if (this.isShuttingDown) {
      throw new Error("Session pool is shutting down");
    }

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      // Refresh expired sessions
      await this.refreshExpiredSessions();

      // Find available session
      const availableSession = this.sessions.find(
        (s) => !s.inUse && s.expiresAt > Date.now() + 60_000, // 1 min buffer
      );

      if (availableSession) {
        availableSession.inUse = true;
        logger.info(
          `🔒 Session acquired: ${availableSession.token.substring(0, 20)}... (${this.getStats().available} available)`,
        );

        return {
          service: availableSession.service,
          token: availableSession.token,
          conversationId: availableSession.conversationId,
        };
      }

      // 👇 Check if we can create more sessions
      const totalSessions = this.sessions.length + this.sessionCreationPromises.size;

      if (totalSessions < this.maxPoolSize) {
        // Find next available slot
        const slotIndex = this.findNextAvailableSlot();

        if (slotIndex !== -1) {
          logger.info(
            `No available sessions. Creating new session in slot ${slotIndex + 1}/${this.maxPoolSize}...`,
          );

          // Start session creation and track it
          const creationPromise = this.createNewSession()
            .then((session) => {
              this.sessions.push(session);
              this.sessionCreationPromises.delete(slotIndex);
              logger.info(
                `Session in slot ${slotIndex + 1} added to pool. Pool size: ${this.sessions.length}/${this.maxPoolSize}`,
              );
              return session;
            })
            .catch((error) => {
              logger.error(`Failed to create session in slot ${slotIndex + 1}:`, error);
              this.sessionCreationPromises.delete(slotIndex);
              throw error;
            });

          this.sessionCreationPromises.set(slotIndex, creationPromise);

          try {
            const newSession = await creationPromise;
            newSession.inUse = true;

            logger.info(
              `🔒 New session acquired from slot ${slotIndex + 1}: ${newSession.token.substring(0, 20)}...`,
            );

            return {
              service: newSession.service,
              token: newSession.token,
              conversationId: newSession.conversationId,
            };
          } catch (error) {
            logger.error(`Failed to acquire newly created session:`, error);
            // Continue to retry loop
          }
        } else {
          // All slots are being created, wait for one to finish
          logger.debug(
            `All ${this.maxPoolSize} slots are in use or being created. Waiting...`,
          );

          // Wait for the first creation promise to complete
          if (this.sessionCreationPromises.size > 0) {
            const firstPromise = Array.from(this.sessionCreationPromises.values())[0];
            try {
              await firstPromise;
              // Loop back to try acquiring the newly created session
              continue;
            } catch (error) {
              logger.warn("Session creation failed while waiting:", error);
            }
          }
        }
      } else {
        // Pool is full, wait for existing sessions
        logger.debug(
          `Pool is full (${totalSessions}/${this.maxPoolSize}). Waiting for available session...`,
        );
      }

      // Wait before retrying
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(
      `No available sessions in pool after ${maxAttempts} attempts. Pool stats: ${JSON.stringify(this.getStats())}`,
    );
  }

  /**
   * Find next available slot for session creation
   * Returns -1 if all slots are taken
   */
  private findNextAvailableSlot(): number {
    for (let i = 0; i < this.maxPoolSize; i++) {
      if (!this.sessionCreationPromises.has(i) && i >= this.sessions.length) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Release a session back to the pool
   */
  releaseSession(token: string): void {
    const session = this.sessions.find((s) => s.token === token);

    if (session) {
      session.inUse = false;
      logger.info(
        `🔓 Session released: ${token.substring(0, 20)}... (${this.getStats().available} available)`,
      );
    } else {
      logger.warn(
        `⚠️ Attempted to release unknown session: ${token.substring(0, 20)}...`,
      );
    }
  }

  /**
   * Check and refresh expired sessions
   */
  private async refreshExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiringSessions = this.sessions.filter(
      (s) => !s.inUse && s.expiresAt <= now + 60_000, // Expiring in less than 1 minute
    );

    if (expiringSessions.length === 0) {
      return;
    }

    logger.info(
      `♻️ Refreshing ${expiringSessions.length} expired/expiring sessions...`,
    );

    for (const session of expiringSessions) {
      try {
        // Logout old session
        await session.service.logout();

        // Re-login
        await session.service.login();

        // Update session data
        session.token = await session.service.getAccessToken();
        session.conversationId = await session.service.getConversationId();
        session.createdAt = Date.now();
        session.expiresAt = Date.now() + this.sessionTimeout;

        logger.info(
          `✅ Session refreshed: ${session.token.substring(0, 20)}...`,
        );
      } catch (error) {
        logger.error("❌ Failed to refresh session:", error);

        // Remove failed session from pool
        const index = this.sessions.indexOf(session);
        if (index > -1) {
          this.sessions.splice(index, 1);
          logger.info(
            `Removed failed session from pool. Pool size: ${this.sessions.length}/${this.maxPoolSize}`,
          );
        }
      }
    }
  }

  /**
   * Close all sessions and cleanup
   */
  async closeAll(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info(
      `Closing all Sabre sessions (${this.sessions.length} active, ${this.sessionCreationPromises.size} creating)...`,
    );

    // Wait for any pending session creations to complete or timeout
    if (this.sessionCreationPromises.size > 0) {
      logger.info(
        `Waiting for ${this.sessionCreationPromises.size} pending session creations...`,
      );
      await Promise.allSettled(Array.from(this.sessionCreationPromises.values()));
      this.sessionCreationPromises.clear();
    }

    // Logout all active sessions
    const logoutPromises = this.sessions.map(async (session) => {
      try {
        await session.service.logout();
      } catch (error) {
        logger.error("Error closing session:", error);
      }
    });

    await Promise.allSettled(logoutPromises);

    this.sessions = [];
    logger.info("✅ All Sabre sessions closed");
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const now = Date.now();
    return {
      current: this.sessions.length,
      creating: this.sessionCreationPromises.size,
      total: this.sessions.length + this.sessionCreationPromises.size,
      max: this.maxPoolSize,
      inUse: this.sessions.filter((s) => s.inUse).length,
      available: this.sessions.filter((s) => !s.inUse && s.expiresAt > now)
        .length,
      expired: this.sessions.filter((s) => s.expiresAt <= now).length,
    };
  }

  /**
   * Manually pre-warm the pool (optional)
   * Creates a specified number of sessions upfront
   */
  async prewarmPool(count: number = 3): Promise<void> {
    const targetCount = Math.min(count, this.maxPoolSize);
    const totalSessions = this.sessions.length + this.sessionCreationPromises.size;
    const sessionsToCreate = targetCount - totalSessions;

    if (sessionsToCreate <= 0) {
      logger.info(
        `Pool already has ${totalSessions} sessions (${this.sessions.length} ready, ${this.sessionCreationPromises.size} creating). No prewarming needed.`,
      );
      return;
    }

    logger.info(
      `Prewarming pool: creating ${sessionsToCreate} sessions upfront...`,
    );

    const createPromises: Promise<void>[] = [];

    for (let i = 0; i < sessionsToCreate; i++) {
      const slotIndex = this.findNextAvailableSlot();

      if (slotIndex === -1) {
        logger.warn(
          `Cannot find available slot for prewarming. Stopping at ${i} sessions.`,
        );
        break;
      }

      const creationPromise = this.createNewSession()
        .then((session) => {
          this.sessions.push(session);
          this.sessionCreationPromises.delete(slotIndex);
        })
        .catch((error) => {
          logger.error(`Failed to create session during prewarm in slot ${slotIndex}:`, error);
          this.sessionCreationPromises.delete(slotIndex);
        });

      this.sessionCreationPromises.set(slotIndex, creationPromise as any);
      createPromises.push(creationPromise);
    }

    await Promise.allSettled(createPromises);

    logger.info(
      `✅ Pool prewarmed: ${this.sessions.length}/${this.maxPoolSize} sessions ready, ${this.sessionCreationPromises.size} still creating`,
    );
  }

  /**
   * Register shutdown hooks
   */
  private registerShutdownHooks(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, closing Sabre session pool...`);
      try {
        await this.closeAll();
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  /**
   * Health check - removes and replaces unhealthy sessions
   */
  async healthCheck(): Promise<void> {
    logger.info("Running session pool health check...");

    const unhealthySessions = this.sessions.filter(
      (s) => !s.inUse && s.expiresAt <= Date.now(),
    );

    if (unhealthySessions.length > 0) {
      logger.info(
        `Found ${unhealthySessions.length} unhealthy sessions. Removing...`,
      );

      for (const session of unhealthySessions) {
        try {
          await session.service.logout();
        } catch (error) {
          logger.warn("Error during health check logout:", error);
        }

        const index = this.sessions.indexOf(session);
        if (index > -1) {
          this.sessions.splice(index, 1);
        }
      }
    }

    logger.info(
      `Health check complete. Pool stats: ${JSON.stringify(this.getStats())}`,
    );
  }

  /**
   * Shrink pool to target size (removes idle sessions)
   */
  async shrinkPool(targetSize: number = 0): Promise<void> {
    const idleSessions = this.sessions.filter((s) => !s.inUse);
    const sessionsToRemove = Math.max(0, this.sessions.length - targetSize);

    if (sessionsToRemove === 0) {
      logger.info("No sessions to remove.");
      return;
    }

    logger.info(
      `Shrinking pool: removing ${sessionsToRemove} idle sessions...`,
    );

    const sessionsToClose = idleSessions.slice(0, sessionsToRemove);

    for (const session of sessionsToClose) {
      try {
        await session.service.logout();
        const index = this.sessions.indexOf(session);
        if (index > -1) {
          this.sessions.splice(index, 1);
        }
      } catch (error) {
        logger.error("Error closing session during shrink:", error);
      }
    }

    logger.info(`✅ Pool shrunk to ${this.sessions.length} sessions`);
  }

  /**
   * Get detailed pool information (for debugging)
   */
  getDetailedStats() {
    const now = Date.now();
    return {
      poolSize: {
        current: this.sessions.length,
        creating: this.sessionCreationPromises.size,
        total: this.sessions.length + this.sessionCreationPromises.size,
        max: this.maxPoolSize,
      },
      sessions: {
        inUse: this.sessions.filter((s) => s.inUse).length,
        available: this.sessions.filter((s) => !s.inUse && s.expiresAt > now).length,
        expired: this.sessions.filter((s) => s.expiresAt <= now).length,
      },
      creation: {
        slotsInProgress: Array.from(this.sessionCreationPromises.keys()),
        count: this.sessionCreationPromises.size,
      },
      health: {
        isShuttingDown: this.isShuttingDown,
        oldestSession: this.sessions.length > 0
          ? new Date(Math.min(...this.sessions.map((s) => s.createdAt))).toISOString()
          : null,
        newestSession: this.sessions.length > 0
          ? new Date(Math.max(...this.sessions.map((s) => s.createdAt))).toISOString()
          : null,
      },
    };
  }
}

// Export singleton instance with max 10 sessions
export const sabreSessionPool = SabreSessionPool.getInstance(10);