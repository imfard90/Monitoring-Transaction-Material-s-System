import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    scrapeWOLensaDetails,
    scrapeWOLensaHeaders,
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
    type: string | null;
    materials: ScrapedWODetailMaterial[];
}

export interface WOLensaScrapeOutcome {
    success: boolean;
    message: string;
    newCount?: number;
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

        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
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
                            pemakaian_id: h.pemakaian_id,
                            gi_number: h.gi_number,
                            nama_gudang: h.nama_gudang,
                            nik_pemakai: h.nik_pemakai,
                            tanggal_update: h.tanggal_update,
                            formatted_date: h.formatted_date,
                            type: h.type,
                            wbs: h.wbs,
                            wo_number: h.wo_number,
                            rekon_check: isRekonCheck,
                        } as any)
                        .execute();
                    totalInserted++;
                    existingPemakaianIds.push(String(h.pemakaian_id));
                }
            });
        }

        const headersMissingDetails = await db
            .selectFrom('inventory.wo_lensa_header as h')
            .leftJoin('inventory.wo_lensa_list as l', 'l.header_id', 'h.id')
            .select(['h.id', 'h.pemakaian_id', 'h.nama_gudang', 'h.type'])
            .where('l.id', 'is', null)
            .execute();

        if (headersMissingDetails.length > 0) {
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
                .filter((t) => !!t);

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
                                    const rawMaterialId =
                                        (m['ID MATERIAL'] as string)?.trim() || null;
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
                        }
                    }
                });
            }
        }

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
 * Service untuk scraping single detail pemakaian WO Lensa
 */
export async function scrapeSingleWODetailService(
    pemakaianIdInput: string,
    sessionNik?: string
): Promise<{
    success: boolean;
    data?: ScrapedWODetailResult;
    error?: string;
}> {
    try {
        const header = await db
            .selectFrom('inventory.wo_lensa_header')
            .selectAll()
            .where(sql`CAST(pemakaian_id AS VARCHAR)`, '=', pemakaianIdInput)
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

        const details = await scrapeWOLensaDetails(
            [
                {
                    id: header?.id ? Number(header.id) : 0,
                    pemakaian_id: pemakaianIdInput,
                    type: (header as { type?: string | null })?.type || 'assurance',
                },
            ],
            customUsername,
            customPassword
        );

        const detail = details[0];
        if (!detail) {
            return {
                success: false,
                error: 'Tidak ada material ditemukan dari sistem Lensa untuk ID pemakaian ini.',
            };
        }

        const rawMaterials: any[] = detail.materials || [];
        const mappedMaterials: ScrapedWODetailMaterial[] = rawMaterials.map((m: any) => ({
            material_id: m['ID MATERIAL'] || null,
            material_desc: m['NAMA MATERIAL'] || m.DESCRIPTION || null,
            uom: m.SATUAN || null,
            qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
        }));

        let savedHeaderId: string | null = header?.id ?? null;

        await db.transaction().execute(async (trx) => {
            if (savedHeaderId) {
                await trx
                    .deleteFrom('inventory.wo_lensa_list')
                    .where('header_id', '=', savedHeaderId)
                    .execute();
            } else {
                const inserted = await trx
                    .insertInto('inventory.wo_lensa_header')
                    .values({
                        pemakaian_id: pemakaianIdInput,
                        gi_number: null,
                        nama_gudang: null,
                        nik_pemakai: null,
                        tanggal_update: null,
                        formatted_date: null,
                        type: 'assurance',
                        wbs: null,
                        wo_number: null,
                        rekon_check: false,
                    } as any)
                    .returning('id')
                    .executeTakeFirst();

                savedHeaderId = (inserted as any)?.id ? String((inserted as any).id) : null;
            }

            if (savedHeaderId && mappedMaterials.length > 0) {
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
        });

        const resume =
            mappedMaterials.length > 0
                ? `Sukses menarik ${mappedMaterials.length} material untuk ID ${pemakaianIdInput}`
                : `Selesai: Tidak ada material ditemukan untuk ID ${pemakaianIdInput}`;

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
                pemakaian_id: pemakaianIdInput,
                wo_number: header?.wo_number ?? null,
                nama_gudang: header?.nama_gudang ?? null,
                type: (header as { type?: string | null })?.type ?? null,
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
