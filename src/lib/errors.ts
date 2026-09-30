/**
 * Centralized Error Handling Utilities
 * Provides consistent error handling across the application
 */

import { logger } from './logger';

// ============================================
// ERROR TYPES
// ============================================

export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public isOperational: boolean = true
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(
        message: string,
        public field?: string
    ) {
        super(message, 'VALIDATION_ERROR', 400);
        this.name = 'ValidationError';
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 'AUTHENTICATION_ERROR', 401);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Access denied') {
        super(message, 'AUTHORIZATION_ERROR', 403);
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 'CONFLICT_ERROR', 409);
        this.name = 'ConflictError';
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Too many requests') {
        super(message, 'RATE_LIMIT_ERROR', 429);
        this.name = 'RateLimitError';
    }
}

export class ExternalServiceError extends AppError {
    constructor(service: string) {
        super(`External service error: ${service}`, 'EXTERNAL_SERVICE_ERROR', 502);
        this.name = 'ExternalServiceError';
    }
}

// ============================================
// ERROR HANDLER
// ============================================

interface ErrorLogContext {
    userId?: string;
    path?: string;
    method?: string;
    body?: unknown;
    query?: Record<string, unknown>;
}

class ErrorHandler {
    private isDevelopment = process.env.NODE_ENV !== 'production';

    /**
     * Log error with context
     */
    log(error: Error, context?: ErrorLogContext): void {
        const errorInfo = {
            name: error.name,
            stack: this.isDevelopment ? error.stack : undefined,
            context,
        };

        if (this.isDevelopment) {
            logger.error(`[ERROR] ${error.message}`, error, errorInfo);
        } else {
            logger.error(`[ERROR] ${error.message}`, error, {
                ...errorInfo,
                context: {
                    ...context,
                    body: undefined, // Redact body in production
                },
            });
        }
    }

    /**
     * Handle error and return response
     */
    handle(error: unknown): {
        success: false;
        error: {
            code: string;
            message: string;
            statusCode: number;
            details?: unknown;
        };
    } {
        if (error instanceof AppError) {
            this.log(error);
            return {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    statusCode: error.statusCode,
                },
            };
        }

        // Handle unknown errors
        const unknownError = error instanceof Error ? error : new Error(String(error));
        this.log(unknownError);

        return {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: this.isDevelopment ? unknownError.message : 'An unexpected error occurred',
                statusCode: 500,
            },
        };
    }

    /**
     * Create error response for API routes
     */
    toResponse(error: unknown): Response {
        const handled = this.handle(error);
        return Response.json(handled, {
            status: handled.error.statusCode,
        });
    }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// ============================================
// ERROR FACTORY
// ============================================

export const errors = {
    validation: (message: string, field?: string) => new ValidationError(message, field),
    auth: (message?: string) => new AuthenticationError(message),
    accessDenied: () => new AuthorizationError(),
    notFound: (resource: string) => new NotFoundError(resource),
    conflict: (message: string) => new ConflictError(message),
    rateLimit: (message?: string) => new RateLimitError(message),
    externalService: (service: string) => new ExternalServiceError(service),
    internal: (message: string) => new AppError(message, 'INTERNAL_ERROR', 500),
};

// ============================================
// ASYNC WRAPPER
// ============================================

/**
 * Wrap async route handler with error handling (For API Routes)
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    handler: T,
    context?: ErrorLogContext
): T {
    return (async (...args: any[]) => {
        try {
            return await handler(...args);
        } catch (error) {
            errorHandler.log(error instanceof Error ? error : new Error(String(error)), context);
            return errorHandler.handle(error);
        }
    }) as T;
}

/**
 * Wrap Server Actions with error handling (Returns flat error string for client compatibility)
 */
export function withActionErrorHandling<T extends (...args: any[]) => Promise<any>>(
    handler: T,
    context?: ErrorLogContext
) {
    return async (...args: Parameters<T>) => {
        try {
            return await handler(...args);
        } catch (error) {
            errorHandler.log(error instanceof Error ? error : new Error(String(error)), context);
            const handled = errorHandler.handle(error);
            // Return flat string to maintain compatibility with existing MTMS client components
            return {
                success: false as const,
                error: handled.error.message,
            };
        }
    };
}

// ============================================
// CLIENT ERROR UTILITIES
// ============================================

/**
 * Parse error from API response
 */
export function parseApiError(response: unknown): string {
    if (typeof response === 'object' && response !== null) {
        const error = response as { error?: { message?: string } };
        return error.error?.message || 'An error occurred';
    }
    return 'An error occurred';
}

/**
 * Format error message for display
 */
export function formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unexpected error occurred';
}
