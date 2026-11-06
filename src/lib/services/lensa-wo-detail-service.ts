/**
 * Single WO Lensa detail scraper.
 *
 * Accepts either a pemakaian ID or a WO number and falls back to the Lensa
 * header-search endpoint when the direct detail lookup yields nothing.
 */
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    scrapeWOLensaDetails,
    searchSingleWOLensaHeader,
    type WOLensaHeader,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { decryptLensaPassword } from './lensa-crypto';
import {
    type LensaDetailMaterial,
    type ScrapedWODetailMaterial,
    type ScrapedWODetailResult,
    toISODateString,
} from './lensa-wo-types';

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

        const rawMaterials: LensaDetailMaterial[] = detail?.materials || [];
        const mappedMaterials: ScrapedWODetailMaterial[] = rawMaterials.map((m) => ({
            material_id: m['ID MATERIAL'] ? String(m['ID MATERIAL']) : null,
            material_desc: m['NAMA MATERIAL']
                ? String(m['NAMA MATERIAL'])
                : m.DESCRIPTION
                  ? String(m.DESCRIPTION)
                  : null,
            uom: m.SATUAN ? String(m.SATUAN) : null,
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
                    .returning('id')
                    .executeTakeFirst();

                savedHeaderId = inserted?.id ? String(inserted.id) : null;
            }

            if (savedHeaderId && headerMetadata) {
                // Jika header sudah ada (atau ditemukan lewat resolvedPemakaianId), lengkapi field yang sebelumnya bernilai null atau perbarui dengan metadata Lensa terkini
                const updatePayload: Record<string, unknown> = {};
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
    } catch (error: unknown) {
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
