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
    getStockBalances,
    getDashboardStockIntech,
    getWarehouses,
    getStockWarnings,
    getDashboardKpis,
} from './dashboard-queries';

export {
    getSalesOverviewData,
    getTopOutMaterials,
    getOutMaterialLineChartData,
    getWarehousePerformance,
} from './dashboard-charts-queries';
