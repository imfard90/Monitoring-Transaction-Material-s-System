import { describe, expect, it, vi } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { applyInOutTagWarehouseScope, applyWarehouseScope } from '@/lib/db/scopes';
import type { AuthorizationUser } from '@/lib/policies';

describe('applyWarehouseScope', () => {
    const createTestDb = () => new Kysely<any>({ dialect: new PostgresDialect({ pool: {} as any }) });

    it('returns original query untouched if user is not Staff', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const nonStaffUser: AuthorizationUser = {
            nik: 'ADM01',
            role: 'Admin',
            isStaff: false,
            warehouseIds: [1, 2],
        };

        const result = applyWarehouseScope(mockQuery as any, 'warehouse_id', nonStaffUser);
        expect(mockQuery.where).not.toHaveBeenCalled();
        expect(result).toBe(mockQuery);
    });

    it('returns original query untouched if Staff has empty warehouseIds in when-assigned mode', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        };

        const result = applyWarehouseScope(
            mockQuery as any,
            'warehouse_id',
            staffUser,
            'when-assigned'
        );
        expect(mockQuery.where).not.toHaveBeenCalled();
        expect(result).toBe(mockQuery);
    });

    it('filters by [-1] using = ANY($1::int[]) if Staff has empty warehouseIds in always mode', () => {
        const db = createTestDb();
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        };

        const baseQuery = db.selectFrom('inventory.stock_balance').selectAll();
        const scopedQuery = applyWarehouseScope(baseQuery, 'warehouse_id', staffUser, 'always');
        const compiled = scopedQuery.compile();

        expect(compiled.sql).toContain('"warehouse_id" = ANY($1::int[])');
        expect(compiled.parameters).toEqual([[-1]]);
    });

    it('filters by scoped warehouse IDs using = ANY($1::int[]) when Staff is assigned to warehouses', () => {
        const db = createTestDb();
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [10, 20],
        };

        const baseQuery = db.selectFrom('inventory.stock_balance').selectAll();
        const scopedQuery = applyWarehouseScope(baseQuery, 'soh.warehouse_id', staffUser);
        const compiled = scopedQuery.compile();

        expect(compiled.sql).toContain('"soh"."warehouse_id" = ANY($1::int[])');
        expect(compiled.parameters).toEqual([[10, 20]]);
    });

    it('produces identical SQL text for different warehouse counts (plan cache friendly)', () => {
        const db = createTestDb();
        const staff1: AuthorizationUser = { nik: 'S1', role: 'Staff', isStaff: true, warehouseIds: [1] };
        const staff3: AuthorizationUser = { nik: 'S3', role: 'Staff', isStaff: true, warehouseIds: [1, 2, 3] };

        const q1 = applyWarehouseScope(db.selectFrom('inventory.stock_balance').selectAll(), 'warehouse_id', staff1).compile();
        const q3 = applyWarehouseScope(db.selectFrom('inventory.stock_balance').selectAll(), 'warehouse_id', staff3).compile();

        expect(q1.sql).toBe(q3.sql);
        expect(q1.parameters).toEqual([[1]]);
        expect(q3.parameters).toEqual([[1, 2, 3]]);
    });
});

describe('applyInOutTagWarehouseScope', () => {
    const createTestDb = () => new Kysely<any>({ dialect: new PostgresDialect({ pool: {} as any }) });

    it('returns original query if non-staff', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const admin: AuthorizationUser = {
            nik: 'ADM01',
            role: 'Admin',
            isStaff: false,
            warehouseIds: [],
        };

        applyInOutTagWarehouseScope(mockQuery as any, 'from_wh_id', 'to_wh_id', admin);
        expect(mockQuery.where).not.toHaveBeenCalled();
    });

    it('builds an OR filter with = ANY($1::int[]) for from_wh_id and to_wh_id when staff has warehouses', () => {
        const db = createTestDb();
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [5, 6],
        };

        const baseQuery = db.selectFrom('inventory.inout_tag_header').selectAll();
        const scopedQuery = applyInOutTagWarehouseScope(baseQuery, 'from_wh_id', 'to_wh_id', staffUser);
        const compiled = scopedQuery.compile();

        expect(compiled.sql).toContain('"from_wh_id" = ANY($1::int[])');
        expect(compiled.sql).toContain('"to_wh_id" = ANY($2::int[])');
        expect(compiled.parameters).toEqual([[5, 6], [5, 6]]);
    });

    it('filters by [-1] in always mode when staff has no warehouse', () => {
        const db = createTestDb();
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        };

        const baseQuery = db.selectFrom('inventory.inout_tag_header').selectAll();
        const scopedQuery = applyInOutTagWarehouseScope(baseQuery, 'from_wh_id', 'to_wh_id', staffUser, 'always');
        const compiled = scopedQuery.compile();

        expect(compiled.sql).toContain('"from_wh_id" = ANY($1::int[])');
        expect(compiled.parameters).toEqual([[-1]]);
    });
});
