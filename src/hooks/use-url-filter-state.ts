'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toCanonicalWarehouseName } from '@/lib/warehouse-helper';

export interface UseUrlFilterStateOptions {
    basePath: string;
    currentSearch?: string;
    currentWarehouse?: string;
    debounceMs?: number;
    currentPage?: number;
}

export interface UseUrlFilterStateReturn {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    selectedWarehouse: string;
    setSelectedWarehouse: (wh: string) => void;
    handleWarehouseChange: (wh: string) => void;
    handleResetAll: () => void;
    isFilterActive: boolean;
    isPending: boolean;
}

/**
 * Pure URL builder for table filters (search, warehouse, pagination).
 */
export function buildFilteredUrl({
    basePath,
    search,
    warehouse,
    page,
    currentSearchString = '',
}: {
    basePath: string;
    search?: string;
    warehouse?: string;
    page?: number;
    currentSearchString?: string;
}): string {
    const params = new URLSearchParams(currentSearchString);

    if (search !== undefined) {
        if (search.trim()) {
            params.set('search', search.trim());
        } else {
            params.delete('search');
        }
    }

    if (warehouse !== undefined) {
        const canonical = toCanonicalWarehouseName(warehouse);
        if (!canonical || canonical === 'all') {
            params.delete('warehouse');
        } else {
            params.set('warehouse', canonical);
        }
    }

    if (page !== undefined) {
        if (page > 1) {
            params.set('page', String(page));
        } else {
            params.delete('page');
        }
    }

    const query = params.toString();
    return `${basePath}${query ? `?${query}` : ''}`;
}

/**
 * Reusable hook to synchronize table/filter state (search, warehouse, pagination)
 * with the browser URL query params via debounced transition.
 */
export function useUrlFilterState({
    basePath,
    currentSearch = '',
    currentWarehouse = 'all',
    debounceMs = 350,
    currentPage = 1,
}: UseUrlFilterStateOptions): UseUrlFilterStateReturn {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [searchQuery, setSearchQuery] = useState(currentSearch);
    const [selectedWarehouse, setSelectedWarehouse] = useState(() =>
        toCanonicalWarehouseName(currentWarehouse)
    );

    // Keep internal state in sync with server/parent props
    useEffect(() => {
        setSearchQuery(currentSearch);
    }, [currentSearch]);

    useEffect(() => {
        setSelectedWarehouse(toCanonicalWarehouseName(currentWarehouse));
    }, [currentWarehouse]);

    // Track initial mount to prevent redundant navigation on first load
    const isFirstMount = useRef(true);

    // Debounced search sync to URL
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        if (searchQuery === currentSearch) return;

        const timer = setTimeout(() => {
            const currentSearchString = typeof window !== 'undefined' ? window.location.search : '';
            const targetUrl = buildFilteredUrl({
                basePath,
                search: searchQuery,
                page: currentPage > 1 ? 1 : undefined,
                currentSearchString,
            });

            startTransition(() => {
                router.push(targetUrl);
            });
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [searchQuery, currentSearch, currentPage, basePath, debounceMs, router]);

    const handleWarehouseChange = useCallback(
        (value: string) => {
            const canonical = toCanonicalWarehouseName(value);
            setSelectedWarehouse(canonical);

            const currentSearchString = typeof window !== 'undefined' ? window.location.search : '';
            const targetUrl = buildFilteredUrl({
                basePath,
                warehouse: canonical,
                page: currentPage > 1 ? 1 : undefined,
                currentSearchString,
            });

            startTransition(() => {
                router.push(targetUrl);
            });
        },
        [basePath, currentPage, router]
    );

    const handleResetAll = useCallback(() => {
        setSearchQuery('');
        setSelectedWarehouse('all');

        startTransition(() => {
            router.push(basePath);
        });
    }, [basePath, router]);

    const isFilterActive = Boolean(
        searchQuery.trim() || (selectedWarehouse && selectedWarehouse !== 'all')
    );

    return {
        searchQuery,
        setSearchQuery,
        selectedWarehouse,
        setSelectedWarehouse,
        handleWarehouseChange,
        handleResetAll,
        isFilterActive,
        isPending,
    };
}
