import { describe, it, expect } from 'vitest';
import {
    warehouseScope,
    canAccessWarehouse,
    canSyncStock,
    canUpdateInOutTag,
    canCancelInOutTag,
    canAccessReturnWarehouse,
    canAccessManagement,
    canAccessTechnicianManagement,
    canApproveStockOpname,
    canCreateInOutTag,
} from '@/lib/policies';
import type { AuthorizationUser, InOutTagAuthorizationResource } from '@/lib/policies';

const staff: AuthorizationUser = {
    nik: 'STAFF-1',
    role: 'Staff',
    warehouseIds: [1],
    isStaff: true,
    branchId: 1,
    branchName: 'Branch 1',
};

const header: InOutTagAuthorizationResource = {
    from_wh_id: 1,
    to_wh_id: 2,
    from_pic_1: 'PIC-1',
    from_pic_2: 'PIC-2',
    to_pic_1: 'PIC-3',
    to_pic_2: 'PIC-4',
    end_status: 'open',
};

describe('warehouseScope', () => {
    it('returns warehouseIds for Staff with warehouses (when-assigned)', () => {
        expect(warehouseScope(staff, 'when-assigned')).toEqual([1]);
    });

    it('returns warehouseIds for Staff with warehouses (always)', () => {
        expect(warehouseScope(staff, 'always')).toEqual([1]);
    });

    it('returns null for Staff with empty warehouseIds (when-assigned)', () => {
        expect(warehouseScope({ ...staff, warehouseIds: [] }, 'when-assigned')).toBeNull();
    });

    it('returns empty array for Staff with empty warehouseIds (always)', () => {
        expect(warehouseScope({ ...staff, warehouseIds: [] }, 'always')).toEqual([]);
    });

    it('returns null for non-Staff always (always)', () => {
        expect(warehouseScope({ ...staff, isStaff: false }, 'always')).toBeNull();
    });
});

describe('canAccessWarehouse', () => {
    it('allows non-Staff for any warehouse', () => {
        expect(canAccessWarehouse({ ...staff, isStaff: false }, 1)).toBe(true);
        expect(canAccessWarehouse({ ...staff, isStaff: false }, 2)).toBe(true);
    });

    it('allows Staff for assigned warehouse', () => {
        expect(canAccessWarehouse(staff, 1)).toBe(true);
    });

    it('denies Staff for other warehouse', () => {
        expect(canAccessWarehouse(staff, 2)).toBe(false);
    });

    it('denies Staff for null warehouseId', () => {
        expect(canAccessWarehouse(staff, null)).toBe(false);
    });

    it('denies non-Staff for null warehouseId', () => {
        expect(canAccessWarehouse({ ...staff, isStaff: false }, null)).toBe(false);
    });
});

describe('canSyncStock', () => {
    it('allows non-Staff', () => {
        expect(canSyncStock({ ...staff, isStaff: false })).toBe(true);
    });

    it('denies Staff', () => {
        expect(canSyncStock(staff)).toBe(false);
    });
});

describe('canUpdateInOutTag', () => {
    it('send by from warehouse or PIC; accept by warehouse or PIC; request always; non-Staff always', () => {
        // send - Staff with from warehouse access
        expect(canUpdateInOutTag(staff, header, 'send')).toBe(true);
        // send - Staff with from PIC access
        expect(
            canUpdateInOutTag({ ...staff, warehouseIds: [3], nik: 'PIC-1' }, header, 'send')
        ).toBe(true);
        // send - Staff without warehouse nor PIC
        expect(
            canUpdateInOutTag({ ...staff, warehouseIds: [3], nik: 'OTHER' }, header, 'send')
        ).toBe(false);
        // accept - Staff with to warehouse access
        expect(canUpdateInOutTag({ ...staff, warehouseIds: [2] }, header, 'accept')).toBe(true);
        // accept - Staff with to PIC access
        expect(
            canUpdateInOutTag({ ...staff, warehouseIds: [3], nik: 'PIC-3' }, header, 'accept')
        ).toBe(true);
        // accept - Staff without warehouse nor PIC
        expect(
            canUpdateInOutTag({ ...staff, warehouseIds: [3], nik: 'OTHER' }, header, 'accept')
        ).toBe(false);
        // request - always allowed for Staff
        expect(canUpdateInOutTag(staff, header, 'request')).toBe(true);
        // non-Staff always allowed
        expect(canUpdateInOutTag({ ...staff, isStaff: false }, header, 'send')).toBe(true);
        expect(canUpdateInOutTag({ ...staff, isStaff: false }, header, 'accept')).toBe(true);
        expect(canUpdateInOutTag({ ...staff, isStaff: false }, header, 'request')).toBe(true);
    });
});

