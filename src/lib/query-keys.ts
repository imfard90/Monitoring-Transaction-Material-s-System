/**
 * Centralized TanStack Query key factory for MTMS.
 * Prevents magic strings and ensures predictable invalidations.
 */
export const queryKeys = {
    technicians: {
        all: ['technicians'] as const,
        intech: () => [...queryKeys.technicians.all, 'intech'] as const,
        materials: (nik?: string) =>
            [...queryKeys.technicians.all, 'materials', nik ?? 'all'] as const,
    },
    reference: {
        woLensa: {
            all: ['wo-lensa-ref'] as const,
            list: (filters: Record<string, unknown>) =>
                [...queryKeys.reference.woLensa.all, 'list', filters] as const,
            detail: (id: string | number) =>
                [...queryKeys.reference.woLensa.all, 'detail', id] as const,
            options: () => [...queryKeys.reference.woLensa.all, 'options'] as const,
        },
        outLensa: {
            all: ['out-lensa-ref'] as const,
            list: (filters: Record<string, unknown>) =>
                [...queryKeys.reference.outLensa.all, 'list', filters] as const,
            detail: (id: string) =>
                [...queryKeys.reference.outLensa.all, 'detail', id] as const,
            options: () => [...queryKeys.reference.outLensa.all, 'options'] as const,
        },
    },
    dashboard: {
        all: ['dashboard'] as const,
        kpi: () => [...queryKeys.dashboard.all, 'kpi'] as const,
        leaderboard: () => [...queryKeys.dashboard.all, 'leaderboard'] as const,
        stockWarning: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'stock-warning', warehouseId ?? 'all'] as const,
    },
} as const;
