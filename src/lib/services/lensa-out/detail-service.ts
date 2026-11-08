/**
 * Single Out Lensa reservation detail scraper.
 *
 * Resolves the Lensa credentials from the session NIK (falling back to any
 * configured account), scrapes the reservation detail, and upserts the header
 * plus its material rows.
 */
import { db } from '@/lib/db/db';
import { scrapeLensaDetails } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { resolveMaterialAlias } from '@/lib/material-alias-helper';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import {
    executeWithLensaFallback,
    getWarehouseLensaCandidates,
} from '../lensa-credential-helper';
import type { ScrapedOutLensaDetailMaterial, ScrapedOutLensaDetailResult } from './types';

/**
 * Service untuk scraping single detail reservation Out Lensa
 */
export async function scrapeSingleOutLensaDetailService(
    reservationId: string,
    sessionNik?: string
): Promise<{
    success: boolean;
    data?: ScrapedOutLensaDetailResult;
    error?: string;
}> {
    try {
        const header = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .selectAll()
            .where('reservation_id', '=', reservationId)
            .executeTakeFirst();

        // 2. Ambil kandidat kredensial Lensa (PIC 1 -> fallback PIC 2 -> user -> system)
        const candidates = await getWarehouseLensaCandidates({
            warehouseName: header?.nama_gudang,
            sessionNik,
        });

        if (candidates.length === 0) {
            return {
                success: false,
                error: 'Kredensial akun Lensa tidak ditemukan. Pastikan ada akun Lensa yang terhubung.',
            };
        }

        const headerId = header ? header.id : '0';

        actionLogger.info(
            `[Out-Lensa-Detail-Manual] Scraping detail for reservation_id=${reservationId}...`
        );
        const scrapeResults = await executeWithLensaFallback(
            candidates,
            async (creds) => {
                return scrapeLensaDetails(
                    [{ id: Number(headerId) || 0, reservation_id: reservationId }],
                    creds.username,
                    creds.password,
                    1
                );
            },
            'Out-Lensa-Detail-Manual'
        );

        const detailItem = scrapeResults[0];
        const rawMaterials = detailItem?.materials || [];
        const scrapedMitra = detailItem?.mitra || null;

        // 4. Buat header jika belum ada
        let targetHeaderId = headerId;
        if (!header) {
            const created = await db
                .insertInto('inventory.out_lensa_ref_header')
                .values({
                    reservation_id: reservationId,
                    tgl_entry: new Date().toISOString(),
                    formatted_date: new Date().toISOString().slice(0, 10),
                    mitra: scrapedMitra,
                })
                .returning('id')
                .executeTakeFirst();
            if (created) {
                targetHeaderId = String(created.id);
            }
        } else if (scrapedMitra && !header.mitra) {
            await db
                .updateTable('inventory.out_lensa_ref_header')
                .set({ mitra: scrapedMitra })
                .where('id', '=', String(header.id))
                .execute();
        }

        const mappedMaterials: ScrapedOutLensaDetailMaterial[] = rawMaterials.map(
            (m: Record<string, string>) => {
                const rawMaterialId = (m['ID MATERIAL'] as string)?.trim() || null;
                const materialDesc =
                    m['NAMA MATERIAL'] || m['MATERIAL DESC'] || m.DESCRIPTION || null;
                let materialId = rawMaterialId;
                if (!materialId && materialDesc) {
                    const resolved = resolveMaterialAlias(materialDesc);
                    if (resolved) materialId = resolved;
                }
                return {
                    material_id: materialId,
                    material_desc: materialDesc,
                    qty_approve:
                        m['QTY ACCEPTED'] || m['QTY APPROVE']
                            ? String(m['QTY ACCEPTED'] || m['QTY APPROVE'])
                            : null,
                };
            }
        );

        if (targetHeaderId && targetHeaderId !== '0' && mappedMaterials.length > 0) {
            await db.transaction().execute(async (trx) => {
                await trx
                    .deleteFrom('inventory.out_lensa_ref_list')
                    .where('header_id', '=', String(targetHeaderId))
                    .execute();

                const dbInserts = mappedMaterials.map((m) => ({
                    header_id: String(targetHeaderId),
                    material_id: m.material_id,
                    material_desc: m.material_desc,
                    qty_approve: m.qty_approve,
                }));

                await trx.insertInto('inventory.out_lensa_ref_list').values(dbInserts).execute();
            });
        }

        // Catat ke inventory.scraper_cronjob_log
        const resume =
            mappedMaterials.length > 0
                ? `Sukses menarik ${mappedMaterials.length} material untuk Reservasi ${reservationId}`
                : `Selesai: Tidak ada material ditemukan untuk Reservasi ${reservationId}`;

        await scraperLogRepository
            .insertLog({
                scraper_type: 'out_lensa',
                action: 'manual',
                resume_result: `Detail Manual: ${resume}`,
            })
            .catch((err) => {
                actionLogger.warn('[Out-Lensa] Gagal mencatat log scraper_cronjob_log:', err);
            });

        return {
            success: true,
            data: {
                reservation_id: reservationId,
                gi_number: header?.gi_number ?? null,
                nama_gudang: header?.nama_gudang ?? null,
                mitra: scrapedMitra || header?.mitra || null,
                materials: mappedMaterials,
            },
        };
    } catch (error: unknown) {
        actionLogger.error(
            'scrapeSingleOutLensaDetailService error:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Terjadi kesalahan sistem',
        };
    }
}
