import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createInventoryRepository } from '@/lib/repositories';

export interface RejectedWOPemakaianParams {
    pemakaianId: string;
    woNumber?: string | null;
    reason?: string;
    actor?: string;
}

export interface RollbackResult {
    pemakaianId: string;
    woNumber?: string | null;
    rolledBack: boolean;
    reason?: string;
}

/**
 * Memproses pemulihan (rollback) pemakaian WO Lensa yang berstatus REJECTED.
 * Jika pemakaian_id sempat direkon di MTMS, Intech teknisi akan dikembalikan via
 * inventory.sp_rollback_rekon_lensa_by_pemakaian dan data lokal dihapus bersih.
 */
export async function handleRejectedWOPemakaian(
    params: RejectedWOPemakaianParams
): Promise<RollbackResult> {
    const cleanPemakaianId = params.pemakaianId.trim();
    if (!cleanPemakaianId) {
        return {
            pemakaianId: params.pemakaianId,
            woNumber: params.woNumber,
            rolledBack: false,
            reason: 'Pemakaian ID kosong',
        };
    }

    try {
        // Cek apakah pemakaian_id tercatat di wo_lensa_header atau rekon_used_header
        const [existingWo, existingRekon] = await Promise.all([
            db
                .selectFrom('inventory.wo_lensa_header')
                .select(['id', 'wo_number', 'nama_gudang'])
                .where(sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${cleanPemakaianId}`)
                .executeTakeFirst(),
            db
                .selectFrom('inventory.rekon_used_header')
                .select(['id', 'wo_number', 'nik_teknisi', 'name_gudang'])
                .where(sql<boolean>`TRIM(id_pemakaian) = ${cleanPemakaianId}`)
                .executeTakeFirst(),
        ]);

        if (!existingWo && !existingRekon) {
            // Data tidak ada di database lokal MTMS, tidak perlu di-rollback
            return {
                pemakaianId: cleanPemakaianId,
                woNumber: params.woNumber || null,
                rolledBack: false,
                reason: 'Data tidak ditemukan di database MTMS',
            };
        }

        const effectiveWoNumber =
            params.woNumber || existingWo?.wo_number || existingRekon?.wo_number || 'UNKNOWN_WO';
        const notes =
            params.reason ||
            `Rollback: WO berstatus REJECTED di Lensa (${effectiveWoNumber}, Pemakaian: ${cleanPemakaianId})`;
        const actor = params.actor || 'system';

        const invRepo = createInventoryRepository(db);
        await invRepo.rollbackReconciledWOLensa(cleanPemakaianId, notes, actor);

        actionLogger.info(
            `[WO-Reject-Rollback] Berhasil rollback WO REJECTED untuk Pemakaian ID ${cleanPemakaianId} (${effectiveWoNumber}). Intech dikembalikan dan data lokal dibersihkan.`
        );

        return {
            pemakaianId: cleanPemakaianId,
            woNumber: effectiveWoNumber,
            rolledBack: true,
        };
    } catch (error) {
        actionLogger.error(
            `[WO-Reject-Rollback] Gagal memproses rollback pemakaian ID ${cleanPemakaianId}:`,
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    }
}

/**
 * Batch processor untuk memproses daftar pemakaian WO Lensa berstatus REJECTED
 * yang dideteksi oleh scraper.
 */
export async function processRejectedWOLensaItems(
    items: Array<{ pemakaian_id: string; wo_number?: string | null }>,
    actor = 'scraper'
): Promise<RollbackResult[]> {
    if (!items || items.length === 0) return [];

    // Deduplikasi items berdasarkan pemakaian_id untuk mencegah panggilan database berulang
    const uniqueItems = Array.from(
        new Map(
            items
                .map((item) => [String(item.pemakaian_id ?? '').trim(), item] as const)
                .filter(([pId]) => pId !== '' && pId !== 'undefined')
        ).values()
    );

    const results: RollbackResult[] = [];
    for (const item of uniqueItems) {
        const pId = String(item.pemakaian_id ?? '').trim();

        try {
            const res = await handleRejectedWOPemakaian({
                pemakaianId: pId,
                woNumber: item.wo_number,
                reason: `Auto-Sync Scraper: WO berstatus REJECTED di Lensa (${item.wo_number || ''})`,
                actor,
            });
            results.push(res);
        } catch {
            results.push({
                pemakaianId: pId,
                woNumber: item.wo_number,
                rolledBack: false,
                reason: 'Error during execution',
            });
        }
    }

    return results;
}

