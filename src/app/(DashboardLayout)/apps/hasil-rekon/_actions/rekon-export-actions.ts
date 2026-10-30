'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';

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

        const data = await inventoryRepository.getHasilRekonExport({
            startDate,
            endDate,
            warehouseIds: isStaff ? warehouseIds : undefined,
            orderDirection: 'asc',
        });

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
