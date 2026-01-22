/**
 * Ensure log directory exists
 */
const ensureLogDir = (logDir: string): void => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};
import winston, { Logger, format } from 'winston';
import path from 'path';
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Logger Configuration Interface
 */
interface LoggerConfig {
  logDir: string;
  logLevel: string;
  appName: string;
  environment: string;
  maxSize: number;
  maxFiles: number;
  enableConsole: boolean;
  enableFile: boolean;
  enableDailyRotate: boolean;
  requestLogging: boolean;
  daysToRetain: number;
}

/**
 * Custom filter to match specific log level only
 */
const createLevelFilter = (targetLevel: string) => {
  return format((info) => {
    return info.level === targetLevel ? info : false;
  })();
};

/**
 * Get default configuration with environment overrides
 */
const getConfig = (): LoggerConfig => ({
  logDir: process.env.LOG_FILE_PATH || './logs',
  logLevel: process.env.LOG_LEVEL || 'info',
  appName: process.env.APP_NAME || 'Profile Management',
  environment: process.env.NODE_ENV || 'development',
  maxSize: parseInt(process.env.LOG_MAX_SIZE || '5242880'), // 5MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
  enableConsole: true,
  enableFile: process.env.LOG_FILE !== 'false',
  enableDailyRotate: true,
  requestLogging: process.env.LOG_REQUEST === 'true',
  daysToRetain: parseInt(process.env.LOG_RETENTION_DAYS || '3'),
});

/**
 * Clean up old log files during rotation (automatic via winston)
 * Winston's maxFiles option handles this automatically
 */
const cleanupOldLogs = (logDir: string, daysToKeep: number = 3): void => {
  try {
    if (!fs.existsSync(logDir)) return;

    const now = Date.now();
    const cutoffTime = now - daysToKeep * 24 * 60 * 60 * 1000;

    fs.readdirSync(logDir).forEach((file) => {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);

      // Delete if file is older than cutoff time
      if (stats.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
        console.log(`[Logger] Deleted old log file: ${file}`);
      }
    });
  } catch (error) {
    console.error('[Logger] Error cleaning up old logs:', error);
  }
};

/**
 * Custom format for console output with better readability
 */
const getConsoleFormat = (_env: string) => {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.printf(({ timestamp, level, message, service, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
    })
  );
};

/**
 * Custom format for file output with detailed context
 */
const getFileFormat = () => {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
    format.json()
  );
};

/**
 * Create Winston Logger instance with enhanced configuration
 */
const createLogger = (customConfig?: Partial<LoggerConfig>): Logger => {
  const config = { ...getConfig(), ...customConfig };

  ensureLogDir(config.logDir);

  const transports: winston.transport[] = [];

  // Console Transport
  if (config.enableConsole) {
    // In production, only log info and above; in development, use configured level
    const consoleLevel = config.environment === 'production' ? 'info' : config.logLevel;

    transports.push(
      new winston.transports.Console({
        level: consoleLevel,
        format:
          config.environment === 'production'
            ? format.combine(
                format.timestamp(),
                format.json() 
              )
            : getConsoleFormat(config.environment), 
      })
    );
  }

  // File-based logging
  if (config.enableFile) {
    // Skip debug logs in production
    const isDevelopment = config.environment !== 'production';

    if (config.enableDailyRotate) {
      // Daily rotating file transport for all logs (info and above)
      transports.push(
        new DailyRotateFile({
          filename: path.join(config.logDir, 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'info',
          format: getFileFormat(),
          maxSize: config.maxSize,
          maxFiles: `${config.maxFiles}d`, // e.g., '5d' = 5 days
          auditFile: path.join(config.logDir, '.combined-audit.json'),
          zippedArchive: false,
        })
      );

      // Error log with daily rotation (error only)
      transports.push(
        new DailyRotateFile({
          filename: path.join(config.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          format: getFileFormat(),
          maxSize: config.maxSize,
          maxFiles: `${config.maxFiles}d`, // e.g., '5d' = 5 days
          auditFile: path.join(config.logDir, '.error-audit.json'),
          zippedArchive: false,
        })
      );

      // Debug log with daily rotation (debug only, development only)
      if (isDevelopment) {
        transports.push(
          new DailyRotateFile({
            filename: path.join(config.logDir, 'debug-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            format: format.combine(createLevelFilter('debug'), getFileFormat()),
            maxSize: config.maxSize,
            maxFiles: `${config.maxFiles}d`, // e.g., '5d' = 5 days
            auditFile: path.join(config.logDir, '.debug-audit.json'),
            zippedArchive: false,
          })
        );
      }
    } else {
      // Standard rotating file transports
      transports.push(
        new winston.transports.File({
          filename: path.join(config.logDir, 'error.log'),
          level: 'error',
          format: getFileFormat(),
          maxsize: config.maxSize,
          maxFiles: config.maxFiles,
        }),
        new winston.transports.File({
          filename: path.join(config.logDir, 'combined.log'),
          level: 'info',
          format: getFileFormat(),
          maxsize: config.maxSize,
          maxFiles: config.maxFiles,
        })
      );

      // Debug log (development only)
      if (isDevelopment) {
        transports.push(
          new winston.transports.File({
            filename: path.join(config.logDir, 'debug.log'),
            level: 'debug',
            format: format.combine(createLevelFilter('debug'), getFileFormat()),
            maxsize: config.maxSize,
            maxFiles: config.maxFiles,
          })
        );
      }
    }
  }

  const logger = winston.createLogger({
    level: config.logLevel,
    format: getFileFormat(),
    defaultMeta: {
      service: config.appName,
      environment: config.environment,
      timestamp: new Date().toISOString(),
    },
    transports,
    exceptionHandlers: [
      new winston.transports.File({
        filename: path.join(config.logDir, 'exceptions.log'),
        format: getFileFormat(),
      }),
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: path.join(config.logDir, 'rejections.log'),
        format: getFileFormat(),
      }),
    ],
  });

  return logger;
};

/**
 * Utility logging methods
 */
const loggerUtils = {
  logRequest: (
    logger: Logger,
    method: string,
    url: string,
    statusCode: number,
    duration: number
  ) => {
    logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
    });
  },

  logError: (logger: Logger, error: Error, context?: Record<string, any>) => {
    logger.error('Error occurred', {
      error: error.message,
      stack: error.stack,
      ...context,
    });
  },

  logDatabase: (logger: Logger, query: string, duration: number, error?: Error) => {
    if (error) {
      logger.error('Database error', {
        query,
        duration: `${duration}ms`,
        error: error.message,
      });
    } else {
      logger.debug('Database query', {
        query,
        duration: `${duration}ms`,
      });
    }
  },
};

const logger = createLogger();

export default logger;
export { createLogger, loggerUtils, LoggerConfig, cleanupOldLogs };