describe('canCancelInOutTag', () => {
    it('non-return: from warehouse or PIC; to warehouse or PIC; blocked if closed/cancel; non-Staff always', () => {
        // Staff with from warehouse
        expect(canCancelInOutTag({ ...staff, warehouseIds: [1] }, header, false)).toBe(true);
        // Staff with to warehouse
        expect(canCancelInOutTag({ ...staff, warehouseIds: [2] }, header, false)).toBe(true);
        // Staff with from PIC
        expect(
            canCancelInOutTag({ ...staff, warehouseIds: [3], nik: 'PIC-1' }, header, false)
        ).toBe(true);
        // Staff with to PIC
        expect(
            canCancelInOutTag({ ...staff, warehouseIds: [3], nik: 'PIC-3' }, header, false)
        ).toBe(true);
        // Staff without warehouse nor PIC
        expect(canCancelInOutTag({ ...staff, warehouseIds: [3] }, header, false)).toBe(false);
        // blocked if closed
        const closedHeader = { ...header, end_status: 'closed' };
        expect(canCancelInOutTag(staff, closedHeader, false)).toBe(false);
        // blocked if cancel
        const cancelHeader = { ...header, end_status: 'cancel' };
        expect(canCancelInOutTag(staff, cancelHeader, false)).toBe(false);
    });

    it('return: requires both from AND to warehouse or PIC; non-Staff always', () => {
        // Staff with both warehouses
        expect(canCancelInOutTag({ ...staff, warehouseIds: [1, 2] }, header, true)).toBe(true);
        // Staff with from warehouse and to PIC
        expect(canCancelInOutTag({ ...staff, warehouseIds: [1], nik: 'PIC-3' }, header, true)).toBe(
            true
        );
        // Staff with from PIC and to warehouse
        expect(canCancelInOutTag({ ...staff, warehouseIds: [2], nik: 'PIC-1' }, header, true)).toBe(
            true
        );
        // Staff with both PICs
        expect(
            canCancelInOutTag(
                { ...staff, warehouseIds: [3], nik: 'PIC-1' },
                { ...header, to_pic_1: 'PIC-1' },
                true
            )
        ).toBe(true);
        // Staff with from warehouse only
        expect(canCancelInOutTag({ ...staff, warehouseIds: [1] }, header, true)).toBe(false);
        // Staff with to warehouse only
        expect(canCancelInOutTag({ ...staff, warehouseIds: [2] }, header, true)).toBe(false);
        // Staff with neither
        expect(canCancelInOutTag({ ...staff, warehouseIds: [3] }, header, true)).toBe(false);
    });

    it('non-Staff always allowed', () => {
        expect(canCancelInOutTag({ ...staff, isStaff: false }, header, false)).toBe(true);
        expect(canCancelInOutTag({ ...staff, isStaff: false }, header, true)).toBe(true);
    });
});

describe('canAccessReturnWarehouse', () => {
    it('Staff needs matching from or warehouse; null blocks; non-Staff always', () => {
        // Staff warehouse match from
        expect(canAccessReturnWarehouse({ ...staff, warehouseIds: [1] }, 1, 2)).toBe(true);
        // Staff with to warehouse match
        expect(canAccessReturnWarehouse({ ...staff, warehouseIds: [1] }, 2, 1)).toBe(true);
        // Staff with neither warehouse
        expect(canAccessReturnWarehouse({ ...staff, warehouseIds: [3] }, 1, 2)).toBe(false);
        // null fromWarehouseId blocks
        expect(canAccessReturnWarehouse(staff, null, 1)).toBe(false);
        // null toWarehouseId blocks
        expect(canAccessReturnWarehouse(staff, 1, null)).toBe(false);
        // non-Staff always
        expect(canAccessReturnWarehouse({ ...staff, isStaff: false }, null, 1)).toBe(true);
        expect(canAccessReturnWarehouse({ ...staff, isStaff: false }, 1, null)).toBe(true);
    });
});

describe('canAccessManagement', () => {
    it('allows Admin', () => {
        expect(canAccessManagement({ ...staff, role: 'Admin' })).toBe(true);
    });
    it('allows Administrator', () => {
        expect(canAccessManagement({ ...staff, role: 'Administrator' })).toBe(true);
    });
    it('allows Supervisor', () => {
        expect(canAccessManagement({ ...staff, role: 'Supervisor' })).toBe(true);
    });
    it('allows Officer 3', () => {
        expect(canAccessManagement({ ...staff, role: 'Officer 3' })).toBe(true);
    });
    it('allows Manager', () => {
        expect(canAccessManagement({ ...staff, role: 'Manager' })).toBe(true);
    });
    it('denies Staff', () => {
        expect(canAccessManagement(staff)).toBe(false);
    });
    it('denies Teknisi', () => {
        expect(canAccessManagement({ ...staff, role: 'Teknisi' })).toBe(false);
    });
    it('denies null role', () => {
        expect(canAccessManagement({ ...staff, role: null })).toBe(false);
    });
});

describe('canAccessTechnicianManagement', () => {
    it('allows Admin', () => {
        expect(canAccessTechnicianManagement({ ...staff, role: 'Admin' })).toBe(true);
    });
    it('allows Administrator', () => {
        expect(canAccessTechnicianManagement({ ...staff, role: 'Administrator' })).toBe(true);
    });
    it('allows Supervisor', () => {
        expect(canAccessTechnicianManagement({ ...staff, role: 'Supervisor' })).toBe(true);
    });
    it('allows Staff', () => {
        expect(canAccessTechnicianManagement(staff)).toBe(true);
    });
    it('denies Teknisi', () => {
        expect(canAccessTechnicianManagement({ ...staff, role: 'Teknisi' })).toBe(false);
    });
    it('denies null role', () => {
        expect(canAccessTechnicianManagement({ ...staff, role: null })).toBe(false);
    });
});

describe('canApproveStockOpname', () => {
    it('allows non-Staff', () => {
        expect(canApproveStockOpname({ ...staff, isStaff: false })).toBe(true);
    });
    it('denies Staff', () => {
        expect(canApproveStockOpname(staff)).toBe(false);
    });
});

describe('canCreateInOutTag', () => {
    it('allows non-Staff', () => {
        expect(canCreateInOutTag({ ...staff, isStaff: false })).toBe(true);
    });

    it('denies Staff', () => {
        expect(canCreateInOutTag(staff)).toBe(false);
    });
});

describe('canSyncStock', () => {
    it('allows non-Staff', () => {
        expect(canSyncStock({ ...staff, isStaff: false })).toBe(true);
    });
    it('denies Staff', () => {
        expect(canSyncStock(staff)).toBe(false);
    });
});
