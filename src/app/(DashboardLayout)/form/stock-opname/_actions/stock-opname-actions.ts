'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { AuthenticationError, AuthorizationError, errors } from '@/lib/errors';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, canApproveStockOpname } from '@/lib/policies';
import { createStockOpnameRepository } from '@/lib/repositories/stock-opname.repository';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const stockOpnameRepo = createStockOpnameRepository(db);

const SaveStockOpnameSchema = z.object({
    warehouse_id: z.number().int().positive(),
    warehouse_name: z.string().min(1),
    details: z.array(
        z.object({
            material_code: z.string(),
            material_name: z.string(),
            qty_system: z.number().int(),
            qty_opname: z.number().int(),
            difference: z.number().int(),
        })
    ),
    status: z.enum(['pending', 'approved']).default('pending'),
    idemKey: z.string().optional(),
});

export async function saveStockOpname(input: unknown) {
    const user = await getSessionUser();
    if (!user) throw errors.auth();

    const parsed = SaveStockOpnameSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: 'Data tidak valid' };
    }

    const { warehouse_id, warehouse_name, details, status, idemKey } = parsed.data;

    // Staff: validate warehouse access
    if (!canAccessWarehouse(user, warehouse_id)) {
        throw errors.accessDenied();
    }

    // Non-staff can approve directly; staff is forced to pending
    const finalStatus = user.isStaff ? 'pending' : status;
    const total_difference = details.reduce((sum, d) => sum + Math.abs(d.difference), 0);

    const executeSave = async () => {
        // Resolve canonical warehouse name from mas_wh if possible
        const whRecord = await db
            .selectFrom('inventory.mas_wh')
            .where('id', '=', warehouse_id)
            .select('name')
            .executeTakeFirst()
            .catch(() => null);

        const canonicalName = whRecord?.name ?? warehouse_name;

        const log = await stockOpnameRepo.createLog({
            warehouse_id,
            warehouse_name: canonicalName,
            details,
            total_items: details.length,
            total_difference,
            created_by: user.nik,
            status: finalStatus,
        });

        actionLogger.info('Stock opname saved', {
            logId: log.id,
            warehouseId: warehouse_id,
            totalItems: details.length,
            status: finalStatus,
            nik: user.nik,
        });

        return log;
    };

    try {
        if (idemKey) {
            try {
                const { result } = await checkAndStoreIdempotency(idemKey, parsed.data, async () =>
                    executeSave()
                );
                return { success: true, data: result };
            } catch (idemErr) {
                // If redis is unavailable in some environments, fallback to direct save
                actionLogger.warn?.('Idempotency check failed, executing save directly', {
                    error: idemErr instanceof Error ? idemErr.message : String(idemErr),
                });
                const log = await executeSave();
                return { success: true, data: log };
            }
        }

        const log = await executeSave();
        return { success: true, data: log };
    } catch (err) {
        actionLogger.error(
            'Failed to save stock opname',
            err instanceof Error ? err : new Error(String(err))
        );
        return { success: false, error: 'Gagal menyimpan data' };
    }
}

export async function getStockOpnameLogs(filters?: {
    status?: 'pending' | 'approved' | 'rejected';
    search?: string;
    limit?: number;
    offset?: number;
}) {
    const user = await getSessionUser();
    if (!user) throw errors.auth();

    const warehouseIds = user.isStaff ? user.warehouseIds : undefined;

    try {
        const logs = await stockOpnameRepo.getLogs({
            warehouseIds,
            status: filters?.status,
            search: filters?.search,
            limit: filters?.limit ?? 100,
            offset: filters?.offset ?? 0,
        });

        return { success: true, data: logs };
    } catch (err) {
        actionLogger.error(
            'Failed to get stock opname logs',
            err instanceof Error ? err : new Error(String(err))
        );
        return { success: false, error: 'Gagal memuat data' };
    }
}

export async function getStockOpnameLogById(id: number) {
    const user = await getSessionUser();
    if (!user) throw errors.auth();

    try {
        const log = await stockOpnameRepo.getLogById(id);
        if (!log) return { success: false, error: 'Data tidak ditemukan' };

        if (!canAccessWarehouse(user, log.warehouse_id)) {
            throw errors.accessDenied();
        }

        return { success: true, data: log };
    } catch (err) {
        if (err instanceof AuthorizationError || err instanceof AuthenticationError) throw err;
        actionLogger.error(
            'Failed to get stock opname log',
            err instanceof Error ? err : new Error(String(err))
        );
        return { success: false, error: 'Gagal memuat data' };
    }
}

const ApproveSchema = z.object({
    id: z.number().int().positive(),
});

export async function approveStockOpname(input: unknown) {
    const user = await getSessionUser();
    if (!user) throw errors.auth();
    if (!canApproveStockOpname(user)) throw errors.accessDenied();

    const parsed = ApproveSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: 'ID tidak valid' };
    }

    try {
        const log = await stockOpnameRepo.getLogById(parsed.data.id);
        if (!log) return { success: false, error: 'Data tidak ditemukan' };
        if (log.status !== 'pending') {
            return { success: false, error: 'Data sudah diproses' };
        }

        await stockOpnameRepo.approveLog(parsed.data.id, user.nik);

        actionLogger.info('Stock opname approved', {
            logId: parsed.data.id,
            approvedBy: user.nik,
        });

        return { success: true };
    } catch (err) {
        actionLogger.error(
            'Failed to approve stock opname',
            err instanceof Error ? err : new Error(String(err))
        );
        return { success: false, error: 'Gagal approve' };
    }
}

const RejectSchema = z.object({
    id: z.number().int().positive(),
    reason: z.string().min(5, 'Alasan minimal 5 karakter'),
});

export async function rejectStockOpname(input: unknown) {
    const user = await getSessionUser();
    if (!user) throw errors.auth();
    if (!canApproveStockOpname(user)) throw errors.accessDenied();

    const parsed = RejectSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' };
    }

    try {
        const log = await stockOpnameRepo.getLogById(parsed.data.id);
        if (!log) return { success: false, error: 'Data tidak ditemukan' };
        if (log.status !== 'pending') {
            return { success: false, error: 'Data sudah diproses' };
        }

        await stockOpnameRepo.rejectLog(parsed.data.id, user.nik, parsed.data.reason);

        actionLogger.info('Stock opname rejected', {
            logId: parsed.data.id,
            rejectedBy: user.nik,
            reason: parsed.data.reason,
        });

        return { success: true };
    } catch (err) {
        actionLogger.error(
            'Failed to reject stock opname',
            err instanceof Error ? err : new Error(String(err))
        );
        return { success: false, error: 'Gagal reject' };
    }
}
