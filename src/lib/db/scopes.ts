import type { AuthorizationUser, WarehouseScopeMode } from '@/lib/policies';
import { warehouseScope } from '@/lib/policies';

/**
 * Structural shape of the Kysely query builder surface used for scoping.
 *
 * Kysely's own generics depend on the concrete `DB` map and per-column types,
 * which cannot be expressed for a helper that accepts builders from many
 * tables. These aliases describe only the operations this module performs.
 */
type ScopeColumn = string;
type ScopeOperator = 'in' | '=' | 'not in';
type ScopeValue = number | readonly number[];

/** Expression builder passed to the callback form of `where`. */
interface ScopeExpressionBuilder {
    or: (expressions: readonly unknown[]) => unknown;
    (col: ScopeColumn, op: ScopeOperator, val: ScopeValue): unknown;
}

interface ScopeQueryBuilder<QB> {
    where(col: ScopeColumn, op: ScopeOperator, val: ScopeValue): QB;
    where(cb: (eb: ScopeExpressionBuilder) => unknown): QB;
}

/**
 * Applies warehouse scoping filter to a Kysely SelectQueryBuilder.
 *
 * @param query The Kysely query builder
 * @param column The warehouse ID column (e.g. 'warehouse_id' or 'soh.warehouse_id')
 * @param user The authenticated user
 * @param mode 'when-assigned' (default) or 'always'
 */
export function applyWarehouseScope<QB extends ScopeQueryBuilder<QB>>(
    query: QB,
    column: ScopeColumn,
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
export function applyInOutTagWarehouseScope<QB extends ScopeQueryBuilder<QB>>(
    query: QB,
    fromWhCol: ScopeColumn,
    toWhCol: ScopeColumn,
    user: AuthorizationUser,
    mode: WarehouseScopeMode = 'when-assigned'
): QB {
    const scopedIds = warehouseScope(user, mode);
    if (!scopedIds) return query;

    if (scopedIds.length === 0) {
        return query.where(fromWhCol, 'in', [-1]);
    }

    return query.where((eb: ScopeExpressionBuilder) =>
        eb.or([eb(fromWhCol, 'in', scopedIds), eb(toWhCol, 'in', scopedIds)])
    );
}
