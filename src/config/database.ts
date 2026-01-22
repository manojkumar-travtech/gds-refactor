import { Pool, PoolConfig, PoolClient, QueryResult, QueryResultRow } from "pg";
import logger from "../utils/logger";

export type DBPoolClient = PoolClient;

let poolClosed = false;

// ═══════════════════════════════════════════════════════════════
// Environment Variable Validation
// ═══════════════════════════════════════════════════════════════
const requiredEnvVars = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}`,
  );
}

// ═══════════════════════════════════════════════════════════════
// Pool Configuration
// ═══════════════════════════════════════════════════════════════
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || "20"),
  min: parseInt(process.env.DB_MIN_CONNECTIONS || "5"),
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000,
  ssl: {
    rejectUnauthorized: false,
  },
};

// Log configuration in development (hide password)
if (process.env.NODE_ENV === "development") {
  logger.debug("Database pool configuration:", {
    ...poolConfig,
    password: "***HIDDEN***",
  });
}

// ═══════════════════════════════════════════════════════════════
// Create Pool Instance
// ═══════════════════════════════════════════════════════════════
const pool = new Pool(poolConfig);

// ═══════════════════════════════════════════════════════════════
// Pool Event Handlers
// ═══════════════════════════════════════════════════════════════
pool.on("error", (err, client) => {
  logger.error(
    "Unexpected error on idle client",
    { error: err.message },
    client,
  );
  // process.exit(-1);
});

pool.on("connect", (client) => {
  if (process.env.NODE_ENV === "development") {
    logger.info("New database connection established", client);
  } else {
    logger.info("New database connection established");
  }
});

pool.on("acquire", (client) => {
  logger.debug("Client acquired from pool", client);
});

pool.on("remove", (client) => {
  logger.debug("Client removed from pool", client);
});

// ═══════════════════════════════════════════════════════════════
// WAY 1: Simple query() - Returns rows array directly
// Use when: You only need the data, not metadata
// Example: const users = await query<User>('SELECT * FROM users');
// ═══════════════════════════════════════════════════════════════
export const query = async <T = any>(
  text: string,
  params?: any[],
): Promise<T[]> => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug("Query executed", {
      duration: `${duration}ms`,
      rows: res.rowCount,
      query: text.substring(0, 100),
    });

    return res.rows as T[];
  } catch (error) {
    const duration = Date.now() - start;
    logger.error("Database query error:", {
      error: error instanceof Error ? error.message : error,
      query: text.substring(0, 200),
      params: params?.map((p) =>
        typeof p === "object" ? "[Object]" : String(p).substring(0, 50),
      ),
      duration: `${duration}ms`,
    });
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════
// WAY 2: queryWithMetadata() - Returns full QueryResult
// Use when: You need rowCount, fields, or other metadata
// Example: const result = await queryWithMetadata('INSERT...');
//          console.log(result.rowCount); // Check rows affected
// ═══════════════════════════════════════════════════════════════
export const queryWithMetadata = async <T extends QueryResultRow>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug("Query with metadata executed", {
      duration: `${duration}ms`,
      rows: res.rowCount,
      fields: res.fields?.length || 0,
      query: text.substring(0, 100),
    });

    return res;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error("Database query error:", {
      error: error instanceof Error ? error.message : error,
      query: text.substring(0, 200),
      params: params?.map((p) =>
        typeof p === "object" ? "[Object]" : String(p).substring(0, 50),
      ),
      duration: `${duration}ms`,
    });
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════
// WAY 3: getClient() - Get a dedicated client from pool
// Use when: You need multiple related queries or manual transaction control
// Example: const client = await getClient();
//          try {
//            await client.query('SELECT...');
//            await client.query('UPDATE...');
//          } finally {
//            client.release();
//          }
// ═══════════════════════════════════════════════════════════════
export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  const checkoutTime = Date.now();

  // Warn if client is held too long
  const timeout = setTimeout(() => {
    const duration = Date.now() - checkoutTime;
    logger.warn("Client checkout exceeded 5 seconds", {
      duration: `${duration}ms`,
      message: "Possible connection leak - ensure client.release() is called",
    });
  }, 5000);

  // Wrap query to maintain logging
  client.query = ((...args: any[]) => {
    return (originalQuery as any).apply(null, args);
  }) as any;

  // Wrap release to cleanup and log
  client.release = ((err?: Error | boolean) => {
    clearTimeout(timeout);
    const duration = Date.now() - checkoutTime;

    if (duration > 1000) {
      logger.warn("Long-running client transaction", {
        duration: `${duration}ms`,
        message: "Consider optimizing queries or splitting transactions",
      });
    }

    logger.debug("Client released back to pool", { duration: `${duration}ms` });

    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease(err);
  }) as any;

  return client;
};

// ═══════════════════════════════════════════════════════════════
// WAY 4: transaction() - Execute queries in a transaction
// Use when: Multiple queries must succeed or fail together
// Example: await transaction(async (client) => {
//            await client.query('INSERT INTO users...');
//            await client.query('INSERT INTO profiles...');
//          });
// ═══════════════════════════════════════════════════════════════
export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await getClient();
  const startTime = Date.now();

  try {
    await client.query("BEGIN");
    logger.debug("Transaction started");

    const result = await callback(client);

    await client.query("COMMIT");
    const duration = Date.now() - startTime;
    logger.debug("Transaction committed", { duration: `${duration}ms` });

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    const duration = Date.now() - startTime;
    logger.error("Transaction rolled back", {
      error: error instanceof Error ? error.message : error,
      duration: `${duration}ms`,
    });
    throw error;
  } finally {
    client.release();
  }
};

// ═══════════════════════════════════════════════════════════════
// Batch Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Execute multiple queries in parallel (non-transactional)
 * Use when: Queries are independent and can fail individually
 */
export const batchQuery = async <T = any>(
  queries: Array<{ text: string; params?: any[] }>,
): Promise<T[][]> => {
  const promises = queries.map((q) => query<T>(q.text, q.params));
  return Promise.all(promises);
};

/**
 * Execute multiple queries in a transaction (all or nothing)
 * Use when: All queries must succeed together
 */
export const batchTransaction = async <T extends QueryResultRow>(
  queries: Array<{ text: string; params?: any[] }>,
): Promise<T[][]> => {
  return transaction(async (client) => {
    const results: T[][] = [];
    for (const q of queries) {
      const result = await client.query<T>(q.text, q.params);
      results.push(result.rows as T[]);
    }
    return results;
  });
};

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Test database connection
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await query<{ now: Date; version: string }>(
      "SELECT NOW() as now, version() as version",
    );

    const versionInfo = result[0].version.split(" ");
    logger.info("Database connection successful", {
      timestamp: result[0].now,
      database: versionInfo[0],
      version: versionInfo[1],
    });

    return true;
  } catch (error) {
    logger.error("Database connection failed:", {
      error: error instanceof Error ? error.message : error,
      config: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
      },
    });
    return false;
  }
};

/**
 * Get current pool statistics
 */
export const getPoolStats = () => {
  return {
    total: pool.totalCount, // Total number of clients in pool
    idle: pool.idleCount, // Number of idle clients
    waiting: pool.waitingCount, // Number of queued requests waiting for client
  };
};

/**
 * Comprehensive health check
 */
export const healthCheck = async (): Promise<{
  status: "healthy" | "unhealthy";
  latency?: number;
  poolStats?: ReturnType<typeof getPoolStats>;
  error?: string;
  timestamp: Date;
}> => {
  const start = Date.now();
  const timestamp = new Date();

  try {
    await query("SELECT 1");
    const latency = Date.now() - start;

    return {
      status: "healthy",
      latency,
      poolStats: getPoolStats(),
      timestamp,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp,
    };
  }
};

/**
 * Check if a table exists
 */
export const tableExists = async (tableName: string): Promise<boolean> => {
  try {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName],
    );
    return result[0]?.exists || false;
  } catch (error) {
    logger.error("Error checking table existence:", error);
    return false;
  }
};

/**
 * Execute raw SQL file (useful for migrations)
 */
export const executeSqlFile = async (sql: string): Promise<void> => {
  const client = await getClient();
  try {
    await client.query(sql);
    logger.info("SQL file executed successfully");
  } catch (error) {
    logger.error("Error executing SQL file:", error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Gracefully close the pool
 */
export const closePool = async (): Promise<void> => {
  // Prevent multiple close attempts
  if (poolClosed) {
    logger.warn("Pool already closed, skipping...");
    return;
  }

  try {
    logger.info("Closing database pool...");

    const stats = getPoolStats();
    logger.info("Pool stats before closing:", stats);

    await pool.end();

    // Mark pool as closed after successful closure
    poolClosed = true;

    logger.info("Database pool closed successfully");
  } catch (error) {
    logger.error("Error closing database pool:", {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════
// Graceful Shutdown Handlers
// ═══════════════════════════════════════════════════════════════
export const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal} signal - initiating graceful shutdown`);

  try {
    await closePool();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// Handle uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection:", {
    reason: reason instanceof Error ? reason.message : reason,
    promise: String(promise),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", {
    error: error.message,
    stack: error.stack,
  });
  // Allow time for logs to flush
  setTimeout(() => process.exit(1), 1000);
});

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════
export { pool };
export default pool;

// Re-export types for convenience
export type { Pool, PoolClient, QueryResult } from "pg";
