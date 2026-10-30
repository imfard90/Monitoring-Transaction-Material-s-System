'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { applyWarehouseScope } from '@/lib/db/scopes';
import { AuthorizationError, ConflictError } from '@/lib/errors';
import {
    loadOtherStockCache,
    OTHER_STOCK_SYNC_LOCK_KEY,
    OTHER_STOCK_SYNC_LOCK_TTL_SECONDS,
    type OtherStockItem,
    syncOtherStock,
} from '@/lib/google_ecosystem/sheets-stock-sync';
import { actionLogger } from '@/lib/logger';
import { canSyncStock } from '@/lib/policies';
import { redis } from '@/lib/redis';

export type { OtherStockItem };

const triggerOtherStockSyncSchema = z.object({}).strict();
const otherStockInputSchema = z.object({
    materialCode: z.string().min(1).max(100).trim(),
});

export async function getStockBalances() {
    try {
        const balances = await db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .leftJoin(
                (eb) =>
                    eb
                        .selectFrom('inventory.stock_movement')
                        .select([
                            'warehouse_id',
                            'designator_id',
                            sql<number>`SUM(ABS(qty_delta)) / 12.0`.as('average_demand_weekly'),
                            sql<boolean>`TRUE`.as('has_out_material_history'),
                        ])
                        .where('movement_type', '=', 'sap_out')
                        .where(sql<boolean>`created_at >= CURRENT_DATE - INTERVAL '84 days'`)
                        .groupBy(['warehouse_id', 'designator_id'])
                        .as('sm_agg'),
                (join) =>
                    join
                        .onRef('sm_agg.warehouse_id', '=', 'sb.warehouse_id')
                        .onRef('sm_agg.designator_id', '=', 'sb.designator_id')
            )
            .select([
                'sb.id',
                'sb.warehouse_id',
                'w.name as warehouse_name',
                'w.branch as branch_name',
                'sb.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'sb.qty_stock',
                sql<number | null>`sm_agg.average_demand_weekly`.as('average_demand_weekly'),
                sql<boolean>`COALESCE(sm_agg.has_out_material_history, FALSE)`.as(
                    'has_out_material_history'
                ),
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

export async function getDashboardStockIntech() {
    try {
        const user = await getSessionUser();

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
                'soh.request_time as request_time',
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`soi.qty_req - COALESCE(soi.qty_used, 0)`.as('qty_intech'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        query = applyWarehouseScope(query, 'soh.warehouse_id', user);

        const data = await query
            .orderBy('soh.request_time', 'asc')
            .orderBy('wh.branch', 'asc')
            .orderBy('t.name', 'asc')
            .limit(1000)
            .execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch dashboard stock intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function triggerOtherStockSync(
    input: unknown = {}
): Promise<{ success: true } | { success: false; error: string }> {
    const user = await getSessionUser();
    if (!canSyncStock(user)) {
        throw new AuthorizationError('Staff tidak diizinkan menjalankan sinkronisasi stok.');
    }

    const parsed = triggerOtherStockSyncSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: 'Permintaan sinkronisasi tidak valid.' };
    }

    const lockToken = globalThis.crypto.randomUUID();
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
