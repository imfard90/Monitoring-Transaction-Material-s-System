/**
 * Nightly deep-sweep WO Lensa scraper (02:00 WIB).
 *
 * - Loops over every active technician NIK per warehouse.
 * - Runs the 5 SO warehouses in parallel.
 * - Each NIK gets up to 3 retries on Lensa network/server failures.
 * - Tolerates irregular WO number formats (1-xxxx, LPxxxx, ...).
 */
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { scrapeWOLensaHeadersByNik } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { asyncPool, decryptLensaPassword } from './lensa-crypto';
import { syncMissingWOLensaDetails } from './lensa-wo-sync-service';
import { toISODateString, type WOLensaScrapeOutcome } from './lensa-wo-types';

/**
 * Nightly Deep Sweep Scraper untuk WO Lensa Ref Header & Detail (Pukul 02:00 WIB).
 * - Melakukan loop berdasarkan NIK seluruh teknisi aktif per gudang
 * - Berjalan paralel pada 5 instance gudang SO (Karangpilang, Gresik, Lamongan, Bojonegoro, Tuban)
 * - Masing-masing NIK memiliki batas retry 3x jika terjadi kegagalan jaringan/server Lensa
 * - Mengakomodasi nomor WO yang formatnya tidak beraturan (1-xxxx, LPxxxx, dll)
 * - Menyimpan header baru dan menyinkronkan detail yang belum lengkap
 */
