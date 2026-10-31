import { format } from 'date-fns';
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    scrapeWOLensaDetails,
    scrapeWOLensaHeaders,
    scrapeWOLensaHeadersByNik,
    searchSingleWOLensaHeader,
    type WOLensaHeader,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { resolveMaterialAlias } from '@/lib/material-alias-helper';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { asyncPool, decryptLensaPassword } from './lensa-crypto';

export interface ScrapedWODetailMaterial {
    material_id: string | null;
    material_desc: string | null;
    uom: string | null;
    qty_pemakaian: number | null;
}

export interface ScrapedWODetailResult {
    pemakaian_id: string;
    wo_number: string | null;
    nama_gudang: string | null;
    nik_pemakai?: string | null;
    type: string | null;
    materials: ScrapedWODetailMaterial[];
}

export interface WOLensaScrapeOutcome {
    success: boolean;
    message: string;
    newCount?: number;
}

export function toISODateString(val: unknown): string | null {
    if (!val) return null;
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, 'yyyy-MM-dd');
    }
    return null;
}

/**
 * Service murni untuk eksekusi scraping WO Lensa (headers + details).
 * Bebas dari ketergantungan HTTP request Next.js (bisa dijalankan via Worker PM2 atau CLI).
 */
export async function executeWOLensaScraping(
    _perpage?: number,
    _fullLoop: boolean = false,
    action: ScraperAction = 'system'
): Promise<WOLensaScrapeOutcome> {
    const perpage = 100;
    try {
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'pic_1', 'pic_2'])
            .execute();

        const usersWithLensa = await db
            .selectFrom('auth.user as u')
            .where('u.lensa_acount', 'is not', null)
            .select(['u.id', 'u.nik', 'u.lensa_acount'])
            .execute();

        const userByNik = new Map<string, (typeof usersWithLensa)[number]>();
        for (const u of usersWithLensa) {
            if (u.nik) userByNik.set(u.nik, u);
        }

        // Ambil header terkini dengan batas 10.000 untuk mencegah unbounded memory scan di RAM
        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .orderBy('created_at', 'desc')
            .limit(10000)
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));

        let totalInserted = 0;

        const whTasks = whs
            .map((w) => {
                const pic1Nik = w.pic_1 ? String(w.pic_1).trim() : null;
                const pic2Nik = w.pic_2 ? String(w.pic_2).trim() : null;
                const pic1 = pic1Nik ? userByNik.get(pic1Nik) : undefined;
                const pic2 = pic2Nik ? userByNik.get(pic2Nik) : undefined;
                if (!pic1?.lensa_acount && !pic2?.lensa_acount) return null;
                return {
                    wh: w,
                    pic1: pic1?.lensa_acount ? pic1 : undefined,
                    pic2: pic2?.lensa_acount ? pic2 : undefined,
                };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

        if (whTasks.length === 0) {
            return {
                success: false,
                message:
                    'Tidak ada warehouse dengan PIC Lensa yang valid untuk melakukan scraping.',
            };
        }

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
                    actionLogger.error(`Failed to decrypt password for user ${picUser.id}`);
                    continue;
                }

                try {
                    const newHeaders = await scrapeWOLensaHeaders(
                        existingPemakaianIds,
                        customUsername,
                        customPassword,
                        perpage
                    );
                    actionLogger.info(
                        `[WO][${task.wh.name}] PIC ${customUsername} → ${newHeaders.length} headers`
                    );
                    return newHeaders;
                } catch (e: unknown) {
                    actionLogger.error(
                        `[WO][${task.wh.name}] Failed scrape PIC ${customUsername}: ${
                            e instanceof Error ? e.message : e
                        } — trying fallback`
                    );
                }
            }

            actionLogger.info(`[WO][${task.wh.name}] Semua PIC gagal.`);
            return [];
        });

        const allNewHeaders = headerResults.flat();

        const filteredHeaders = allNewHeaders.filter(
            (h) => !h.wo_number?.toUpperCase().includes('REJECTED')
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        const rowsWithGi = deduplicatedHeaders.filter(
            (header) =>
                existingPemakaianIds.includes(String(header.pemakaian_id)) &&
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

        if (deduplicatedHeaders.length > 0) {
            const pemakaianIds = deduplicatedHeaders
                .map((h: any) => (h.pemakaian_id ? String(h.pemakaian_id).trim() : ''))
                .filter(Boolean);
            const woNumbers = deduplicatedHeaders
                .map((h: any) => (h.wo_number ? String(h.wo_number).trim() : ''))
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
                        } as any)
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
                            } as any)
                        )
                        .execute();
                    totalInserted++;
                    existingPemakaianIds.push(String(h.pemakaian_id));
                }
            });
        }

        await syncMissingWOLensaDetails();

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data WO baru`
                : 'Selesai: Tidak ada data WO baru';

        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: resumeResult,
            })
            .catch((err) => {
                actionLogger.warn('[WO-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });

        return {
            success: true,
            message: `Scraping selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
            newCount: totalInserted,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Trigger WO scraping error:',
            error instanceof Error ? error : new Error(String(error))
        );
        const errMsg =
            error instanceof Error
                ? error.message
                : 'Terjadi kesalahan saat sinkronisasi WO Lensa.';
        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: `Gagal: ${errMsg}`,
            })
            .catch((err) => {
                actionLogger.warn('[WO-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });
        return {
            success: false,
            message: errMsg,
        };
    }
}

/**
 * Sinkronisasi detail material untuk header-header WO Lensa yang belum memiliki baris material di wo_lensa_list.
 */
export async function syncMissingWOLensaDetails(): Promise<number> {
    const headersMissingDetails = await db
        .selectFrom('inventory.wo_lensa_header as h')
        .leftJoin('inventory.wo_lensa_list as l', 'l.header_id', 'h.id')
        .select(['h.id', 'h.pemakaian_id', 'h.nama_gudang', 'h.type'])
        .where('l.id', 'is', null)
        .execute();

    if (headersMissingDetails.length === 0) return 0;

    const whs = await db
        .selectFrom('inventory.mas_wh')
        .select(['name', 'pic_1', 'pic_2'])
        .execute();
    const usersWithLensa = await db
        .selectFrom('auth.user as u')
        .where('u.lensa_acount', 'is not', null)
        .select(['u.nik', 'u.lensa_acount'])
        .execute();

    const groupedHeaders: Record<string, typeof headersMissingDetails> = {};
    for (const h of headersMissingDetails) {
        const gudang = h.nama_gudang || 'UNKNOWN';
        if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
        groupedHeaders[gudang].push(h);
    }

    const tasks = Object.keys(groupedHeaders)
        .map((gudang) => {
            const wh = findMatchingMasterWarehouse(gudang, whs);
            if (!wh) return null;
            const picNik = wh.pic_1 || wh.pic_2;
            if (!picNik) return null;
            const userObj = usersWithLensa.find((u) => u.nik === picNik);
            if (!userObj) return null;
            return {
                gudang,
                userObj,
                headers: groupedHeaders[gudang],
            };
        })
        .filter((t): t is NonNullable<typeof t> => !!t);

    let insertedDetailsCount = 0;

    const detailResults = await asyncPool(5, tasks, async (task) => {
        const { userObj, headers } = task;
        const lensaAcount = userObj.lensa_acount as Record<string, string>;
        const customUsername = lensaAcount.username;
        let customPassword = '';
        try {
            customPassword = decryptLensaPassword(lensaAcount.password);
        } catch (_e) {
            return [];
        }

        if (customUsername && customPassword) {
            try {
                return await scrapeWOLensaDetails(
                    headers.map((h) => ({
                        id: Number(h.id),
                        pemakaian_id: String(h.pemakaian_id),
                        type: (h as { type?: string | null }).type || 'assurance',
                    })),
                    customUsername,
                    customPassword
                );
            } catch (e: unknown) {
                actionLogger.error(
                    `Failed to scrape details for WO gudang ${task.gudang}:`,
                    e instanceof Error ? e : new Error(String(e))
                );
                return [];
            }
        }
        return [];
    });

    const allDetails = detailResults.flat();

    if (allDetails.length > 0) {
        await db.transaction().execute(async (trx) => {
            for (const d of allDetails) {
                if (d.materials && d.materials.length > 0) {
                    const materialInserts = d.materials.map(
                        (m: Record<string, string | number>) => {
                            const rawMaterialId = (m['ID MATERIAL'] as string)?.trim() || null;
                            const materialDesc = (m['NAMA MATERIAL'] as string) || null;

                            let materialId = rawMaterialId;
                            if (!materialId && materialDesc) {
                                const resolved = resolveMaterialAlias(materialDesc);
                                if (resolved) {
                                    actionLogger.info(
                                        `[WO Lensa] Resolved empty material_id via alias: "${materialDesc}" → "${resolved}" (header ${d.header_id})`
                                    );
                                    materialId = resolved;
                                } else {
                                    actionLogger.warn(
                                        `[WO Lensa] Material tanpa ID dan tidak ada alias: "${materialDesc}" (header ${d.header_id}).`
                                    );
                                }
                            }

                            return {
                                header_id: d.header_id,
                                material_id: materialId,
                                material_desc: materialDesc,
                                uom: (m.SATUAN as string) || null,
                                qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
                            };
                        }
                    );
                    await trx
                        .insertInto('inventory.wo_lensa_list')
                        .values(materialInserts)
                        .execute();
                    insertedDetailsCount += materialInserts.length;
                }
            }
        });
    }

    return insertedDetailsCount;
}

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
                        } as any)
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
                            } as any)
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

