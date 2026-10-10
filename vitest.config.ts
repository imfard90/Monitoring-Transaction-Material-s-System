import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest configuration for MTMS (P1-Q1: Test harness setup).
 *
 * Two test projects:
 *  - unit        → pure Node, no DB, fast. Mocks for auth/db.
 *  - integration → talks to PostgreSQL via DATABASE_URL. Skipped automatically
 *                  if DATABASE_URL is unset (handled in test file via describeIfDb).
 *
 * Uses `test.projects` (Vitest 5+ — `workspace` is deprecated/removed).
 */
export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    test: {
        globals: true,
        projects: [
            {
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['tests/unit/**/*.test.ts'],
                },
            },
            {
                test: {
                    name: 'integration',
                    environment: 'node',
                    include: ['tests/integration/**/*.test.ts'],
                    testTimeout: 30_000,
                },
            },
        ],
    },
});
