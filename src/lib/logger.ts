import pino from 'pino';

// Base logger configuration
const baseLogger = pino(
    {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
        timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields by path — avoid blanket redaction of entire `err`/`error`/`stack`
  // which strips diagnostic context from server error logs.
  ...(process.env.NODE_ENV === 'production' && {
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        '*.password',
        '*.token',
        '*.authorization',
        '*.secret',
        'cookies',
        '*.cookies',
      ],
      censor: '[REDACTED]',
    },
  }),
    },
    // In development, use pino-pretty for colored output; in production, no transport (JSON to stdout)
    process.env.NODE_ENV === 'production'
        ? undefined
        : pino.transport({
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
                  ignore: 'pid,hostname',
              },
          })
);

// Helper: create a logger that matches the custom API
function createLoggerWithLevels(parent: pino.Logger): {
    debug: (message: string, context?: Record<string, unknown>) => void;
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, err?: Error, context?: Record<string, unknown>) => void;
} {
    return {
        debug(message: string, context?: Record<string, unknown>) {
            if (context) {
                parent.debug(context as any, message);
            } else {
                parent.debug(message);
            }
        },
        info(message: string, context?: Record<string, unknown>) {
            if (context) {
                parent.info(context as any, message);
            } else {
                parent.info(message);
            }
        },
        warn(message: string, context?: Record<string, unknown>) {
            if (context) {
                parent.warn(context as any, message);
            } else {
                parent.warn(message);
            }
        },
        error(message: string, err?: Error, context?: Record<string, unknown>) {
            if (err && context) {
                parent.error({ ...context, error: err } as any, message);
            } else if (err) {
                parent.error({ error: err } as any, message);
            } else if (context) {
                parent.error(context as any, message);
            } else {
                parent.error(message);
            }
        },
    };
}

// Main logger instance
export const logger = createLoggerWithLevels(baseLogger);

// Child loggers with module namespace
export const dbLogger = createLoggerWithLevels(baseLogger.child({ module: 'db' }));
export const authLogger = createLoggerWithLevels(baseLogger.child({ module: 'auth' }));
export const securityLogger = createLoggerWithLevels(baseLogger.child({ module: 'security' }));
export const cacheLogger = createLoggerWithLevels(baseLogger.child({ module: 'cache' }));
export const actionLogger = createLoggerWithLevels(baseLogger.child({ module: 'action' }));

// Convenience functions
export const debug = (...args: Parameters<typeof logger.debug>) => logger.debug(...args);
export const info = (...args: Parameters<typeof logger.info>) => logger.info(...args);
export const warn = (...args: Parameters<typeof logger.warn>) => logger.warn(...args);
export const error = (...args: Parameters<typeof logger.error>) => logger.error(...args);

// Backward compatibility: LogLevel enum (preserved for API compatibility)
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// Factory function for creating namespaced loggers
export function createLogger(namespace: string) {
    return createLoggerWithLevels(baseLogger.child({ module: namespace }));
}

// Default export
export default {
    logger,
    dbLogger,
    authLogger,
    securityLogger,
    cacheLogger,
    actionLogger,
    debug,
    info,
    warn,
    error,
    LogLevel,
    createLogger,
};
