'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createNteRepository } from '@/lib/repositories/nte.repository';

const pageSchema = z.number().int().min(1).max(100_000);
const pageSize = 50;

export async function getNteStock(pageInput: unknown) {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const parsedPage = pageSchema.safeParse(pageInput);
    if (!parsedPage.success) {
        return {
            success: false as const,
            error: 'Halaman tidak valid.',
            rows: [],
            page: 1,
            total: 0,
        };
    }

    const page = parsedPage.data;
    const warehouseIds: number[] | null = user.isStaff ? (user.warehouseIds ?? []) : null;
    if (user.isStaff && warehouseIds?.length === 0) {
        return { success: true as const, rows: [], page, total: 0 };
    }

    try {
        const result = await createNteRepository(db).getStockSummary({
            warehouseIds,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const rows = result.rows;
        return {
            success: true as const,
            rows: rows.map((row) => ({ ...row, jumlah: Number(row.jumlah) })),
            page,
            total: Number(rows[0]?.total_count ?? 0),
        };
    } catch (error) {
        actionLogger.error(
            'getNteStock failed',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false as const,
            error: 'Gagal memuat stok NTE.',
            rows: [],
            page,
            total: 0,
        };
    }
}
