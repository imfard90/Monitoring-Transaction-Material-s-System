'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createNteRepository } from '@/lib/repositories/nte.repository';

const identifierSchema = z.string().trim().min(1).max(160);

const inventoryFilterSchema = z
    .object({
        page: z.number().int().min(1).max(100_000).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        search: z.string().trim().max(120).optional(),
        inventoryStatus: z.enum(['all', 'available', 'in_use', 'returned']).optional(),
        owner: identifierSchema.optional(),
    })
    .refine(
        (value) =>
            !value.owner ||
            value.owner === 'all' ||
            identifierSchema.safeParse(value.owner).success,
        { message: 'Owner tidak valid.' }
    );

async function requireNteSession() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
}

export async function getNteInventory(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    inventoryStatus?: string;
    owner?: string;
}) {
    await requireNteSession();

    const parsed = inventoryFilterSchema.safeParse(params);
    if (!parsed.success) {
        return {
            success: false,
            error: 'Filter tidak valid.',
            data: { inventory: [], total: 0, page: 1, pageSize: 100, totalPages: 0 },
        };
    }

    const { search, inventoryStatus, owner } = parsed.data;
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 100;
    const offset = (page - 1) * pageSize;

    try {
        const repo = createNteRepository(db);
        const results = await repo.listNteInventory({
            search,
            inventoryStatus: inventoryStatus === 'all' ? undefined : inventoryStatus,
            owner: owner === 'all' ? undefined : owner,
            limit: pageSize,
            offset,
        });

        const rows = results.rows;
        const total = Number(rows[0]?.total_count ?? 0);

        return {
            success: true,
            data: {
                inventory: rows,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    } catch (error) {
        actionLogger.error(
            'getNteInventory error',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Gagal mengambil data inventory NTE.',
            data: { inventory: [], total: 0, page: 1, pageSize: 100, totalPages: 0 },
        };
    }
}

export async function getNteAddresses(owner?: string) {
    await requireNteSession();

    const parsed = identifierSchema.safeParse(owner ?? '');
    if (!parsed.success) {
        return { success: false, error: 'Owner tidak valid.' };
    }

    try {
        const repo = createNteRepository(db);
        const results = await repo.listAddresses(parsed.data);
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteAddresses error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar address.' };
    }
}

export async function getNteItems() {
    await requireNteSession();
    try {
        const repo = createNteRepository(db);
        const results = await repo.listItems();
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteItems error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar item.' };
    }
}

export async function getNteTechnicians() {
    await requireNteSession();
    try {
        const repo = createNteRepository(db);
        const results = await repo.listTechnicians();
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteTechnicians error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar teknisi.' };
    }
}