/**
 * Service untuk scraping single detail pemakaian WO Lensa.
 * Mendukung input Pemakaian ID maupun Nomor WO dengan mekanisme fallback otomatis
 * ke endpoint pencarian header WO Lensa jika diperlukan.
 */

export async function scrapeSingleWODetailService(
    idOrWoInput: string,
    sessionNik?: string
): Promise<{
    success: boolean;
    data?: ScrapedWODetailResult;
    error?: string;
}> {
    try {
        const cleanInput = idOrWoInput.trim();
        if (!cleanInput) {
            return {
                success: false,
                error: 'Pemakaian ID atau Nomor WO wajib diisi',
            };
        }

        // 1. Cek database lokal MTMS (berdasarkan pemakaian_id atau wo_number)
        let header = await db
            .selectFrom('inventory.wo_lensa_header')
            .selectAll()
            .where((eb) =>
                eb.or([
                    sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${cleanInput}`,
                    sql<boolean>`UPPER(wo_number) = UPPER(${cleanInput})`,
                ])
            )
            .executeTakeFirst();

        let customUsername = '';
        let customPassword = '';

        if (sessionNik) {
            const loggedUser = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('nik', '=', sessionNik)
                .executeTakeFirst();

            if (loggedUser?.lensa_username && loggedUser?.lensa_password) {
                try {
                    customUsername = loggedUser.lensa_username;
                    customPassword = decryptLensaPassword(loggedUser.lensa_password);
                } catch (e) {
                    actionLogger.warn('Failed to decrypt user Lensa password', {
                        error: e instanceof Error ? e.message : String(e),
                    });
                }
            }
        }

        if ((!customUsername || !customPassword) && header?.nama_gudang) {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select(['name', 'pic_1', 'pic_2'])
                .execute();
            const matchedWh = findMatchingMasterWarehouse(header.nama_gudang, whs);
            if (matchedWh) {
                for (const picNik of [matchedWh.pic_1, matchedWh.pic_2]) {
                    if (!picNik) continue;
                    const picUser = await db
                        .selectFrom('auth.user')
                        .select([
                            sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                            sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                        ])
                        .where('nik', '=', picNik)
                        .executeTakeFirst();

                    if (picUser?.lensa_username && picUser?.lensa_password) {
                        try {
                            customUsername = picUser.lensa_username;
                            customPassword = decryptLensaPassword(picUser.lensa_password);
                            if (customUsername && customPassword) break;
                        } catch {}
                    }
                }
            }
        }

        if (!customUsername || !customPassword) {
            const anyLensaUsers = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('lensa_acount', 'is not', null)
                .execute();

            for (const u of anyLensaUsers) {
                if (u.lensa_username && u.lensa_password) {
                    try {
                        customUsername = u.lensa_username;
                        customPassword = decryptLensaPassword(u.lensa_password);
                        if (customUsername && customPassword) break;
                    } catch {}
                }
            }
        }

        if (!customUsername || !customPassword) {
            customUsername = process.env.LENSA_USERNAME || '';
            customPassword = process.env.LENSA_PASSWORD || '';
        }

        if (!customUsername || !customPassword) {
            return {
                success: false,
                error: 'Kredensial akun Lensa tidak ditemukan. Pastikan ada akun Lensa yang terhubung.',
            };
        }

        const isNumeric = /^\d+$/.test(cleanInput);
        let resolvedPemakaianId: string | null = header?.pemakaian_id
            ? String(header.pemakaian_id)
            : null;

        let headerMetadata: Partial<WOLensaHeader> | null = header
            ? {
                  pemakaian_id: String(header.pemakaian_id),
                  wo_number: header.wo_number,
                  nama_gudang: header.nama_gudang,
                  nik_pemakai: header.nik_pemakai,
                  tanggal_update: header.tanggal_update,
                  formatted_date: toISODateString(header.formatted_date),
                  type: (header as { type?: string | null })?.type,
                  wbs: header.wbs,
                  gi_number: header.gi_number,
              }
            : null;

        // Jika belum ada resolvedPemakaianId dan input bukan angka murni (misal: "INC123456", "SC..."),
        // langsung cari header ke endpoint pencarian Lensa untuk menghemat waktu (fast path).
        if (!resolvedPemakaianId && !isNumeric) {
            const searchedHeader = await searchSingleWOLensaHeader(
                cleanInput,
                customUsername,
                customPassword
            );
            if (searchedHeader) {
                headerMetadata = searchedHeader;
                resolvedPemakaianId = searchedHeader.pemakaian_id;
            }
        } else if (!resolvedPemakaianId && isNumeric) {
            // Jika angka murni dan belum ada di DB, gunakan input sebagai kandidat pemakaian_id awal
            resolvedPemakaianId = cleanInput;
        }

        let detail:
            | {
                  header_id: number;
                  pemakaian_id: string;
                  materials: Record<string, string>[];
              }
            | undefined;

        // Coba scraping detail langsung jika sudah memiliki resolvedPemakaianId
        if (resolvedPemakaianId) {
            try {
                const details = await scrapeWOLensaDetails(
                    [
                        {
                            id: header?.id ? Number(header.id) : 0,
                            pemakaian_id: resolvedPemakaianId,
                            type: headerMetadata?.type || 'assurance',
                        },
                    ],
                    customUsername,
                    customPassword
                );
                if (details[0] && details[0].materials.length > 0) {
                    detail = details[0];
                }
            } catch (detailErr) {
                actionLogger.warn(
                    `[scrapeSingleWODetailService] Direct detail scrape failed for ${resolvedPemakaianId}:`,
                    { error: detailErr instanceof Error ? detailErr.message : String(detailErr) }
                );
            }
        }

        // PROSES FALLBACK:
        // Jika detail belum didapatkan atau material kosong, fallback ke endpoint header search Lensa
        if (!detail || detail.materials.length === 0) {
            actionLogger.info(
                `[scrapeSingleWODetailService] Running fallback search header on Lensa for '${cleanInput}'...`
            );
            const fallbackHeader = await searchSingleWOLensaHeader(
                cleanInput,
                customUsername,
                customPassword
            );

            if (fallbackHeader?.pemakaian_id) {
                headerMetadata = fallbackHeader;
                resolvedPemakaianId = fallbackHeader.pemakaian_id;

                try {
                    const fallbackDetails = await scrapeWOLensaDetails(
                        [
                            {
                                id: header?.id ? Number(header.id) : 0,
                                pemakaian_id: resolvedPemakaianId,
                                type: fallbackHeader.type || 'assurance',
                            },
                        ],
                        customUsername,
                        customPassword
                    );
                    if (fallbackDetails[0]) {
                        detail = fallbackDetails[0];
                    }
                } catch (fallbackDetailErr) {
                    actionLogger.error(
                        `[scrapeSingleWODetailService] Fallback detail scrape failed for ${resolvedPemakaianId}:`,
                        fallbackDetailErr instanceof Error
                            ? fallbackDetailErr
                            : new Error(String(fallbackDetailErr))
                    );
                }
            }
        }

        if (!resolvedPemakaianId) {
            return {
                success: false,
                error: `Data WO tidak ditemukan di sistem Lensa baik melalui Pemakaian ID maupun Nomor WO '${cleanInput}'.`,
            };
        }

        // Jika detail berhasil tapi headerMetadata belum lengkap (misal wo_number atau nik_pemakai belum ada),
        // ambil metadata header lengkap dari Lensa agar database terisi informasi yang utuh
        if (resolvedPemakaianId && (!headerMetadata?.wo_number || !headerMetadata?.nik_pemakai)) {
            try {
                let extraHeader = await searchSingleWOLensaHeader(
                    resolvedPemakaianId,
                    customUsername,
                    customPassword
                );
                if (!extraHeader && cleanInput !== resolvedPemakaianId) {
                    extraHeader = await searchSingleWOLensaHeader(
                        cleanInput,
                        customUsername,
                        customPassword
                    );
                }
                if (extraHeader) {
                    headerMetadata = {
                        ...headerMetadata,
                        ...extraHeader,
                    };
                }
            } catch {
                // Abaikan jika pencarian header metadata tambahan gagal, tetap simpan detail
            }
        }

        const rawMaterials: any[] = detail?.materials || [];
        const mappedMaterials: ScrapedWODetailMaterial[] = rawMaterials.map((m: any) => ({
            material_id: m['ID MATERIAL'] || null,
            material_desc: m['NAMA MATERIAL'] || m.DESCRIPTION || null,
            uom: m.SATUAN || null,
            qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
        }));

        let savedHeaderId: string | null = header?.id ? String(header.id) : null;

        // Jika pencarian awal dengan cleanInput belum menemukan header di DB (misal cleanInput berupa No WO tapi di DB wo_number masih null),
        // cek kembali DB menggunakan resolvedPemakaianId yang sudah terkonfirmasi numerik
        if (!savedHeaderId && resolvedPemakaianId) {
            const existingHeader = await db
                .selectFrom('inventory.wo_lensa_header')
                .selectAll()
                .where(sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${String(resolvedPemakaianId)}`)
                .executeTakeFirst();
            if (existingHeader) {
                header = existingHeader;
                savedHeaderId = String(existingHeader.id);
            }
        }

        await db.transaction().execute(async (trx) => {
            // Re-check di dalam transaksi untuk keamanan konkurensi
            if (!savedHeaderId && resolvedPemakaianId) {
                const existingInTrx = await trx
                    .selectFrom('inventory.wo_lensa_header')
                    .selectAll()
                    .where(
                        sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${String(resolvedPemakaianId)}`
                    )
                    .executeTakeFirst();
                if (existingInTrx) {
                    header = existingInTrx;
                    savedHeaderId = String(existingInTrx.id);
                }
            }

            // 1. Simpan Header ke inventory.wo_lensa_header jika belum ada di DB
            if (!savedHeaderId) {
                const pId = resolvedPemakaianId as string;
                const wo = headerMetadata?.wo_number ? String(headerMetadata.wo_number).trim() : '';

                // Cek status rekon_check terhadap inventory.rekon_used_header
                let isRekonCheck = false;
                if (pId || wo) {
                    const rekonMatch = await trx
                        .selectFrom('inventory.rekon_used_header')
                        .select(['id'])
                        .where((eb) => {
                            const conditions = [];
                            if (pId) conditions.push(eb('id_pemakaian', '=', pId));
                            if (wo) conditions.push(eb('wo_number', '=', wo));
                            return eb.or(conditions);
                        })
                        .limit(1)
                        .executeTakeFirst();
                    isRekonCheck = Boolean(rekonMatch);
                }

                const inserted = await trx
                    .insertInto('inventory.wo_lensa_header')
                    .values({
                        pemakaian_id: Number(pId) || sql`CAST(${pId} AS BIGINT)`,
                        gi_number: headerMetadata?.gi_number ?? null,
                        nama_gudang: headerMetadata?.nama_gudang ?? null,
                        nik_pemakai: headerMetadata?.nik_pemakai ?? null,
                        tanggal_update: headerMetadata?.tanggal_update ?? null,
                        formatted_date: headerMetadata?.formatted_date ?? null,
                        type: headerMetadata?.type ?? 'assurance',
                        wbs: headerMetadata?.wbs ?? null,
                        wo_number: headerMetadata?.wo_number ?? null,
                        rekon_check: isRekonCheck,
                    } as any)
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
                        } as any)
                    )
                    .returning('id')
                    .executeTakeFirst();

                savedHeaderId = (inserted as any)?.id ? String((inserted as any).id) : null;
            }

            if (savedHeaderId && headerMetadata) {
                // Jika header sudah ada (atau ditemukan lewat resolvedPemakaianId), lengkapi field yang sebelumnya bernilai null atau perbarui dengan metadata Lensa terkini
                const updatePayload: Record<string, any> = {};
                if (headerMetadata.wo_number && headerMetadata.wo_number !== header?.wo_number) {
                    updatePayload.wo_number = headerMetadata.wo_number;
                }
                if (
                    headerMetadata.nama_gudang &&
                    headerMetadata.nama_gudang !== header?.nama_gudang
                ) {
                    updatePayload.nama_gudang = headerMetadata.nama_gudang;
                }
                if (
                    headerMetadata.nik_pemakai &&
                    headerMetadata.nik_pemakai !== header?.nik_pemakai
                ) {
                    updatePayload.nik_pemakai = headerMetadata.nik_pemakai;
                }
                if (headerMetadata.gi_number && headerMetadata.gi_number !== header?.gi_number) {
                    updatePayload.gi_number = headerMetadata.gi_number;
                }
                const targetFormattedDate = toISODateString(headerMetadata.formatted_date);
                const existingFormattedDate = toISODateString(header?.formatted_date);
                if (targetFormattedDate && targetFormattedDate !== existingFormattedDate) {
                    updatePayload.formatted_date = targetFormattedDate;
                }
                if (
                    headerMetadata.tanggal_update &&
                    headerMetadata.tanggal_update !== header?.tanggal_update
                ) {
                    updatePayload.tanggal_update = headerMetadata.tanggal_update;
                }
                if (headerMetadata.type && headerMetadata.type !== header?.type) {
                    updatePayload.type = headerMetadata.type;
                }
                if (headerMetadata.wbs && headerMetadata.wbs !== header?.wbs) {
                    updatePayload.wbs = headerMetadata.wbs;
                }
                if (Object.keys(updatePayload).length > 0) {
                    await trx
                        .updateTable('inventory.wo_lensa_header')
                        .set(updatePayload)
                        .where('id', '=', savedHeaderId)
                        .execute();
                }
            }

            // 2. Simpan Detail Material ke inventory.wo_lensa_list
            if (savedHeaderId) {
                await trx
                    .deleteFrom('inventory.wo_lensa_list')
                    .where('header_id', '=', savedHeaderId)
                    .execute();

                if (mappedMaterials.length > 0) {
                    const materialInserts = mappedMaterials.map((m) => ({
                        header_id: savedHeaderId as string,
                        material_id: m.material_id,
                        material_desc: m.material_desc,
                        uom: m.uom,
                        qty_pemakaian: m.qty_pemakaian,
                    }));

                    await trx
                        .insertInto('inventory.wo_lensa_list')
                        .values(materialInserts)
                        .execute();
                }
            }
        });

        const resume =
            mappedMaterials.length > 0
                ? `Sukses menarik ${mappedMaterials.length} material untuk ID ${resolvedPemakaianId}`
                : `Selesai: Tidak ada material ditemukan untuk ID ${resolvedPemakaianId}`;

        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action: 'manual',
                resume_result: `Detail Manual: ${resume}`,
            })
            .catch((err) => {
                actionLogger.warn('[WO-Lensa] Gagal mencatat log scraper_cronjob_log:', err);
            });

        return {
            success: true,
            data: {
                pemakaian_id: resolvedPemakaianId,
                wo_number: headerMetadata?.wo_number ?? header?.wo_number ?? null,
                nama_gudang: headerMetadata?.nama_gudang ?? header?.nama_gudang ?? null,
                nik_pemakai: headerMetadata?.nik_pemakai ?? header?.nik_pemakai ?? null,
                type: headerMetadata?.type ?? (header as { type?: string | null })?.type ?? null,
                materials: mappedMaterials,
            },
        };
    } catch (error: any) {
        actionLogger.error(
            'scrapeSingleWODetailService error:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Terjadi kesalahan sistem',
        };
    }
}
