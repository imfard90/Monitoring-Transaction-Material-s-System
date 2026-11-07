'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

/**
 * Performa pengeluaran out material per gudang (dashboard comparison panel).
 *
 * Sengaja menampilkan SEMUA gudang: panel ini dipakai sebagai pembanding
 * antar-gudang, konsisten dengan `LensaPerformance` dan `WarehouseLeaderboard`.
 * Data yang diekspos hanya agregat (jumlah transaksi + persentase penyelesaian),
 * tanpa detail transaksi maupun data personally identifiable.
 *
 * Autentikasi tetap wajib (AGENTS.md §1.1) — panel hanya untuk user terautentikasi.
 */
export async function getWarehousePerformance() {
    try {
        // Otorisasi server action (AGENTS.md §1.1) — fail-closed.
        await getSessionUser();

        const cacheKey = `warehouse_perf`;
        const cached = await encryptedCache.getGeneral<unknown>('dashboard', cacheKey);
        if (cached) {
            actionLogger.debug(`Cache hit for ${cacheKey}`);
            return { success: true, data: cached };
        }

        // total trx out = count all
        // trx out close = count end_status = 'close'
        const data = await db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(soh.id)`.as('trxOut'),
                sql<number>`SUM(CASE WHEN soh.end_status = 'close' THEN 1 ELSE 0 END)`.as(
                    'trxClose'
                ),
            ])
            .groupBy(['wh.id', 'wh.name'])
            .execute();

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 10);

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouse performance:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
