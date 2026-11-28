import { type Expression, sql } from 'kysely';
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

interface ScopeQueryBuilder<QB> {
    where(expression: Expression<boolean>): QB;
}

/**
 * Applies warehouse scoping filter to a Kysely SelectQueryBuilder using
 * the high-performance PostgreSQL array binding operator `= ANY($1::int[])`.
 *
 * This ensures the generated SQL text remains 100% static regardless of
 * whether the user has 1, 3, or 20 assigned warehouses, preventing plan
 * cache bloat and maximizing PostgreSQL query plan reuse.
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
        return query.where(sql<boolean>`${sql.ref(column)} = ANY(${[-1]}::int[])`);
    }

    return query.where(sql<boolean>`${sql.ref(column)} = ANY(${scopedIds}::int[])`);
}

/**
 * Applies warehouse scoping for transfer transactions (InOut Tag)
 * where the user must have access to either the origin (from) or destination (to) warehouse.
 * Uses static `= ANY($1::int[])` array bindings for both endpoints.
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
        return query.where(sql<boolean>`${sql.ref(fromWhCol)} = ANY(${[-1]}::int[])`);
    }

    return query.where(
        sql<boolean>`(${sql.ref(fromWhCol)} = ANY(${scopedIds}::int[]) OR ${sql.ref(toWhCol)} = ANY(${scopedIds}::int[]))`
    );
}
