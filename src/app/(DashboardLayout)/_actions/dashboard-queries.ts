'use server';

import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import {
    loadOtherStockCache,
    OTHER_STOCK_SYNC_LOCK_KEY,
    OTHER_STOCK_SYNC_LOCK_TTL_SECONDS,
    syncOtherStock,
    type OtherStockItem,
} from '@/lib/google_ecosystem/sheets-stock-sync';
import { actionLogger } from '@/lib/logger';
import { AuthorizationError, ConflictError } from '@/lib/errors';
import { redis } from '@/lib/redis';

const triggerOtherStockSyncSchema = z.object({}).strict();

export async function getStockBalances() {
    try {
        const balances = await db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select([
                'sb.id',
                'sb.warehouse_id',
                'w.name as warehouse_name',
                'w.branch as branch_name',
                'sb.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'sb.qty_stock',
                sql<number | null>`(
                    SELECT SUM(ABS(sm.qty_delta)) / 12.0
                    FROM inventory.stock_movement AS sm
                    WHERE sm.warehouse_id = sb.warehouse_id
                      AND sm.designator_id = sb.designator_id
                      AND sm.movement_type = 'sap_out'
                      AND sm.created_at >= CURRENT_DATE - INTERVAL '84 days'
                )`.as('average_demand_weekly'),
                sql<boolean>`EXISTS (
                    SELECT 1
                    FROM inventory.stock_movement AS sm
                    WHERE sm.warehouse_id = sb.warehouse_id
                      AND sm.designator_id = sb.designator_id
                      AND sm.movement_type = 'sap_out'
                      AND sm.created_at >= CURRENT_DATE - INTERVAL '84 days'
                )`.as('has_out_material_history'),
            ])
            .orderBy('w.name', 'asc')
            .orderBy('m.code', 'asc')
            .execute();

        return { success: true, data: balances };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch stock balances:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getLensaWarehousePerformance() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: { outLensa: [], rekonLensa: [] } };
        }

        let outLensaQuery = db
            .selectFrom('inventory.out_lensa_ref_header as olh')
            .innerJoin('inventory.mas_wh as wh', (join) =>
                join.on(
                    sql<string>`LOWER(REGEXP_REPLACE(wh.name, '\\s+', '', 'g'))`,
                    '=',
                    sql<string>`LOWER(REGEXP_REPLACE(olh.nama_gudang, '\\s+', '', 'g'))`
                )
            )
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(olh.id)`.as('total'),
                sql<number>`COUNT(olh.id) FILTER (WHERE olh.sap_out_check IS TRUE)`.as('completed'),
            ])
            .where('olh.formatted_date', '=', sql<Date>`CURRENT_DATE`)
            .groupBy(['wh.id', 'wh.name']);

        let rekonLensaQuery = db
            .selectFrom('inventory.wo_lensa_header as wlh')
            .innerJoin('inventory.mas_wh as wh', (join) =>
                join.on(
                    sql<string>`LOWER(REGEXP_REPLACE(wh.name, '\\s+', '', 'g'))`,
                    '=',
                    sql<string>`LOWER(REGEXP_REPLACE(wlh.nama_gudang, '\\s+', '', 'g'))`
                )
            )
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(wlh.id)`.as('total'),
                sql<number>`COUNT(wlh.id) FILTER (WHERE wlh.rekon_check IS TRUE)`.as('completed'),
            ])
            .groupBy(['wh.id', 'wh.name']);

        if (isStaff) {
            outLensaQuery = outLensaQuery.where('wh.id', 'in', warehouseIds as number[]);
            rekonLensaQuery = rekonLensaQuery.where('wh.id', 'in', warehouseIds as number[]);
        }

        const [outLensa, rekonLensa] = await Promise.all([
            outLensaQuery.execute(),
            rekonLensaQuery.execute(),
        ]);

        const sortByCompletion = <
            T extends { total: number | string; completed: number | string; name: string },
        >(
            rows: T[]
        ): T[] =>
            [...rows].sort((left, right) => {
                const leftTotal = Number(left.total);
                const rightTotal = Number(right.total);
                const leftPercent = leftTotal === 0 ? 0 : Number(left.completed) / leftTotal;
                const rightPercent = rightTotal === 0 ? 0 : Number(right.completed) / rightTotal;
                return rightPercent - leftPercent || left.name.localeCompare(right.name);
            });

        const sortedOutLensa = sortByCompletion(outLensa);
        const sortedRekonLensa = sortByCompletion(rekonLensa);

        return { success: true, data: { outLensa: sortedOutLensa, rekonLensa: sortedRekonLensa } };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch Lensa warehouse performance:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}

