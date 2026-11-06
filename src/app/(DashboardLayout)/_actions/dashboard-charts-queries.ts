/**
 * Public entry point for dashboard chart server actions.
 *
 * The implementation lives in per-chart modules under `./dashboard-charts/*`
 * so each chart stays independently readable, testable, and cacheable.
 * This barrel keeps the existing import path stable for consumers.
 */

export { getIntechAgingData } from './dashboard-charts/intech-aging';
export { getOutMaterialLineChartData } from './dashboard-charts/out-material-charts';
export { getRekonSlaVelocity } from './dashboard-charts/rekon-sla';
export { getSalesOverviewData, getTopOutMaterials } from './dashboard-charts/sales-overview';
export { getStockRunoutForecast } from './dashboard-charts/stock-runout';
export { getStockValueComparison } from './dashboard-charts/stock-value-comparison';
export type {
    IntechAgingData,
    IntechAgingTier,
    IntechTopMaterial,
    IntechTopTechnician,
    RekonSlaData,
    RekonSlaTier,
    StockRunoutItem,
} from './dashboard-charts/types';
export { getWarehousePerformance } from './dashboard-charts/warehouse-performance';
