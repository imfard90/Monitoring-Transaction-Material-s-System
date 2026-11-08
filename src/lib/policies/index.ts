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
 * - 'when-assigned': Staff empty warehouseIds → null (no filter, show all) — LEGACY, fail-open
 * - 'always': Staff empty warehouseIds → [] (filter to nothing) — fail-closed
 * - non-Staff: always null (no filter)
 *
 * @deprecated Prefer {@link resolveWarehouseScope}. The `null` / `[]` / `null` triple
 * return shape is easy to misuse: `if (ids)` treats `[]` as truthy, and
 * `ids && ids.length > 0` silently drops the filter and leaks all warehouses.
 */
export function warehouseScope(user: AuthorizationUser, mode: WarehouseScopeMode): number[] | null {
    if (!user.isStaff) return null;
    if (mode === 'when-assigned' && user.warehouseIds.length === 0) return null;
    return user.warehouseIds;
}

/**
 * Resolved warehouse scope with an explicit, unambiguous shape.
 *
 * - `all`   → no warehouse filter (non-Staff, or a comparison panel that intentionally
 *             shows every warehouse).
 * - `none`  → the user may see nothing; callers must short-circuit and return an empty
 *             result. Never pass this to an `IN` clause (PostgreSQL rejects `IN ()`).
 * - `scoped` → filter by `ids`; `ids` is guaranteed non-empty.
 */
export type ResolvedWarehouseScope =
    | { kind: 'all' }
    | { kind: 'none' }
    | { kind: 'scoped'; ids: number[] };

/**
 * Resolves the warehouse scope for a request in a fail-closed way.
 *
 * Staff users are always restricted to their assigned warehouses. A Staff user with
 * no warehouse assignment resolves to `none` (sees nothing) instead of falling through
 * to "see everything".
 *
 * @param user Authenticated user.
 * @param options.includeAllWhenUnassigned Set to `true` only for panels whose sole
 *        purpose is cross-warehouse comparison and whose payload is aggregate-only.
 */
export function resolveWarehouseScope(
    user: AuthorizationUser,
    options: { includeAllWhenUnassigned?: boolean } = {}
): ResolvedWarehouseScope {
    if (!user.isStaff) return { kind: 'all' };
    if (user.warehouseIds.length === 0) {
        return options.includeAllWhenUnassigned ? { kind: 'all' } : { kind: 'none' };
    }
    return { kind: 'scoped', ids: user.warehouseIds };
}

/**
 * Cache-key fragment describing the warehouse scope of a request.
 *
 * Scoped caches MUST include this fragment, otherwise users with different
 * warehouse assignments share cached results (cross-tenant data leak).
 */
export function warehouseScopeCacheKey(scope: ResolvedWarehouseScope): string {
    if (scope.kind === 'all') return 'all';
    if (scope.kind === 'none') return 'none';
    return scope.ids
        .slice()
        .sort((a, b) => a - b)
        .join('_');
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
