/**
 * Barrel re-export - dashboard-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - dashboard-queries.ts        - stock balance, KPI, and warning queries
 *   - dashboard-charts-queries.ts - sales overview and line chart queries
 *
 * Import path @/app/(DashboardLayout)/_actions/dashboard-actions remains unchanged for consumers.
 */

export {
    getOutMaterialLineChartData,
    getSalesOverviewData,
    getStockValueComparison,
    getTopOutMaterials,
    getWarehousePerformance,
} from './dashboard-charts-queries';
export {
    getDashboardKpis,
    getDashboardStockIntech,
    getIntechLensaWarehousePerformance,
    getLensaWarehousePerformance,
    getOtherWarehouseStock,
    getStockBalances,
    getStockWarnings,
    getWarehouseLeaderboard,
    getWarehouses,
    type IntechLensaWarehouseMetric,
    triggerOtherStockSync,
    type WarehouseChampionResponse,
    type WarehouseLeaderboardEntry,
    type WarehouseMetricBreakdown,
} from './dashboard-queries';