export async function executeNightlyWOLensaScrapingByNik(
    action: ScraperAction = 'system'
): Promise<WOLensaScrapeOutcome> {
    try {
        actionLogger.info(
            '[WO-NIGHTLY] Memulai Nightly Deep Sweep WO Lensa berdasarkan NIK teknisi...'
        );

        // 1. Ambil gudang master SO (id 1..5)
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'pic_1', 'pic_2'])
            .where('id', 'in', [1, 2, 3, 4, 5])
            .orderBy('id', 'asc')
            .execute();

        // 2. Ambil akun Lensa untuk para PIC
        const usersWithLensa = await db
            .selectFrom('auth.user as u')
            .where('u.lensa_acount', 'is not', null)
            .select(['u.id', 'u.nik', 'u.lensa_acount'])
            .execute();

        const userByNik = new Map<string, (typeof usersWithLensa)[number]>();
        for (const u of usersWithLensa) {
            if (u.nik) userByNik.set(u.nik, u);
        }

        // 3. Ambil NIK seluruh teknisi aktif per gudang
        const activeTechs = await db
            .selectFrom('hr.technicians')
            .select(['nik', 'wh_id'])
            .where('is_active', '=', true)
            .where('wh_id', 'is not', null)
            .execute();

        const techNiksByWhId = new Map<number, string[]>();
        for (const t of activeTechs) {
            if (!t.wh_id || !t.nik) continue;
            const cleanNik = t.nik.trim();
            if (!cleanNik) continue;
            const list = techNiksByWhId.get(t.wh_id) || [];
            if (!list.includes(cleanNik)) {
                list.push(cleanNik);
            }
            techNiksByWhId.set(t.wh_id, list);
        }

        // 4. Ambil daftar existing pemakaian_id (batas 10.000)
        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .orderBy('created_at', 'desc')
            .limit(10000)
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));
        const existingSet = new Set<string>(existingPemakaianIds);

        // 5. Susun task per gudang (5 instances)
        const whTasks = whs
            .map((w) => {
                const pic1Nik = w.pic_1 ? String(w.pic_1).trim() : null;
                const pic2Nik = w.pic_2 ? String(w.pic_2).trim() : null;
                const pic1 = pic1Nik ? userByNik.get(pic1Nik) : undefined;
                const pic2 = pic2Nik ? userByNik.get(pic2Nik) : undefined;
                const niks = techNiksByWhId.get(w.id) || [];

                if (!pic1?.lensa_acount && !pic2?.lensa_acount) {
                    actionLogger.warn(
                        `[WO-NIGHTLY][${w.name}] Dilewati: Tidak ada PIC dengan akun Lensa valid.`
                    );
                    return null;
                }
                if (niks.length === 0) {
                    actionLogger.warn(
                        `[WO-NIGHTLY][${w.name}] Dilewati: Tidak ada teknisi aktif terdaftar.`
                    );
                    return null;
                }

                return {
                    wh: w,
                    pic1: pic1?.lensa_acount ? pic1 : undefined,
                    pic2: pic2?.lensa_acount ? pic2 : undefined,
                    niks,
                };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

        if (whTasks.length === 0) {
            return {
                success: false,
                message:
                    'Tidak ada gudang dengan PIC Lensa dan teknisi aktif untuk scraping malam.',
            };
        }

        actionLogger.info(
            `[WO-NIGHTLY] Menjalankan scraping 5 instance gudang secara paralel untuk total ${activeTechs.length} teknisi aktif...`
        );

        // 6. Jalankan scraping paralel 5 instance gudang
        const headerResults = await asyncPool(5, whTasks, async (task) => {
            const candidates = [task.pic1, task.pic2].filter(Boolean) as NonNullable<
                (typeof whTasks)[number]['pic1']
            >[];
            if (candidates.length === 0) return [];

            for (const picUser of candidates) {
                const lensaAcount = picUser.lensa_acount as Record<string, string> | null;
                if (!lensaAcount?.username || !lensaAcount?.password) continue;

                const customUsername = lensaAcount.username;
                let customPassword = '';
                try {
                    customPassword = decryptLensaPassword(lensaAcount.password);
                } catch (_e) {
                    actionLogger.error(
                        `[WO-NIGHTLY] Gagal dekripsi password Lensa untuk user ${picUser.id}`
                    );
                    continue;
                }

                try {
                    actionLogger.info(
                        `[WO-NIGHTLY][${task.wh.name}] Memulai sweep PIC ${customUsername} (${task.niks.length} teknisi)...`
                    );
                    const newHeaders = await scrapeWOLensaHeadersByNik(
                        task.niks,
                        existingPemakaianIds,
                        customUsername,
                        customPassword,
                        100,
                        3
                    );
                    actionLogger.info(
                        `[WO-NIGHTLY][${task.wh.name}] Selesai PIC ${customUsername} → ${newHeaders.length} headers ditemukan.`
                    );
                    return newHeaders;
                } catch (e: unknown) {
                    actionLogger.error(
                        `[WO-NIGHTLY][${task.wh.name}] Gagal scrape PIC ${customUsername}: ${
                            e instanceof Error ? e.message : e
                        } — mencoba fallback PIC berikutnya jika ada`
                    );
                }
            }

            actionLogger.warn(`[WO-NIGHTLY][${task.wh.name}] Semua kandidat PIC gagal.`);
            return [];
        });

        const allNewHeaders = headerResults.flat();
        const filteredHeaders = allNewHeaders.filter(
            (h) => !h.wo_number?.toUpperCase().includes('REJECTED')
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(String(h.pemakaian_id), h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // 7. Update nomor GI pada header yang sebelumnya kosong
        const rowsWithGi = deduplicatedHeaders.filter(
            (header) =>
                existingSet.has(String(header.pemakaian_id)) &&
                header.gi_number != null &&
                String(header.gi_number).trim() !== ''
        );

        for (let index = 0; index < rowsWithGi.length; index += 200) {
            const batch = rowsWithGi.slice(index, index + 200);
            await db.transaction().execute(async (trx) => {
                await sql`
                    UPDATE inventory.wo_lensa_header AS header
                    SET gi_number = updates.gi_number
                    FROM (${sql.join(
                        batch.map(
                            (header) =>
                                sql`(${Number(header.pemakaian_id)}, ${String(header.gi_number)})`
                        ),
                        sql`, `
                    )}) AS updates(pemakaian_id, gi_number)
                    WHERE header.pemakaian_id = updates.pemakaian_id
                      AND header.gi_number IS NULL
                `.execute(trx);
            });
        }

        // 8. Simpan / Perbarui header ke database
        let totalInserted = 0;
        if (deduplicatedHeaders.length > 0) {
            const pemakaianIds = deduplicatedHeaders
                .map((h) => (h.pemakaian_id ? String(h.pemakaian_id).trim() : ''))
                .filter(Boolean);
            const woNumbers = deduplicatedHeaders
                .map((h) => (h.wo_number ? String(h.wo_number).trim() : ''))
                .filter(Boolean);

            const matchedPemakaianIds = new Set<string>();
            const matchedWoNumbers = new Set<string>();

            if (pemakaianIds.length > 0 || woNumbers.length > 0) {
                let rekonQuery = db
                    .selectFrom('inventory.rekon_used_header')
                    .select(['id_pemakaian', 'wo_number']);

                if (pemakaianIds.length > 0 && woNumbers.length > 0) {
                    rekonQuery = rekonQuery.where((eb) =>
                        eb.or([
                            eb('id_pemakaian', 'in', pemakaianIds),
                            eb('wo_number', 'in', woNumbers),
                        ])
                    );
                } else if (pemakaianIds.length > 0) {
                    rekonQuery = rekonQuery.where('id_pemakaian', 'in', pemakaianIds);
                } else {
                    rekonQuery = rekonQuery.where('wo_number', 'in', woNumbers);
                }

                const existingRekon = await rekonQuery.execute();
                for (const r of existingRekon) {
                    if (r.id_pemakaian?.trim()) matchedPemakaianIds.add(r.id_pemakaian.trim());
                    if (r.wo_number?.trim()) matchedWoNumbers.add(r.wo_number.trim());
                }
            }

            await db.transaction().execute(async (trx) => {
                for (const h of deduplicatedHeaders) {
                    const pId = h.pemakaian_id ? String(h.pemakaian_id).trim() : '';
                    const wo = h.wo_number ? String(h.wo_number).trim() : '';
                    const isRekonCheck =
                        (Boolean(pId) && matchedPemakaianIds.has(pId)) ||
                        (Boolean(wo) && matchedWoNumbers.has(wo));

                    const isNew = !existingSet.has(pId);

                    await trx
                        .insertInto('inventory.wo_lensa_header')
                        .values({
                            pemakaian_id: Number(pId) || sql`CAST(${pId} AS BIGINT)`,
                            gi_number: h.gi_number,
                            nama_gudang: h.nama_gudang,
                            nik_pemakai: h.nik_pemakai,
                            tanggal_update: h.tanggal_update,
                            formatted_date: toISODateString(h.formatted_date),
                            type: h.type,
                            wbs: h.wbs,
                            wo_number: h.wo_number,
                            rekon_check: isRekonCheck,
                        })
                        .onConflict((oc) =>
                            oc.column('pemakaian_id').doUpdateSet({
                                wo_number: sql`COALESCE(EXCLUDED.wo_number, inventory.wo_lensa_header.wo_number)`,
                                nama_gudang: sql`COALESCE(EXCLUDED.nama_gudang, inventory.wo_lensa_header.nama_gudang)`,
                                nik_pemakai: sql`COALESCE(EXCLUDED.nik_pemakai, inventory.wo_lensa_header.nik_pemakai)`,
                                gi_number: sql`COALESCE(EXCLUDED.gi_number, inventory.wo_lensa_header.gi_number)`,
                                tanggal_update: sql`COALESCE(EXCLUDED.tanggal_update, inventory.wo_lensa_header.tanggal_update)`,
                                formatted_date: sql`COALESCE(EXCLUDED.formatted_date, inventory.wo_lensa_header.formatted_date)`,
                                type: sql`COALESCE(EXCLUDED.type, inventory.wo_lensa_header.type)`,
                                wbs: sql`COALESCE(EXCLUDED.wbs, inventory.wo_lensa_header.wbs)`,
                                rekon_check: sql`COALESCE(EXCLUDED.rekon_check, inventory.wo_lensa_header.rekon_check)`,
                            })
                        )
                        .execute();

                    if (isNew) {
                        totalInserted++;
                        existingSet.add(pId);
                        existingPemakaianIds.push(pId);
                    }
                }
            });
        }

        // 9. Sinkronisasi detail material untuk header yang belum memiliki detail
        const syncedDetailsCount = await syncMissingWOLensaDetails();
        actionLogger.info(
            `[WO-NIGHTLY] Sinkronisasi detail selesai: ${syncedDetailsCount} baris material tersimpan.`
        );

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data WO baru (Sweep Malam NIK)`
                : 'Selesai: Tidak ada data WO baru (Sweep Malam NIK)';

        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: resumeResult,
            })
            .catch((err) => {
                actionLogger.warn('[WO-NIGHTLY] Gagal mencatat scraper_cronjob_log:', err);
            });

        return {
            success: true,
            message: `Nightly sweep selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
            newCount: totalInserted,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Nightly WO NIK scraping error:',
            error instanceof Error ? error : new Error(String(error))
        );
        const errMsg =
            error instanceof Error
                ? error.message
                : 'Terjadi kesalahan saat nightly sweep WO Lensa.';
        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: `Gagal: ${errMsg} (Sweep Malam NIK)`,
            })
            .catch((err) => {
                actionLogger.warn('[WO-NIGHTLY] Gagal mencatat scraper_cronjob_log:', err);
            });
        return {
            success: false,
            message: errMsg,
        };
    }
}
