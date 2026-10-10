import type { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';

/**
 * Higher-order functions for common patterns
 */

/**
 * Wraps a handler with Zod validation
 * @example
 * export const createTag = withValidation(
 *   createTagSchema,
 *   async (data) => {
 *     // data is type-safe and validated
 *     return await db.insertInto('inout_tag')...
 *   }
 * )
 */
export const withValidation =
    <S extends z.ZodTypeAny, R>(schema: S, handler: (data: z.infer<S>) => Promise<R>) =>
    async (input: unknown): Promise<R> => {
        const parsed = schema.parse(input);
        return handler(parsed);
    };

/**
 * Wraps a handler with authentication check
 */
export const withAuth =
    <R>(handler: (user: Awaited<ReturnType<typeof getSessionUser>>) => Promise<R>) =>
    async (): Promise<R> => {
        const user = await getSessionUser();
        if (!user) {
            throw new Error('Unauthorized: User not authenticated');
        }
        return handler(user);
    };

/**
 * Wraps a handler with both auth and validation
 */
export const withAuthAndValidation =
    <S extends z.ZodTypeAny, R>(
        schema: S,
        handler: (
            data: z.infer<S>,
            user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>
        ) => Promise<R>
    ) =>
    async (input: unknown): Promise<R> => {
        const user = await getSessionUser();
        if (!user) {
            throw new Error('Unauthorized: User not authenticated');
        }
        const parsed = schema.parse(input);
        return handler(parsed, user);
    };

/**
 * Wraps a handler with try-catch error handling
 */
export const withErrorHandling =
    <T extends unknown[], R>(handler: (...args: T) => Promise<R>) =>
    async (...args: T): Promise<{ success: true; data: R } | { success: false; error: string }> => {
        try {
            const data = await handler(...args);
            return { success: true, data };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('withErrorHandling caught:', error);
            return { success: false, error: message };
        }
    };

/**
 * Wraps a handler with logging
 */
export const withLogging =
    <T extends unknown[], R>(name: string, handler: (...args: T) => Promise<R>) =>
    async (...args: T): Promise<R> => {
        const start = Date.now();
        console.log(`[${name}] Starting with args:`, args.length);
        try {
            const result = await handler(...args);
            const duration = Date.now() - start;
            console.log(`[${name}] Completed in ${duration}ms`);
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            console.error(`[${name}] Failed after ${duration}ms:`, error);
            throw error;
        }
    };

/**
 * Wraps a handler with rate limiting (simple in-memory)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
export const withRateLimit =
    <T extends unknown[], R>(
        key: string,
        maxRequests: number,
        windowMs: number,
        handler: (...args: T) => Promise<R>
    ) =>
    async (...args: T): Promise<R> => {
        const now = Date.now();
        const record = rateLimitMap.get(key);

        if (record && record.resetAt > now) {
            if (record.count >= maxRequests) {
                throw new Error(`Rate limit exceeded for ${key}`);
            }
            record.count += 1;
        } else {
            rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        }

        return handler(...args);
    };
