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
    getIntechLensaWarehousePerformance,
    getLensaWarehousePerformance,
    getWarehouseLeaderboard,
    type IntechLensaWarehouseMetric,
    type WarehouseChampionResponse,
    type WarehouseLeaderboardEntry,
    type WarehouseMetricBreakdown,
} from './dashboard-performance-queries';
export {
    getDashboardKpis,
    getStockWarnings,
    getWarehouses,
} from './dashboard-queries';
export {
    getDashboardStockIntech,
    getOtherWarehouseStock,
    getStockBalances,
    type OtherStockItem,
    triggerOtherStockSync,
} from './dashboard-stock-queries';
