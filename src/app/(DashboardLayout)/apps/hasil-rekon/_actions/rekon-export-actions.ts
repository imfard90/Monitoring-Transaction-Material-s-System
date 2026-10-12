'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

export interface RekonExportItem {
    created_at: string | null;
    trx_id: string | null;
    sap_number: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number;
}

const exportRekonInputSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
});

export type ExportRekonInput = z.infer<typeof exportRekonInputSchema>;

export interface ExportRekonResult {
    success: boolean;
    data: RekonExportItem[];
    error?: string;
}

/**
 * Server action untuk mengambil data hasil rekon berdasarkan periode bulan & tahun.
 * Mematuhi AGENTS.md §1.1:
 * - Otorisasi live session via getSessionUser()
 * - Scoping gudang otomatis: untuk Staff dibatasi ke gudang PIC (warehouseIds)
 * - Jika Staff tidak memiliki gudang yang terhubung, return data kosong (fail-closed)
 */
export async function exportHasilRekonData(input: ExportRekonInput): Promise<ExportRekonResult> {
    const parseResult = exportRekonInputSchema.safeParse(input);
    if (!parseResult.success) {
        return {
            success: false,
            data: [],
            error: 'Periode bulan atau tahun tidak valid',
        };
    }

    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        // Fail-closed untuk Staff tanpa akses gudang
        if (isStaff && warehouseIds.length === 0) {
            return {
                success: true,
                data: [],
            };
        }

        const { month, year } = parseResult.data;
        const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        const whereConditions: ReturnType<typeof sql>[] = [
            sql`created_at >= ${startDate}`,
            sql`created_at <= ${endDate}`,
        ];

        // Scoping data untuk Staff berdasarkan gudang PIC
        if (isStaff && warehouseIds.length > 0) {
            whereConditions.push(sql`wh_id = ANY(${warehouseIds})`);
        }

        const whereSql = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;

        const baseCte = sql`
            WITH combined AS (
                SELECT 
                    ruh.id as header_id,
                    rul.id as item_id,
                    ruh.create_at as created_at,
                    ruh.id_trx as trx_id,
                    rul.out_sap as sap_number,
                    ruh.name_gudang as warehouse_name,
                    ruh.nik_teknisi as nik,
                    ruh.wo_type::text as type,
                    ruh.wo_number as workorder,
                    m.code as material_code,
                    m.description as material_name,
                    rul.qty,
                    soh.warehouse_id as wh_id
                FROM inventory.rekon_used_header ruh
                JOIN inventory.rekon_used_list rul ON rul.rekon_used_id = ruh.id
                JOIN inventory.materials m ON m.code = rul.designator_id
                LEFT JOIN inventory.sap_out_header soh ON soh.sap_number = rul.out_sap
                UNION ALL
                SELECT 
                    tuh.id as header_id,
                    tui.id as item_id,
                    tui.created_at as created_at,
                    tuh.id_trx as trx_id,
                    soh.sap_number,
                    tuh.name_wh as warehouse_name,
                    tuh.nik_teknisi as nik,
                    tuh.wo_type::text as type,
                    tuh.wo_number as workorder,
                    m.code as material_code,
                    m.description as material_name,
                    tui.qty,
                    soh.warehouse_id as wh_id
                FROM inventory.transaction_used_header tuh
                JOIN inventory.transaction_used_item tui ON tui.used_id = tuh.id
                JOIN inventory.sap_out_header soh ON soh.id = tuh.sap_out_id
                JOIN inventory.materials m ON m.id = tui.designator_id
            )
        `;

        const query = sql<{
            created_at: Date | string | null;
            trx_id: string | null;
            sap_number: string | null;
            warehouse_name: string | null;
            nik: string | null;
            type: string | null;
            workorder: string | null;
            material_code: string | null;
            material_name: string | null;
            qty: number | null;
        }>`
            ${baseCte}
            SELECT 
                created_at,
                trx_id,
                sap_number,
                warehouse_name,
                nik,
                type,
                workorder,
                material_code,
                material_name,
                qty
            FROM combined
            ${whereSql}
            ORDER BY created_at ASC
        `;

        const result = await query.execute(db);

        const data: RekonExportItem[] = result.rows.map((row) => ({
            created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
            trx_id: row.trx_id ? String(row.trx_id) : null,
            sap_number: row.sap_number ? String(row.sap_number) : null,
            warehouse_name: row.warehouse_name ? String(row.warehouse_name) : null,
            nik: row.nik ? String(row.nik) : null,
            type: row.type ? String(row.type) : null,
            workorder: row.workorder ? String(row.workorder) : null,
            material_code: row.material_code ? String(row.material_code) : null,
            material_name: row.material_name ? String(row.material_name) : null,
            qty: row.qty !== null && row.qty !== undefined ? Number(row.qty) : 0,
        }));

        return {
            success: true,
            data,
        };
    } catch (error) {
        actionLogger.error(
            'Error exporting hasil rekon data:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            error: 'Gagal memuat data ekspor hasil rekon',
        };
    }
}
