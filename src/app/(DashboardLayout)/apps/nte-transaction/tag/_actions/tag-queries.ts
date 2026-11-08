'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createNteRepository } from '@/lib/repositories/nte.repository';

const identifierSchema = z.string().trim().min(1).max(160);

const tagListSchema = z
    .object({
        page: z.number().int().min(1).max(100_000).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        search: z.string().trim().max(120).optional(),
        typeTransaksi: z.enum(['all', 'stock_transfer', 'send_to_technician']).optional(),
        startDate: z.string().date().optional(),
        endDate: z.string().date().optional(),
    })
    .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
        message: 'Rentang tanggal tidak valid.',
    });

const tagDetailSchema = z.object({ idTransaksi: identifierSchema });
const serialNumberSchema = z.object({ serialNumber: identifierSchema });

function parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

async function requireNteSession() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
}

export async function getNteTags(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    typeTransaksi?: string;
    startDate?: string;
    endDate?: string;
}) {
    await requireNteSession();

    const parsed = tagListSchema.safeParse(params);
    if (!parsed.success) {
        return {
            success: false,
            error: 'Input tidak valid.',
            data: { tags: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
        };
    }

    const { search, startDate, endDate } = parsed.data;
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    try {
        const repo = createNteRepository(db);
        const results = await repo.listNteTags({
            search,
            startDate: startDate ? parseDate(startDate)?.toISOString() : undefined,
            endDate: endDate ? parseDate(endDate)?.toISOString() : undefined,
            limit: pageSize,
            offset,
        });

        const rows = results.rows;
        const total = Number(rows[0]?.total_count ?? 0);

        return {
            success: true,
            data: {
                tags: rows,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    } catch (error) {
        actionLogger.error(
            'getNteTags error',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Gagal mengambil data tag NTE.',
            data: { tags: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
        };
    }
}

export async function getNteTagDetail(idTransaksi: string) {
    await requireNteSession();

    const parsed = tagDetailSchema.safeParse({ idTransaksi });
    if (!parsed.success) {
        return { success: false, error: 'ID transaksi tidak valid.' };
    }

    try {
        const repo = createNteRepository(db);
        const detail = await repo.getNteTagDetail(parsed.data.idTransaksi);
        return { success: true, data: detail };
    } catch (error) {
        actionLogger.error(
            'getNteTagDetail error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil detail tag NTE.' };
    }
}

export async function getNteSnHistory(serialNumber: string) {
    await requireNteSession();

    const parsed = serialNumberSchema.safeParse({ serialNumber });
    if (!parsed.success) {
        return { success: false, error: 'Serial number tidak valid.' };
    }

    try {
        const repo = createNteRepository(db);
        const history = await repo.getSnHistory(parsed.data.serialNumber);
        return { success: true, data: history };
    } catch (error) {
        actionLogger.error(
            'getNteSnHistory error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil history SN.' };
    }
}
