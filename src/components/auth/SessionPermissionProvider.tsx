'use client';

import { createContext, useContext, useMemo } from 'react';
import {
    canApproveTransaction,
    hasPermission,
    type RbacUser,
    type RoleKey,
    type ScopeBoundary,
} from '@/lib/policies/rbac';

export interface SessionPermissionState {
    nik: string;
    isSuperUser: boolean;
    roleKey: RoleKey | null;
    hierarchyLevel: number;
    permissions: string[];
    warehouseIds: number[];
    scopeBoundary: ScopeBoundary;
}

const DEFAULT_STATE: SessionPermissionState = {
    nik: '',
    isSuperUser: false,
    roleKey: null,
    hierarchyLevel: 99,
    permissions: [],
    warehouseIds: [],
    scopeBoundary: { area: null, regional: null, branch: null, serviceArea: null },
};

interface SessionPermissionContextValue extends SessionPermissionState {
    can: (permissionKey: string) => boolean;
    canApprove: (options: {
        permissionKey: string;
        warehouseId?: number | null;
        requesterNik?: string | null;
    }) => boolean;
}

const SessionPermissionContext = createContext<SessionPermissionContextValue>({
    ...DEFAULT_STATE,
    can: () => false,
    canApprove: () => false,
});

export function SessionPermissionProvider({
    value,
    children,
}: {
    value: SessionPermissionState;
    children: React.ReactNode;
}) {
    const contextValue = useMemo<SessionPermissionContextValue>(() => {
        const rbacUser: RbacUser = {
            nik: value.nik,
            isSuperUser: value.isSuperUser,
            roleKey: value.roleKey,
            hierarchyLevel: value.hierarchyLevel,
            permissions: value.permissions,
            warehouseIds: value.warehouseIds,
            scopeBoundary: value.scopeBoundary,
        };

        return {
            ...value,
            can: (permissionKey: string) => hasPermission(rbacUser, permissionKey),
            canApprove: (options) => canApproveTransaction(rbacUser, options),
        };
    }, [value]);

    return (
        <SessionPermissionContext.Provider value={contextValue}>
            {children}
        </SessionPermissionContext.Provider>
    );
}

export function useAuthPermissions() {
    return useContext(SessionPermissionContext);
}
