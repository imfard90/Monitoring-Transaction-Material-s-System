import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@/lib/errors';
import {
    canApproveTransaction,
    canAssignRole,
    hasPermission,
    isSuperUserFromEnv,
    type RbacUser,
    requirePermission,
} from '@/lib/policies';

describe('RBAC + SBAC Policy Helpers', () => {
    describe('isSuperUserFromEnv', () => {
        const mockEnv = {
            SUPERUSER_EMAIL: 'imfard90@gmail.com',
            SUPERUSER_NIK: '906627',
        } as unknown as NodeJS.ProcessEnv;

        it('returns true when both email (case-insensitive) and NIK match', () => {
            expect(isSuperUserFromEnv('IMFARD90@GMAIL.COM', ' 906627 ', mockEnv)).toBe(true);
        });

        it('returns false when email matches but NIK does not', () => {
            expect(isSuperUserFromEnv('imfard90@gmail.com', '123456', mockEnv)).toBe(false);
        });

        it('returns false when NIK matches but email does not', () => {
            expect(isSuperUserFromEnv('other@gmail.com', '906627', mockEnv)).toBe(false);
        });

        it('returns false when env vars are missing (fail-closed)', () => {
            expect(
                isSuperUserFromEnv('imfard90@gmail.com', '906627', {} as NodeJS.ProcessEnv)
            ).toBe(false);
        });
    });

    describe('hasPermission & requirePermission', () => {
        it('grants any permission to SuperUser', () => {
            const superUser: RbacUser = { nik: '906627', isSuperUser: true, permissions: [] };
            expect(hasPermission(superUser, 'users:manage')).toBe(true);
            expect(() => requirePermission(superUser, 'po:approve_tier3')).not.toThrow();
        });

        it('enforces explicit permission keys for regular roles (fail-closed)', () => {
            const staff: RbacUser = {
                nik: '20950080',
                isSuperUser: false,
                roleKey: 'STAFF_GUDANG',
                hierarchyLevel: 5,
                permissions: ['out_sap:create', 'return:approve'],
            };
            expect(hasPermission(staff, 'out_sap:create')).toBe(true);
            expect(hasPermission(staff, 'users:manage')).toBe(false);
            expect(() => requirePermission(staff, 'users:manage')).toThrow(AuthorizationError);
        });

        it('denies null/undefined users (fail-closed)', () => {
            expect(hasPermission(null, 'dashboard:view')).toBe(false);
            expect(() => requirePermission(undefined, 'dashboard:view')).toThrow(
                AuthorizationError
            );
        });
    });

    describe('canApproveTransaction (Permission + Scope + SoD)', () => {
        const branchManager: RbacUser = {
            nik: '20890186',
            isSuperUser: false,
            roleKey: 'PEJABAT_BRANCH',
            hierarchyLevel: 3,
            permissions: ['stock_opname:approve', 'return:approve'],
            warehouseIds: [1, 2, 3],
        };

        it('allows approval when permission, warehouse scope, and SoD all pass', () => {
            expect(
                canApproveTransaction(branchManager, {
                    permissionKey: 'stock_opname:approve',
                    warehouseId: 2,
                    requesterNik: '20950080',
                })
            ).toBe(true);
        });

        it('blocks approval when warehouse is outside user scope', () => {
            expect(
                canApproveTransaction(branchManager, {
                    permissionKey: 'stock_opname:approve',
                    warehouseId: 99,
                    requesterNik: '20950080',
                })
            ).toBe(false);
        });

        it('blocks self-approval via Segregation of Duties (SoD)', () => {
            expect(
                canApproveTransaction(branchManager, {
                    permissionKey: 'stock_opname:approve',
                    warehouseId: 2,
                    requesterNik: '20890186',
                })
            ).toBe(false);
        });

        it('allows SuperUser emergency override', () => {
            const superUser: RbacUser = { nik: '906627', isSuperUser: true };
            expect(
                canApproveTransaction(superUser, {
                    permissionKey: 'stock_opname:approve',
                    warehouseId: 99,
                    requesterNik: '906627',
                })
            ).toBe(true);
        });
    });

    describe('canAssignRole (Privilege Escalation Prevention)', () => {
        it('prevents lower-level admin from assigning higher-level roles', () => {
            const regionalAdmin: RbacUser = {
                nik: '20890186',
                isSuperUser: false,
                hierarchyLevel: 2,
                permissions: ['users:manage'],
            };
            expect(canAssignRole(regionalAdmin, 1)).toBe(false); // Cannot assign PEJABAT_AREA (1)
            expect(canAssignRole(regionalAdmin, 2)).toBe(true); // Can assign PEJABAT_REGIONAL (2)
            expect(canAssignRole(regionalAdmin, 5)).toBe(true); // Can assign STAFF_GUDANG (5)
        });

        it('allows SuperUser to assign any hierarchy level', () => {
            const superUser: RbacUser = { nik: '906627', isSuperUser: true };
            expect(canAssignRole(superUser, 1)).toBe(true);
        });
    });
});
