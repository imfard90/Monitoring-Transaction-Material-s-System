import type { AuthorizationUser, WarehouseScopeMode } from '@/lib/policies';
import { warehouseScope } from '@/lib/policies';

/**
 * Applies warehouse scoping filter to a Kysely SelectQueryBuilder.
 *
 * @param query The Kysely query builder
 * @param column The warehouse ID column (e.g. 'warehouse_id' or 'soh.warehouse_id')
 * @param user The authenticated user
 * @param mode 'when-assigned' (default) or 'always'
 */
export function applyWarehouseScope<QB extends { where: (col: any, op: any, val: any) => QB }>(
    query: QB,
    column: any,
    user: AuthorizationUser,
    mode: WarehouseScopeMode = 'when-assigned'
): QB {
    const scopedIds = warehouseScope(user, mode);
    if (!scopedIds) return query;

    if (scopedIds.length === 0) {
        // Staff without any assigned warehouse in 'always' mode -> match nothing
        return query.where(column, 'in', [-1]);
    }

    return query.where(column, 'in', scopedIds);
}

/**
 * Applies warehouse scoping for transfer transactions (InOut Tag)
 * where the user must have access to either the origin (from) or destination (to) warehouse.
 */
export function applyInOutTagWarehouseScope<QB extends { where: (...args: any[]) => QB }>(
    query: QB,
    fromWhCol: any,
    toWhCol: any,
    user: AuthorizationUser,
    mode: WarehouseScopeMode = 'when-assigned'
): QB {
    const scopedIds = warehouseScope(user, mode);
    if (!scopedIds) return query;

    if (scopedIds.length === 0) {
        return query.where(fromWhCol, 'in', [-1]);
    }

    return query.where((eb: any) =>
        eb.or([eb(fromWhCol, 'in', scopedIds), eb(toWhCol, 'in', scopedIds)])
    );
}
