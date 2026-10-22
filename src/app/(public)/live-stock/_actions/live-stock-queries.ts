'use server';

import { loadOtherStockCache, type OtherStockItem } from '@/lib/google_ecosystem/sheets-stock-sync';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type { LiveStockData, StockItem, WarehouseSummary } from '../_lib/stock-status';
import { computeStockStatus, locationKey } from '../_lib/stock-status';

/** Lokasi MTMS yang sudah tampil di tabel utama; tidak diulang di "Lokasi lain". */
const MTMS_LOCATIONS = new Set(['karangpilang', 'gresik', 'lamongan', 'tuban', 'bojonegoro']);

export interface OtherLocationStockResult {
    items: OtherStockItem[];
    syncedAt: string;
}

const toNumberOrNull = (value: number | string | null): number | null =>
    value === null ? null : Number(value);

/**
 * Snapshot stok seluruh gudang. Publik (tanpa login) hanya agregat stok,
 * tanpa informasi transaksi maupun PIC.
 *
 * ponytail: seluruh baris stok dikirim sekali (~235 baris) lalu difilter di
 * client. Tambahkan pagination/filter server-side bila baris melewati ~5.000.
 */
export async function getLiveStockData(): Promise<
    { success: true; data: LiveStockData } | { success: false; error: string }
> {
    try {
        const rows = await inventoryRepository.listLiveStockRows();

        const items: StockItem[] = rows.map((row) => {
            const avgDemand = toNumberOrNull(row.averageDemandWeekly);
            const safetyPct = toNumberOrNull(row.safetyStockPct);
            return {
                warehouse_id: row.warehouseId,
                warehouse_name: row.warehouseName,
                branch_name: row.branchName,
                material_id: row.materialId,
                material_code: row.materialCode ?? '',
                material_name: row.materialName ?? '',
                material_unit: row.materialUnit,
                qty_stock: row.qtyStock,
                min_qty: row.minQty,
                max_qty: row.maxQty,
                average_demand_weekly: avgDemand,
                safety_stock_pct: safetyPct,
                stock_status: computeStockStatus(
                    row.qtyStock,
                    row.minQty,
                    row.maxQty,
                    avgDemand,
                    safetyPct
                ),
                has_out_material_history: Boolean(row.hasOutMaterialHistory),
            };
        });

        const warehouseMap = new Map<number, WarehouseSummary>();

        for (const item of items) {
            const current = warehouseMap.get(item.warehouse_id) ?? {
                warehouse_id: item.warehouse_id,
                warehouse_name: item.warehouse_name,
                branch_name: item.branch_name,
                total_materials: 0,
                total_qty: 0,
                critical_count: 0,
                low_count: 0,
                normal_count: 0,
                overstock_count: 0,
            };

            current.total_materials += 1;
            current.total_qty += item.qty_stock;

            if (item.stock_status === 'critical') current.critical_count += 1;
            if (item.stock_status === 'low') current.low_count += 1;
            if (item.stock_status === 'normal') current.normal_count += 1;
            if (item.stock_status === 'overstock') current.overstock_count += 1;

            warehouseMap.set(item.warehouse_id, current);
        }

        const warehouses = [...warehouseMap.values()].sort((a, b) =>
            a.warehouse_name.localeCompare(b.warehouse_name)
        );

        return {
            success: true,
            data: {
                summary: {
                    total_materials: items.length,
                    total_qty: items.reduce((sum, item) => sum + item.qty_stock, 0),
                    critical_items: items.filter((item) => item.stock_status === 'critical').length,
                    low_items: items.filter((item) => item.stock_status === 'low').length,
                    warehouses_count: warehouses.length,
                },
                warehouses,
                items,
                last_updated: new Date().toISOString(),
            },
        };
    } catch (error: unknown) {
        actionLogger.error(
            'getLiveStockData failed',
            error instanceof Error ? error : new Error(String(error))
        );
        // Halaman publik: jangan bocorkan pesan error database ke client.
        return { success: false, error: 'Gagal mengambil data stok. Coba beberapa saat lagi.' };
    }
}

/**
 * Stok material yang sama di lokasi di luar MTMS (Karangpilang, Gresik, Lamongan,
 * Tuban, Bojonegoro). Sumber: cache Google Sheets "DATA KEMARIN" yang disinkronkan
 * harian (data/other-stock.json), bukan tabel stock_balance.
 */
export async function getOtherLocationStock(
    materialCode: string
): Promise<{ success: true; data: OtherLocationStockResult } | { success: false; error: string }> {
    const code = materialCode.trim().toUpperCase();
    if (code.length === 0 || code.length > 100) {
        return { success: false, error: 'Kode material tidak valid.' };
    }

    try {
        const cache = loadOtherStockCache();
        if (cache === null) {
            return {
                success: false,
                error: 'Data stok lokasi lain belum tersinkronisasi. Coba beberapa saat lagi.',
            };
        }

        const items = cache.items
            .filter(
                (item) =>
                    item.materialCode.toUpperCase() === code &&
                    !MTMS_LOCATIONS.has(locationKey(item.gudang))
            )
            .sort((a, b) => b.stockH1 - a.stockH1);

        return { success: true, data: { items, syncedAt: cache.syncedAt } };
    } catch (error: unknown) {
        actionLogger.error(
            'getOtherLocationStock failed',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil data stok lokasi lain.' };
    }
}
