export type StockStatus = 'critical' | 'low' | 'normal' | 'overstock';

export interface StockItem {
    warehouse_id: number;
    warehouse_name: string;
    branch_name: string;
    material_id: number;
    material_code: string;
    material_name: string;
    material_unit: string;
    qty_stock: number;
    min_qty: number | null;
    max_qty: number | null;
    average_demand_weekly: number | null;
    safety_stock_pct: number | null;
    stock_status: StockStatus;
    has_out_material_history: boolean;
}

export interface WarehouseSummary {
    warehouse_id: number;
    warehouse_name: string;
    branch_name: string;
    total_materials: number;
    total_qty: number;
    critical_count: number;
    low_count: number;
    normal_count: number;
    overstock_count: number;
}

export interface LiveStockData {
    summary: {
        total_materials: number;
        total_qty: number;
        critical_items: number;
        low_items: number;
        warehouses_count: number;
    };
    warehouses: WarehouseSummary[];
    items: StockItem[];
    last_updated: string;
}

/** Interval auto-refresh halaman live stock (5 menit). */
export const LIVE_STOCK_REFRESH_MS = 5 * 60 * 1000;

/** Label lokasi ringkas: "SO Karangpilang" -> "Karangpilang". */
export function warehouseLocation(warehouseName: string): string {
    return warehouseName.replace(/^SO\s+/i, '');
}

/**
 * Kunci pembanding nama lokasi lintas sumber (DB vs Google Sheets).
 * Sheets memakai "SO Karang Pilang", DB "SO Karangpilang" — keduanya
 * harus jadi "karangpilang".
 */
export function locationKey(warehouseName: string): string {
    return warehouseLocation(warehouseName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Klasifikasi status stok.
 * Kritis: qty <= min. Overstock: qty >= max. Rendah: qty <= avg demand x safety %.
 */
export function computeStockStatus(
    qty: number,
    minQty: number | null,
    maxQty: number | null,
    avgDemand: number | null,
    safetyPct: number | null
): StockStatus {
    if (minQty !== null && minQty > 0 && qty <= minQty) return 'critical';
    if (maxQty !== null && maxQty > 0 && qty >= maxQty) return 'overstock';
    if (
        avgDemand !== null &&
        safetyPct !== null &&
        avgDemand > 0 &&
        qty <= avgDemand * (safetyPct / 100)
    )
        return 'low';
    return 'normal';
}

export interface MaterialStockGroup {
    material_code: string;
    material_name: string;
    material_unit: string;
    /** Total stok seluruh gudang. */
    total_qty: number;
    warehouse_count: number;
    /** Penjumlahan rata-rata permintaan mingguan semua gudang. */
    average_demand_weekly: number | null;
    has_out_material_history: boolean;
    warehouses: StockItem[];
}

/**
 * Gabungkan baris stok per gudang menjadi ringkasan per material.
 * Dipakai layout card mobile; tabel desktop tetap memakai baris mentah.
 */
export function groupByMaterial(items: readonly StockItem[]): MaterialStockGroup[] {
    const groups = new Map<string, MaterialStockGroup>();

    for (const item of items) {
        const existing = groups.get(item.material_code);
        if (existing === undefined) {
            groups.set(item.material_code, {
                material_code: item.material_code,
                material_name: item.material_name,
                material_unit: item.material_unit,
                total_qty: item.qty_stock,
                warehouse_count: 1,
                average_demand_weekly: item.average_demand_weekly,
                has_out_material_history: item.has_out_material_history,
                warehouses: [item],
            });
            continue;
        }

        existing.total_qty += item.qty_stock;
        existing.warehouse_count += 1;
        existing.warehouses.push(item);
        existing.has_out_material_history ||= item.has_out_material_history;
        if (item.average_demand_weekly !== null) {
            existing.average_demand_weekly =
                (existing.average_demand_weekly ?? 0) + item.average_demand_weekly;
        }
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            warehouses: [...group.warehouses].sort((a, b) =>
                warehouseLocation(a.warehouse_name).localeCompare(
                    warehouseLocation(b.warehouse_name)
                )
            ),
        }))
        .sort((a, b) => a.material_code.localeCompare(b.material_code));
}

/**
 * Menghitung estimasi hari sampai stok habis.
 * Returns null jika tidak ada data permintaan rata-rata atau tidak ada history out.
 */
export function calculateDaysUntilRunout(
    qtyStock: number,
    averageDemandWeekly: number | null,
    hasOutMaterialHistory: boolean
): number | null {
    if (!hasOutMaterialHistory) return null;
    if (averageDemandWeekly === null || averageDemandWeekly <= 0) return null;
    const dailyDemand = averageDemandWeekly / 7;
    if (dailyDemand <= 0) return null;
    return Math.ceil(qtyStock / dailyDemand);
}
