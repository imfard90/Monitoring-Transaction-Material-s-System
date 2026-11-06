'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toCanonicalWarehouseName } from '@/lib/warehouse-helper';

/**
 * A filter value that can be written to the URL.
 *
 * `undefined` means "not set" (param omitted), `null` means "explicitly cleared"
 * (param written as empty string), and `'all'` is treated as "no filter" by the
 * helpers below — matching the MTMS convention where `all` is the default
 * warehouse/status sentinel.
 */
export type FilterValue = string | number | boolean | null | undefined;

export interface TableFilterState {
    /** Free-text search term. */
    search: string;
    /** Selected warehouse, canonicalized. `'all'` means no warehouse filter. */
    warehouse: string;
    /** Current page number (1-based). */
    page: number;
    /** Rows per page. */
    pageSize: number;
}

/**
 * Serializes filter state into URL search params.
 *
 * Kept pure so it can be unit-tested without a router, and reused by any
 * table client that keeps its filters in the URL.
 */
export function buildTableFilterParams(
    state: Partial<TableFilterState>,
    extraParams: Record<string, FilterValue> = {}
): URLSearchParams {
    const params = new URLSearchParams();

    if (state.page !== undefined) {
        params.set('page', String(state.page));
    }
    if (state.pageSize !== undefined) {
        params.set('pageSize', String(state.pageSize));
    }
    if (state.search?.trim()) {
        params.set('search', state.search.trim());
    }
    if (state.warehouse && state.warehouse !== 'all') {
        params.set('warehouse', state.warehouse);
    }

    for (const [key, value] of Object.entries(extraParams)) {
        if (value === undefined) continue;
        if (value === null) {
            params.set(key, '');
            continue;
        }
        if (typeof value === 'string' && (value === '' || value === 'all')) continue;
        if (Array.isArray(value)) continue;
        params.set(key, String(value));
    }

    return params;
}

/**
 * Shared table-filter navigation helper.
 *
 * Replaces the per-page `applyFilters` duplication: each client keeps its own
 * filter state, but the URL serialization and navigation live here.
 *
 * @param basePath Route the table lives on (e.g. `/apps/out-material`).
 * @param currentState Current filter state, used to fill in unchanged values.
 * @param extraParams Additional domain-specific filters (status, date range, ...).
 */
export function useTableFilterNavigation({
    basePath,
    currentState,
    extraParams = {},
}: {
    basePath: string;
    currentState: Partial<TableFilterState>;
    extraParams?: Record<string, FilterValue>;
}) {
    const router = useRouter();

    const navigate = useCallback(
        (
            overrides: Partial<TableFilterState> = {},
            extraOverrides: Record<string, FilterValue> = {}
        ) => {
            const merged = { ...currentState, ...overrides };
            const params = buildTableFilterParams(merged, { ...extraParams, ...extraOverrides });
            const query = params.toString();
            router.push(query ? `${basePath}?${query}` : basePath);
        },
        // `currentState` and `extraParams` are rebuilt each render by callers; the
        // JSON snapshots keep the callback identity stable while still reacting
        // to changed filter values.
        [basePath, router, JSON.stringify(currentState), JSON.stringify(extraParams)]
    );

    const resetAll = useCallback(() => {
        router.push(basePath);
    }, [basePath, router]);

    return { navigate, resetAll };
}

/**
 * Canonicalizes a warehouse selection, defaulting to `'all'`.
 */
export function normalizeWarehouse(value: string | undefined): string {
    return toCanonicalWarehouseName(value ?? '') || 'all';
}
