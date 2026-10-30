import { describe, expect, it, vi } from 'vitest';
import { applyInOutTagWarehouseScope, applyWarehouseScope } from '@/lib/db/scopes';
import type { AuthorizationUser } from '@/lib/policies';

describe('applyWarehouseScope', () => {
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

    it('filters by [-1] if Staff has empty warehouseIds in always mode', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        };

        applyWarehouseScope(mockQuery as any, 'warehouse_id', staffUser, 'always');
        expect(mockQuery.where).toHaveBeenCalledWith('warehouse_id', 'in', [-1]);
    });

    it('filters by scoped warehouse IDs when Staff is assigned to warehouses', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [10, 20],
        };

        applyWarehouseScope(mockQuery as any, 'soh.warehouse_id', staffUser);
        expect(mockQuery.where).toHaveBeenCalledWith('soh.warehouse_id', 'in', [10, 20]);
    });
});

describe('applyInOutTagWarehouseScope', () => {
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

    it('builds an OR filter for from_wh_id and to_wh_id when staff has warehouses', () => {
        const mockQuery = { where: vi.fn().mockReturnThis() };
        const staffUser: AuthorizationUser = {
            nik: 'STF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [5, 6],
        };

        applyInOutTagWarehouseScope(mockQuery as any, 'from_wh_id', 'to_wh_id', staffUser);

        expect(mockQuery.where).toHaveBeenCalled();
        const callback = mockQuery.where.mock.calls[0][0];

        const mockEb = vi.fn((col, op, val) => ({ col, op, val }));
        (mockEb as any).or = vi.fn((arr) => arr);

        callback(mockEb);
        expect(mockEb).toHaveBeenCalledWith('from_wh_id', 'in', [5, 6]);
        expect(mockEb).toHaveBeenCalledWith('to_wh_id', 'in', [5, 6]);
    });
});
