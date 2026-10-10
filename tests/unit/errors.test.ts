import { describe, expect, it } from 'vitest';
import {
    AppError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    ExternalServiceError,
    NotFoundError,
    RateLimitError,
    ValidationError,
    errors,
    errorHandler,
    parseApiError,
    withActionErrorHandling,
    withErrorHandling,
} from '@/lib/errors';

/**
 * Unit tests for the error taxonomy and helpers (P1-Q1).
 * Verifies the contract used by auth guards and server actions.
 */

describe('Error classes', () => {
    it('AppError sets code, statusCode, isOperational', () => {
        const e = new AppError('boom', 'CUSTOM', 503);
        expect(e.message).toBe('boom');
        expect(e.code).toBe('CUSTOM');
        expect(e.statusCode).toBe(503);
        expect(e.isOperational).toBe(true);
        expect(e.name).toBe('AppError');
    });

    it('ValidationError defaults to 400 and carries field', () => {
        const e = new ValidationError('bad', 'email');
        expect(e.code).toBe('VALIDATION_ERROR');
        expect(e.statusCode).toBe(400);
        expect(e.field).toBe('email');
    });

    it('AuthenticationError defaults to 401', () => {
        expect(new AuthenticationError().statusCode).toBe(401);
        expect(new AuthenticationError().code).toBe('AUTHENTICATION_ERROR');
    });

    it('AuthorizationError defaults to 403', () => {
        expect(new AuthorizationError().statusCode).toBe(403);
    });

    it('NotFoundError builds resource message + 404', () => {
        const e = new NotFoundError('User');
        expect(e.message).toBe('User not found');
        expect(e.statusCode).toBe(404);
    });

    it('ConflictError defaults to 409', () => {
        expect(new ConflictError('dup').statusCode).toBe(409);
    });

    it('RateLimitError defaults to 429', () => {
        expect(new RateLimitError().statusCode).toBe(429);
    });

    it('ExternalServiceError defaults to 502', () => {
        const e = new ExternalServiceError('Resend');
        expect(e.statusCode).toBe(502);
    });
});

describe('errors factory', () => {
    it('errors.auth() → AuthenticationError', () => {
        expect(errors.auth()).toBeInstanceOf(AuthenticationError);
    });

    it('errors.accessDenied() → AuthorizationError', () => {
        expect(errors.accessDenied()).toBeInstanceOf(AuthorizationError);
    });

    it('errors.validation() → ValidationError', () => {
        expect(errors.validation('bad')).toBeInstanceOf(ValidationError);
    });

    it('errors.notFound() → NotFoundError', () => {
        expect(errors.notFound('Item')).toBeInstanceOf(NotFoundError);
    });

    it('errors.conflict() → ConflictError', () => {
        expect(errors.conflict('dup')).toBeInstanceOf(ConflictError);
    });

    it('errors.internal() → AppError INTERNAL_ERROR 500', () => {
        const e = errors.internal('oops');
        expect(e).toBeInstanceOf(AppError);
        expect(e.code).toBe('INTERNAL_ERROR');
        expect(e.statusCode).toBe(500);
    });
});

describe('errorHandler.handle', () => {
    it('maps AppError to { success:false, error }', () => {
        const res = errorHandler.handle(new ValidationError('bad', 'email'));
        expect(res.success).toBe(false);
        expect(res.error.code).toBe('VALIDATION_ERROR');
        expect(res.error.statusCode).toBe(400);
    });

    it('maps unknown Error to INTERNAL_ERROR', () => {
        const res = errorHandler.handle(new Error('unexpected'));
        expect(res.success).toBe(false);
        expect(res.error.code).toBe('INTERNAL_ERROR');
        expect(res.error.statusCode).toBe(500);
    });
});

describe('withActionErrorHandling', () => {
    it('returns raw handler result on success', async () => {
        const fn = withActionErrorHandling(async (x: number) => x * 2);
        const res = await fn(21);
        // On success the raw value is returned (not wrapped) — only errors are wrapped
        // as { success: false, error: string } for client compatibility.
        expect(res).toBe(42);
    });

    it('returns flat error string on failure (client compat)', async () => {
        const fn = withActionErrorHandling(async () => {
            throw new ValidationError('bad input');
        });
        const res = await fn();
        expect(res).toEqual({ success: false, error: 'bad input' });
    });
});

describe('withErrorHandling', () => {
    it('returns structured error on failure', async () => {
        const fn = withErrorHandling(async () => {
            throw new Error('kaboom');
        });
        const res = (await fn()) as { success: false; error: { statusCode: number } };
        expect(res.success).toBe(false);
        expect(res.error.statusCode).toBe(500);
    });
});

describe('parseApiError', () => {
    it('extracts nested error.message', () => {
        expect(parseApiError({ error: { message: 'nope' } })).toBe('nope');
    });

    it('falls back to generic message', () => {
        expect(parseApiError(null)).toBe('An error occurred');
        expect(parseApiError({})).toBe('An error occurred');
    });
});
