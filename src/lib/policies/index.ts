export type AuthorizationUser = {
    nik: string;
    role: string | null;
    warehouseIds: number[];
    isStaff: boolean;
    branchId?: number | null;
    branchName?: string | null;
};

export type InOutTagAuthorizationResource = {
    from_wh_id: number | string | null;
    to_wh_id: number | string | null;
    from_pic_1: string | null;
    from_pic_2: string | null;
    to_pic_1: string | null;
    to_pic_2: string | null;
    end_status?: string | null;
};

export type InOutTagActionType = 'request' | 'send' | 'accept';

export type WarehouseScopeMode = 'when-assigned' | 'always';

/**
 * Returns warehouse IDs to scope query to, or null no filtering.
 *
 * - 'when-assigned': Staff empty warehouseIds → null (no filter, show all)
 * - 'always': Staff empty warehouseIds → [] (filter to nothing)
 * - non-Staff: always null (no filter)
 */
export function warehouseScope(user: AuthorizationUser, mode: WarehouseScopeMode): number[] | null {
    if (!user.isStaff) return null;
    if (mode === 'when-assigned' && user.warehouseIds.length === 0) return null;
    return user.warehouseIds;
}

function isPic(user: AuthorizationUser, pic1: string | null, pic2: string | null): boolean {
    return (pic1 !== null && user.nik === pic1) || (pic2 !== null && user.nik === pic2);
}

export function canUpdateInOutTag(
    user: AuthorizationUser,
    header: InOutTagAuthorizationResource,
    action: InOutTagActionType
): boolean {
    if (!user.isStaff) return true;

    const fromWarehouse = Number(header.from_wh_id);
    const toWarehouse = Number(header.to_wh_id);

    if (action === 'send') {
        const hasFromWarehouse = user.warehouseIds.includes(fromWarehouse);
        const hasFromPic = isPic(user, header.from_pic_1, header.from_pic_2);
        return hasFromWarehouse || hasFromPic;
    }

    if (action === 'accept') {
        const hasToWarehouse = user.warehouseIds.includes(toWarehouse);
        const hasToPic = isPic(user, header.to_pic_1, header.to_pic_2);
        return hasToWarehouse || hasToPic;
    }

    // request - always allowed
    return true;
}

export function canCancelInOutTag(
    user: AuthorizationUser,
    header: InOutTagAuthorizationResource,
    isReturn: boolean
): boolean {
    if (!user.isStaff) return true;

    const fromWarehouse = Number(header.from_wh_id);
    const toWarehouse = Number(header.to_wh_id);

    // Block if status closed/cancel (non-return only)
    if (
        !isReturn &&
        header.end_status &&
        (header.end_status === 'closed' || header.end_status === 'cancel')
    ) {
        return false;
    }

    if (isReturn) {
        // Return: must have PIC or warehouse access on BOTH from and to
        const hasFromAccess =
            user.warehouseIds.includes(fromWarehouse) ||
            isPic(user, header.from_pic_1, header.from_pic_2);
        const hasToAccess =
            user.warehouseIds.includes(toWarehouse) ||
            isPic(user, header.to_pic_1, header.to_pic_2);
        return hasFromAccess && hasToAccess;
    }

    // Non-return: must have PIC or warehouse access on EITHER from OR to
    const hasFromAccess =
        user.warehouseIds.includes(fromWarehouse) ||
        isPic(user, header.from_pic_1, header.from_pic_2);
    const hasToAccess =
        user.warehouseIds.includes(toWarehouse) || isPic(user, header.to_pic_1, header.to_pic_2);
    return hasFromAccess || hasToAccess;
}

export function canAccessWarehouse(user: AuthorizationUser, warehouseId: number | null): boolean {
    if (!user.isStaff) return warehouseId !== null;
    if (warehouseId === null) return false;
    return user.warehouseIds.includes(warehouseId);
}

export function canAccessReturnWarehouse(
    user: AuthorizationUser,
    fromWarehouseId: number | null,
    toWarehouseId: number | null
): boolean {
    if (!user.isStaff) return true;
    if (fromWarehouseId === null || toWarehouseId === null) return false;
    return user.warehouseIds.includes(fromWarehouseId) || user.warehouseIds.includes(toWarehouseId);
}

export function canAccessManagement(user: AuthorizationUser): boolean {
    if (!user.role) return false;
    return user.role !== 'Staff' && user.role !== 'Teknisi';
}

export function canAccessTechnicianManagement(user: AuthorizationUser): boolean {
    if (!user.role) return false;
    return user.role !== 'Teknisi';
}

export function canApproveStockOpname(user: AuthorizationUser): boolean {
    return !user.isStaff;
}

export function canCreateInOutTag(user: AuthorizationUser): boolean {
    return !user.isStaff;
}

export function canSyncStock(user: AuthorizationUser): boolean {
    return !user.isStaff;
}
