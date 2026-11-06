/**
 * Public entry point for dashboard chart server actions.
 *
 * The implementation lives in per-chart modules under `./dashboard-charts/*`
 * so each chart stays independently readable, testable, and cacheable.
 * This barrel keeps the existing import path stable for consumers.
 */

export { getSalesOverviewData, getTopOutMaterials } from './dashboard-charts/sales-overview';
export { getOutMaterialLineChartData } from './dashboard-charts/out-material-charts';
export { getWarehousePerformance } from './dashboard-charts/warehouse-performance';
export { getStockValueComparison } from './dashboard-charts/stock-value-comparison';
export { getIntechAgingData } from './dashboard-charts/intech-aging';
export { getStockRunoutForecast } from './dashboard-charts/stock-runout';
export { getRekonSlaVelocity } from './dashboard-charts/rekon-sla';

export type {
    IntechAgingData,
    IntechAgingTier,
    IntechTopMaterial,
    IntechTopTechnician,
    RekonSlaData,
    RekonSlaTier,
    StockRunoutItem,
} from './dashboard-charts/types';
