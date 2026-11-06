/**
 * Shared response types for the dashboard chart server actions.
 *
 * Kept in one module so each chart query file can expose its own contract
 * without duplicating the shape definitions.
 */

export interface StockRunoutItem {
    material_code: string;
    material_name: string;
    material_unit: string;
    warehouse_name: string;
    qty_stock: number;
    weekly_demand: number;
    daily_demand: number;
    days_of_supply: number;
    status: 'critical' | 'warning' | 'safe';
    policy_updated_at?: string | null;
}

export interface RekonSlaTier {
    key: 'on_time' | 'warning' | 'breached';
    label: string;
    description: string;
    count: number;
    percentage: number;
    color: string;
}

export interface RekonSlaData {
    totalOpen: number;
    avgDays: number;
    slaRate: number;
    tiers: RekonSlaTier[];
}

export interface IntechAgingTier {
    key: 'under_7d' | 'd7_to_14d' | 'over_14d';
    label: string;
    description: string;
    count: number;
    qty: number;
    percentage: number;
    color: string;
}

export interface IntechTopMaterial {
    code: string;
    description: string;
    unit: string;
    qty_intech: number;
    tx_count: number;
}

export interface IntechTopTechnician {
    nik: string;
    name: string;
    qty_intech: number;
    tx_count: number;
}

export interface IntechAgingData {
    totalRecords: number;
    totalQty: number;
    tiers: IntechAgingTier[];
    topMaterials: IntechTopMaterial[];
    topTechnicians: IntechTopTechnician[];
}
