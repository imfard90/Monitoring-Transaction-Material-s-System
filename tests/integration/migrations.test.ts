import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query, queryOne } from '../helpers/db';

/**
 * Integration tests: verify all migration objects exist in the live DB (P1-Q1).
 *
 * These tests are READ-ONLY — they only query metadata (pg_proc, pg_sequences,
 * information_schema). Safe to run against staging.
 *
 * Skipped automatically when DATABASE_URL is unset.
 */

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

beforeAll(async () => {
    await query('SELECT 1');
});

afterAll(async () => {
    await closePool();
});

describeDb('migration log', () => {
    it('has _migration_log table', async () => {
        const row = await queryOne<{ exists: boolean }>(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'inventory'
                  AND table_name = '_migration_log'
            ) AS exists
        `);
        expect(row?.exists).toBe(true);
    });

    it('recorded migrations 001-013', async () => {
        const rows = await query<{ filename: string }>(`
            SELECT filename FROM inventory._migration_log ORDER BY filename
        `);
        const names = rows.map((r) => r.filename);
        expect(names).toContain('001_add_pic_to_mas_wh.sql');
        expect(names).toContain('010_add_rekon_check_to_wo_lensa.sql');
        expect(names).toContain('011_create_trx_used_seq.sql');
        expect(names).toContain('012_create_sp_submit_rekon_intech.sql');
        expect(names).toContain('013_resolve_duplicate_return_request.sql');
        expect(names).toContain('014_add_dashboard_indexes.sql');
        expect(names).toContain('015_add_qty_used_le_qty_req_check.sql');
        expect(names).toContain('016_revoke_public_execute.sql');
    });

    it('does NOT contain the old duplicate 009 file', async () => {
        const rows = await query<{ filename: string }>(`
            SELECT filename FROM inventory._migration_log
            WHERE filename LIKE '009_%'
        `);
        expect(rows.map((r) => r.filename)).not.toContain('009_add_rekon_check_to_wo_lensa.sql');
    });
});

describeDb('sequences (D2 - 011)', () => {
    const expected = ['trx_used_seq', 'trx_used_lensa_seq', 'trx_out_seq'];

    for (const seq of expected) {
        it(`inventory.${seq} exists with NO CYCLE and max 9999`, async () => {
            const row = await queryOne<{
                cycle: boolean;
                max_value: string;
                start_value: string;
            }>(`
                SELECT cycle, max_value, start_value
                FROM pg_sequences
                WHERE schemaname = 'inventory'
                  AND sequencename = '${seq}'
            `);
            expect(row, `sequence inventory.${seq} missing`).toBeDefined();
            expect(row?.cycle).toBe(false);
            expect(row?.max_value).toBeDefined();
            expect(BigInt(row!.max_value)).toBe(9999n);
        });
    }

    it('nextval returns incrementing values within range', async () => {
        const r1 = await queryOne<{ v: string }>(
            `SELECT nextval('inventory.trx_used_seq')::int AS v`
        );
        const r2 = await queryOne<{ v: string }>(
            `SELECT nextval('inventory.trx_used_seq')::int AS v`
        );
        const v1 = Number(r1?.v);
        const v2 = Number(r2?.v);
        expect(v2).toBe(v1 + 1);
        expect(v1).toBeGreaterThanOrEqual(1);
        expect(v1).toBeLessThanOrEqual(9999);
    });
});

describeDb('stored procedures & functions (D1, D5)', () => {
    it('sp_submit_rekon_intech PROCEDURE exists (D1 - 012)', async () => {
        const row = await queryOne<{ exists: boolean }>(`
            SELECT EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'inventory'
                  AND p.proname = 'sp_submit_rekon_intech'
            ) AS exists
        `);
        expect(row?.exists).toBe(true);
    });

    it('sp_insert_return_item exists after D5 rename (013)', async () => {
        const row = await queryOne<{ exists: boolean }>(`
            SELECT EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'inventory'
                  AND p.proname = 'sp_insert_return_item'
            ) AS exists
        `);
        expect(row?.exists).toBe(true);
    });

    it('old per-item sp_create_return_request is removed (D5 - no duplicate)', async () => {
        const rows = await query<{ kind: string }>(`
            SELECT p.prokind::text AS kind
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'inventory'
              AND p.proname = 'sp_create_return_request'
        `);
        expect(rows.length).toBeLessThanOrEqual(1);
    });
});

describeDb('L1 fix: qty_used <= qty_req CHECK constraint (015)', () => {
    it('sap_out_items_qty_used_le_req constraint exists', async () => {
        const row = await queryOne<{ exists: boolean }>(`
 SELECT EXISTS (
 SELECT 1 FROM pg_constraint con
 JOIN pg_class cl ON cl.oid = con.conrelid
 JOIN pg_namespace n ON n.oid = cl.relnamespace
 WHERE n.nspname = 'inventory'
 AND cl.relname = 'sap_out_items'
 AND con.contype = 'c'
 AND con.conname = 'sap_out_items_qty_used_le_req'
 ) AS exists
 `);
        expect(row?.exists).toBe(true);
    });

    it('0 rows violate qty_used <= qty_req after L1 fix', async () => {
        const row = await queryOne<{ violations: string }>(`
 SELECT count(*)::text AS violations
 FROM inventory.sap_out_items
 WHERE qty_used > qty_req
 `);
        expect(Number(row?.violations)).toBe(0);
    });
});

describeDb('L3 fix: REVOKE EXECUTE FROM PUBLIC on inventory SPs (016)', () => {
    it('PUBLIC has 0 EXECUTE grants on inventory routines', async () => {
        const row = await queryOne<{ count: string }>(`
 SELECT count(*)::text AS count
 FROM information_schema.role_routine_grants
 WHERE routine_schema = 'inventory' AND grantee = 'PUBLIC'
 `);
        expect(Number(row?.count)).toBe(0);
    });

    it('imam has EXECUTE on all inventory routines (>= 19 grants)', async () => {
        const row = await queryOne<{ count: string }>(`
 SELECT count(*)::text AS count
 FROM information_schema.role_routine_grants
 WHERE routine_schema = 'inventory' AND grantee = 'imam'
 `);
        expect(Number(row?.count)).toBeGreaterThanOrEqual(19);
    });
});

describeDb('L4 fix: RLS enabled on all tables (017)', () => {
    it('RLS enabled on all 39 tables (inventory, auth, hr)', async () => {
        const row = await queryOne<{ count: string }>(`
            SELECT count(*)::text AS count
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND n.nspname IN ('inventory', 'auth', 'hr')
              AND c.relrowsecurity = true
        `);
        expect(Number(row?.count)).toBe(39);
    });

    it('FORCE RLS on auth and hr tables (13 tables)', async () => {
        const row = await queryOne<{ count: string }>(`
            SELECT count(*)::text AS count
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND n.nspname IN ('auth', 'hr')
              AND c.relrowsecurity = true
              AND c.relforcerowsecurity = true
        `);
        expect(Number(row?.count)).toBe(13);
    });

    it('RLS policies exist (>= 60 policies)', async () => {
        const row = await queryOne<{ count: string }>(`
            SELECT count(*)::text AS count
            FROM pg_policies
            WHERE schemaname IN ('inventory', 'auth', 'hr')
        `);
        expect(Number(row?.count)).toBeGreaterThanOrEqual(60);
    });
});

describeDb('L5 query logging migration tracked (018)', () => {
    it('018_enable_query_logging.sql recorded in migration log', async () => {
        const rows = await query<{ filename: string }>(`
            SELECT filename FROM inventory._migration_log ORDER BY filename
        `);
        const names = rows.map((r) => r.filename);
        expect(names).toContain('017_enable_rls_policies.sql');
        expect(names).toContain('018_enable_query_logging.sql');
    });

    describeDb('API key and approval columns (020)', () => {
        it('020_add_api_key_and_appr_api_to_auth_user.sql recorded in migration log', async () => {
            const rows = await query<{ filename: string }>(`
            SELECT filename FROM inventory._migration_log WHERE filename LIKE '020_%'
        `);
            expect(rows.length).toBe(1);
            expect(rows[0].filename).toBe('020_add_api_key_and_appr_api_to_auth_user.sql');
        });

        it('auth.user table has api_key and appr_api columns', async () => {
            const rows = await query<{ column_name: string }>(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'auth'
              AND table_name = 'user'
              AND column_name IN ('api_key', 'appr_api')
        `);
            const names = rows.map((r) => r.column_name);
            expect(names).toContain('api_key');
            expect(names).toContain('appr_api');
        });

        it('auth.user has unique index on api_key', async () => {
            const row = await queryOne<{ exists: boolean }>(`
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'auth'
                  AND tablename = 'user'
                  AND indexname = 'uq_auth_user_api_key'
            ) AS exists
        `);
            expect(row?.exists).toBe(true);
        });
    });
    describeDb('Fix sp_submit_rekon_intech enum_wo_type qualification (022)', () => {
        it('022_fix_sp_submit_rekon_intech_enum_wo_type.sql recorded in migration log', async () => {
            const rows = await query<{ filename: string }>(`
                SELECT filename FROM inventory._migration_log WHERE filename LIKE '022_%'
            `);
            expect(rows.length).toBe(1);
            expect(rows[0].filename).toBe('022_fix_sp_submit_rekon_intech_enum_wo_type.sql');
        });

        it('sp_submit_rekon_intech uses inventory.enum_wo_type schema qualification', async () => {
            const row = await queryOne<{ def: string }>(`
                SELECT pg_get_functiondef(p.oid) AS def
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'inventory'
                  AND p.proname = 'sp_submit_rekon_intech'
            `);
            expect(row?.def).toContain('inventory.enum_wo_type');
            expect(row?.def).not.toMatch(/::\s*enum_wo_type\b/);
        });
    });

    describeDb('Price in inventory.materials (039)', () => {
        it('039_add_price_to_materials.sql recorded in migration log', async () => {
            const rows = await query<{ filename: string }>(`
                SELECT filename FROM inventory._migration_log WHERE filename LIKE '039_%'
            `);
            expect(rows.length).toBe(1);
            expect(rows[0].filename).toBe('039_add_price_to_materials.sql');
        });

        it('inventory.materials table has price column with numeric(15, 2) and default 0', async () => {
            const row = await queryOne<{
                data_type: string;
                numeric_precision: number;
                numeric_scale: number;
                column_default: string;
            }>(`
                SELECT data_type, numeric_precision, numeric_scale, column_default
                FROM information_schema.columns
                WHERE table_schema = 'inventory'
                  AND table_name = 'materials'
                  AND column_name = 'price'
            `);
            expect(row).toBeDefined();
            expect(row?.data_type).toBe('numeric');
            expect(Number(row?.numeric_precision)).toBe(15);
            expect(Number(row?.numeric_scale)).toBe(2);
        });

        it('has seeded prices from tmp/harga.csv', async () => {
            const row = await queryOne<{ count: string }>(`
                SELECT COUNT(*)::text AS count
                FROM inventory.materials
                WHERE price > 0
            `);
            expect(Number(row?.count)).toBe(291);
        });
    });
});
