/**
 * Centralized TanStack Query key factory for MTMS.
 * Prevents magic strings and ensures predictable invalidations.
 */
export const queryKeys = {
    // Master data
    warehouses: {
        all: ['warehouses'] as const,
    },
    branches: {
        all: ['branches'] as const,
    },
    materials: {
        all: ['materials'] as const,
        byWarehouse: (warehouseId?: string | number) =>
            [...queryKeys.materials.all, warehouseId ?? 'all'] as const,
        otherLocation: (materialCode?: string) =>
            [...queryKeys.materials.all, 'other-location', materialCode ?? 'all'] as const,
    },
    technicians: {
        all: ['technicians'] as const,
        intech: () => [...queryKeys.technicians.all, 'intech'] as const,
        bySa: (nameSa?: string) => [...queryKeys.technicians.all, 'sa', nameSa ?? 'all'] as const,
        materials: (nik?: string) =>
            [...queryKeys.technicians.all, 'materials', nik ?? 'all'] as const,
        wos: (nik?: string) => [...queryKeys.technicians.all, 'wos', nik ?? 'all'] as const,
    },

    // Reference modules
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
            detail: (id: string) => [...queryKeys.reference.outLensa.all, 'detail', id] as const,
            options: () => [...queryKeys.reference.outLensa.all, 'options'] as const,
        },
    },

    // Transactional & operational domains
    inoutTag: {
        all: ['inout-tag'] as const,
        items: (type?: string, headerId?: string | number) =>
            [...queryKeys.inoutTag.all, 'items', type ?? 'all', headerId ?? 'all'] as const,
    },
    returnMaterial: {
        all: ['return-material'] as const,
        availableSapOuts: () => [...queryKeys.returnMaterial.all, 'available-sap-outs'] as const,
        sapOutItems: (sapOutId?: string | number) =>
            [...queryKeys.returnMaterial.all, 'sap-out-items', sapOutId ?? 'all'] as const,
    },
    outSap: {
        all: ['out-sap'] as const,
        reservationScrape: (reservationNo?: string) =>
            [...queryKeys.outSap.all, 'reservation-scrape', reservationNo ?? ''] as const,
    },
    hasilRekon: {
        all: ['hasil-rekon'] as const,
        list: (filters: Record<string, unknown>) =>
            [...queryKeys.hasilRekon.all, 'list', filters] as const,
    },
    stockOpname: {
        all: ['stock-opname'] as const,
        logs: () => [...queryKeys.stockOpname.all, 'logs'] as const,
    },
    liveStock: {
        all: ['live-stock'] as const,
        otherLocation: (materialCode?: string) =>
            [...queryKeys.liveStock.all, 'other-location', materialCode ?? 'all'] as const,
    },

    // Dashboard analytics & overview
    dashboard: {
        all: ['dashboard'] as const,
        kpi: () => [...queryKeys.dashboard.all, 'kpi'] as const,
        leaderboard: () => [...queryKeys.dashboard.all, 'leaderboard'] as const,
        stockBalance: () => [...queryKeys.dashboard.all, 'stock-balance'] as const,
        stockIntech: () => [...queryKeys.dashboard.all, 'stock-intech'] as const,
        stockWarning: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'stock-warning', warehouseId ?? 'all'] as const,
        salesOverview: (warehouseId: string, daysCount: number, endDate: string) =>
            [
                ...queryKeys.dashboard.all,
                'sales-overview',
                warehouseId,
                daysCount,
                endDate,
            ] as const,
        recentTransaction: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'recent-transaction', warehouseId ?? 'all'] as const,
        stockValue: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'stock-value', warehouseId ?? 'all'] as const,
        outMaterialLine: (warehouseId?: string, days?: number) =>
            [
                ...queryKeys.dashboard.all,
                'out-material-line',
                warehouseId ?? 'all',
                days ?? 7,
            ] as const,
        intechAging: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'intech-aging', warehouseId ?? 'all'] as const,
        stockRunout: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'stock-runout', warehouseId ?? 'all'] as const,
        rekonSla: (warehouseId?: string) =>
            [...queryKeys.dashboard.all, 'rekon-sla', warehouseId ?? 'all'] as const,
        productPerformance: () => [...queryKeys.dashboard.all, 'product-performance'] as const,
    },

    // Operational pending notifications
    notifications: {
        all: ['notifications'] as const,
        pending: () => [...queryKeys.notifications.all, 'pending'] as const,
    },
} as const;
