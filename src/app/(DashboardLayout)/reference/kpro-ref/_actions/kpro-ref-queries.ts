'use server';

import { getSessionUser } from '@/lib/auth-server';
import { pool } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { kproRepository } from '@/lib/repositories/kpro.repository';

export interface KproRefItem {
    id: number | string;
    status_update: string | Date | null;
    wonum: string;
    scorderno: string | null;
    sto: string | null;
    servicenum: string | null;
    package_name: string | null;
    datel_baru: string | null;
    rekon_lensa: boolean;
    nte: string;
}

export interface GetKproRefListOptions {
    page?: number;
    pageSize?: number;
    datelFilter?: string;
    search?: string;
}

export interface PaginatedKproRefResult {
    items: KproRefItem[];
    datelOptions: string[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    lastUpdate?: {
        lastUpdatedAt: Date | null;
        totalRecords: number;
    } | null;
}

export async function getKproRefList(options: GetKproRefListOptions = {}) {
    const { page = 1, pageSize = 20, datelFilter = 'all', search = '' } = options;

    try {
        // 1. Otorisasi MTMS (§1.1): Wajib memanggil getSessionUser()
        await getSessionUser();

        const safePage = Math.max(1, page);
        const safePageSize = Math.min(100, Math.max(10, pageSize));
        const offset = (safePage - 1) * safePageSize;

        // 2. Query distinct datel_baru untuk opsi dropdown filter
        const datelRes = await pool.query<{ datel_baru: string }>(`
            SELECT DISTINCT datel_baru
            FROM public.data_kpro
            WHERE district_tif = 'LAMONGAN' AND datel_baru IS NOT NULL
            ORDER BY datel_baru ASC;
        `);
        const datelOptions = datelRes.rows.map((r) => r.datel_baru);

        // 3. Bangun kondisi WHERE (Fixed district_tif = 'LAMONGAN' dan rentang 90 hari)
        const whereClauses: string[] = [
            "k.district_tif = 'LAMONGAN'",
            "k.statusdate >= NOW() - INTERVAL '90 days'",
        ];
        const queryParams: unknown[] = [];
        let paramIndex = 1;

        if (datelFilter && datelFilter !== 'all') {
            whereClauses.push(`k.datel_baru = $${paramIndex++}`);
            queryParams.push(datelFilter);
        }

        const trimmedSearch = search.trim();
        if (trimmedSearch) {
            const searchPattern = `%${trimmedSearch}%`;
            whereClauses.push(`(
                k.wonum ILIKE $${paramIndex} OR
                k.scorderno ILIKE $${paramIndex} OR
                k.sto ILIKE $${paramIndex} OR
                k.servicenum ILIKE $${paramIndex} OR
                k.package_name ILIKE $${paramIndex}
            )`);
            queryParams.push(searchPattern);
            paramIndex++;
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 4. Hitung total baris yang cocok
        const countSql = `
            SELECT COUNT(*) as total
            FROM public.data_kpro k
            ${whereSql};
        `;
        const countRes = await pool.query<{ total: string }>(countSql, queryParams);
        const total = Number(countRes.rows[0]?.total || 0);
        const totalPages = Math.ceil(total / safePageSize);

        // 5. Query data dengan LATERAL JOIN ke inventory.rekon_used_header untuk kolom komparasi
        const dataSql = `
            SELECT 
                k.id,
                k.statusdate as status_update,
                k.wonum,
                k.scorderno,
                k.sto,
                k.servicenum,
                k.package_name,
                k.datel_baru,
                CASE WHEN r.id IS NOT NULL THEN true ELSE false END as rekon_lensa
            FROM public.data_kpro k
            LEFT JOIN LATERAL (
                SELECT id 
                FROM inventory.rekon_used_header ruh
                WHERE ruh.wo_number = split_part(k.scorderno, '_', 1) 
                   OR ruh.wo_number = k.scorderno
                LIMIT 1
            ) r ON true
            ${whereSql}
            ORDER BY k.statusdate DESC NULLS LAST, k.id DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;

        const dataRes = await pool.query<Omit<KproRefItem, 'nte'>>(dataSql, [
            ...queryParams,
            safePageSize,
            offset,
        ]);

        const items: KproRefItem[] = dataRes.rows.map((row) => ({
            id: row.id,
            status_update: row.status_update,
            wonum: row.wonum,
            scorderno: row.scorderno,
            sto: row.sto,
            servicenum: row.servicenum,
            package_name: row.package_name,
            datel_baru: row.datel_baru,
            rekon_lensa: Boolean(row.rekon_lensa),
            nte: 'Coming Soon',
        }));

        // 6. Ambil info sinkronisasi terakhir untuk tampilan badge di header
        const syncInfo = await kproRepository.getLastSyncInfo().catch(() => null);

        return {
            success: true,
            data: {
                items,
                datelOptions,
                total,
                page: safePage,
                pageSize: safePageSize,
                totalPages,
                lastUpdate: syncInfo
                    ? {
                          lastUpdatedAt: syncInfo.lastUpdatedAt,
                          totalRecords: syncInfo.totalRecords,
                      }
                    : null,
            },
        };
    } catch (err) {
        actionLogger.error(
            'Failed to get K-PRO ref list',
            err instanceof Error ? err : new Error(String(err))
        );
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Gagal memuat data referensi K-PRO',
        };
    }
}