export async function getDashboardStockIntech() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const applyWhFilter = isStaff && warehouseIds.length > 0;

        let query = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'wh.branch as branch',
                'wh.name as wh_name',
                't.name as teknisi',
                'soh.nik_teknisi as nik',
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`soi.qty_req - COALESCE(soi.qty_used, 0)`.as('qty_intech'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (applyWhFilter) {
            query = query.where('soh.warehouse_id', 'in', warehouseIds);
        }

        const data = await query.orderBy('wh.branch', 'asc').orderBy('t.name', 'asc').execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch dashboard stock intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getWarehouses() {
    try {
        const data = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'branch'])
            .orderBy('name', 'asc')
            .execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
export async function getStockWarnings() {
    try {
        const data = await db
            .selectFrom('inventory.stock_policy as p')
            .innerJoin('inventory.stock_balance as b', (join) =>
                join
                    .onRef('b.warehouse_id', '=', 'p.warehouse_id')
                    .onRef('b.designator_id', '=', 'p.designator_id')
            )
            .innerJoin('inventory.materials as m', 'm.id', 'p.designator_id')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'p.warehouse_id')
            .select([
                'w.name as warehouse_name',
                'm.code as material_code',
                'p.average_demand_weekly',
                'p.lead_time_weeks',
                'p.safety_stock_pct',
                'p.min_qty',
                'b.qty_stock',
                sql<number>`p.min_qty - b.qty_stock`.as('deficit'),
            ])
            .orderBy('deficit', 'desc')
            .orderBy('w.name')
            .orderBy('m.code')
            .execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch stock warnings:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getDashboardKpis() {
    try {
        const cacheKey = `dashboard_kpis`;
        const cached = await encryptedCache.getGeneral<unknown>('dashboard', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        const data = {
            onlineUsers: 0,
            requestTag: 0,
            transitTag: 0,
            closeTag: 0,
            returnTek: 0,
            intechOpen: 0,
            intechClose: 0,
        };

        // 0. Online Users
        try {
            const { redis } = await import('@/lib/redis');
            const keys = await redis.keys('presence:user:*');
            data.onlineUsers = keys.length;
        } catch (e) {
            actionLogger.error(
                'Failed to get online users count',
                e instanceof Error ? e : new Error(String(e))
            );
        }

        // 0.1 Intech Open (end_status = 'intech')
        const intechOpen = await db
            .selectFrom('inventory.sap_out_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'intech')
            .executeTakeFirst();
        data.intechOpen = Number(intechOpen?.total || 0);

        // 0.2 Intech Close (end_status = 'close')
        const intechClose = await db
            .selectFrom('inventory.sap_out_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'close')
            .executeTakeFirst();
        data.intechClose = Number(intechClose?.total || 0);

        // 1. Request Tag
        const requestTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'requested')
            .executeTakeFirst();
        data.requestTag = Number(requestTag?.total || 0);

        // 2. Transit Tag
        const transitTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'in_transit')
            .executeTakeFirst();
        data.transitTag = Number(transitTag?.total || 0);

        // 3. Close Tag
        const closeTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'closed')
            .executeTakeFirst();
        data.closeTag = Number(closeTag?.total || 0);

        // 4. Return Tek
        const returnTek = await db
            .selectFrom('inventory.return_material_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .executeTakeFirst();
        data.returnTek = Number(returnTek?.total || 0);

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 10);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch dashboard KPIs:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock lokasi lain (H-1) — reads from local JSON cache synced daily at 09:00
// ─────────────────────────────────────────────────────────────────────────────

// Re-export the type so OtherStockModal.tsx can still import it from here.
export type { OtherStockItem };

const otherStockInputSchema = z.object({
    materialCode: z.string().min(1).max(100).trim(),
});

export async function triggerOtherStockSync(
    input: unknown = {}
): Promise<{ success: true } | { success: false; error: string }> {
    const user = await getSessionUser();
    if (user.isStaff) {
        throw new AuthorizationError('Staff tidak diizinkan menjalankan sinkronisasi stok.');
    }

    const parsed = triggerOtherStockSyncSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: 'Permintaan sinkronisasi tidak valid.' };
    }

    const lockToken = randomUUID();
    const acquired = await redis.set(
        OTHER_STOCK_SYNC_LOCK_KEY,
        lockToken,
        'EX',
        OTHER_STOCK_SYNC_LOCK_TTL_SECONDS,
        'NX'
    );
    if (!acquired) {
        throw new ConflictError('Sinkronisasi stok sedang berjalan. Silakan coba lagi nanti.');
    }

    try {
        await syncOtherStock();
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Manual other-stock sync failed',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Sinkronisasi gagal. Periksa koneksi dan konfigurasi Google Sheets.',
        };
    } finally {
        try {
            await redis.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                1,
                OTHER_STOCK_SYNC_LOCK_KEY,
                lockToken
            );
        } catch (error: unknown) {
            actionLogger.error(
                'Failed to release other-stock sync lock',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }
}

export async function getOtherWarehouseStock(
    materialCode: string
): Promise<{ success: true; data: OtherStockItem[] } | { success: false; error: string }> {
    try {
        await getSessionUser();

        const parsed = otherStockInputSchema.safeParse({ materialCode });
        if (!parsed.success) {
            return { success: false, error: 'Kode material tidak valid.' };
        }
        const code = parsed.data.materialCode.toUpperCase();

        const cache = loadOtherStockCache();

        if (cache === null) {
            actionLogger.warn(
                'getOtherWarehouseStock: cache file not found — initial sync may still be running.'
            );
            return {
                success: false,
                error: 'Data stok lokasi lain belum tersinkronisasi. Silakan coba beberapa menit lagi.',
            };
        }

        const result = cache.items
            .filter((item) => item.materialCode.toUpperCase() === code)
            .sort((a, b) => b.stockH1 - a.stockH1);

        return { success: true, data: result };
    } catch (error: unknown) {
        actionLogger.error(
            'getOtherWarehouseStock failed',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error:
                error instanceof Error ? error.message : 'Gagal mengambil data stok lokasi lain.',
        };
    }
}
