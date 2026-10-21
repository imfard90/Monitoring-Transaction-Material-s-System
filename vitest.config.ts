import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

/**
 * Vitest configuration MTMS (P1-Q1: Test harness setup).
 *
 * Two test projects:
 * - unit → pure Node, no DB, fast. Mocks auth/db.
 * - integration → talks PostgreSQL DATABASE_URL. Skipped automatically
 *   if DATABASE_URL unset (handled in test file via describeIfDb).
 *
 * Uses `test.projects` with `defineProject()` (Vitest 5+).
 */
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    test: {
        globals: true,
        projects: [
            defineProject({
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['tests/unit/**/*.test.ts'],
                },
            }),
            defineProject({
                test: {
                    name: 'integration',
                    environment: 'node',
                    include: ['tests/integration/**/*.test.ts'],
                    testTimeout: 30_000,
                },
            }),
        ],
    },
});
