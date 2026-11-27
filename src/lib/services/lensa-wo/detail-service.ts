/**
 * Single WO Lensa detail scraper.
 *
 * Accepts either a pemakaian ID or a WO number and falls back to the Lensa
 * header-search endpoint when the direct detail lookup yields nothing.
 */
import crypto from 'node:crypto';
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    isRejectedWONumber,
    type RejectedWOLensaItem,
    scrapeWOLensaDetails,
    searchSingleWOLensaHeader,
    type WOLensaHeader,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { lensaEltRepository } from '@/lib/repositories/lensa-elt.repository';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import {
    executeWithLensaFallback,
    getWarehouseLensaCandidates,
} from '../lensa-credential-helper';
import { handleRejectedWOPemakaian, processRejectedWOLensaItems } from './rollback-service';
import {
    type LensaDetailMaterial,
    type ScrapedWODetailMaterial,
    type ScrapedWODetailResult,
    toISODateString,
} from './types';

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

        // 1. Cek database lokal MTMS (berdasarkan pemakaian_id atau wo_number, utamakan yang non-rejected)
        let header = await db
            .selectFrom('inventory.wo_lensa_header')
            .selectAll()
            .where((eb) =>
                eb.or([
                    sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${cleanInput}`,
                    sql<boolean>`UPPER(wo_number) = UPPER(${cleanInput})`,
                ])
            )
            .orderBy(
                sql`CASE WHEN UPPER(wo_number) LIKE '%REJECTED%' THEN 1 ELSE 0 END`,
                'asc'
            )
            .orderBy('id', 'desc')
            .executeTakeFirst();

        // 1.1 Jika header lokal berstatus REJECTED dan input bukan secara spesifik WO REJECTED,
        // lakukan rollback & bersihkan data lokal agar sistem dapat mencari WO valid terkini di Lensa
        if (header && isRejectedWONumber(header.wo_number)) {
            if (isRejectedWONumber(cleanInput)) {
                return {
                    success: false,
                    error: `Nomor WO '${header.wo_number}' berstatus REJECTED dan tidak dapat discrape ke dalam sistem MTMS.`,
                };
            }
            actionLogger.warn(
                `[scrapeSingleWODetailService] Menjalankan rollback & pembersihan header lokal REJECTED (ID ${header.id}, Pemakaian: ${header.pemakaian_id}).`
            );
            await handleRejectedWOPemakaian({
                pemakaianId: String(header.pemakaian_id),
                woNumber: header.wo_number,
                actor: sessionNik,
            });
            header = undefined;
        }

        // 1.2 Validasi awal: jika input eksplisit adalah nomor WO REJECTED, tolak langsung
        if (isRejectedWONumber(cleanInput)) {
            const rejectedWo = header?.wo_number ?? cleanInput;
            actionLogger.warn(
                `[scrapeSingleWODetailService] Input awal terdeteksi REJECTED: '${rejectedWo}'`
            );
            return {
                success: false,
                error: `Nomor WO '${rejectedWo}' berstatus REJECTED dan tidak dapat discrape ke dalam sistem MTMS.`,
            };
        }

        // 2. Ambil kandidat akun Lensa (PIC 1 -> fallback PIC 2 -> user -> system)
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

        const scrapeOutcome = await executeWithLensaFallback(
            candidates,
            async (creds) => {
                let currentHeaderMeta = headerMetadata;
                let currentPemakaianId = resolvedPemakaianId;

                // Selalu verifikasi header metadata terkini di Lensa (untuk mendeteksi status REJECTED terbaru, GI number, dan WBS)
                // Catatan: Jika input numerik (pemakaian_id) belum tersimpan di DB, endpoint pencarian Lensa tidak mendukung filter pemakaian_id.
                // Jika nomor WO tersedia dari database lokal, gunakan nomor WO untuk verifikasi status mutakhir di Lensa.
                const lookupQuery = isNumeric
                    ? (header?.wo_number ?? null)
                    : cleanInput;
                const targetPemakaianId =
                    currentPemakaianId || (isNumeric ? cleanInput : undefined);

                const rejectedInSearch: RejectedWOLensaItem[] = [];

                if (lookupQuery) {
                    const searchedHeader = await searchSingleWOLensaHeader(
                        lookupQuery,
                        creds.username,
                        creds.password,
                        targetPemakaianId,
                        rejectedInSearch
                    );
                    if (searchedHeader) {
                        currentHeaderMeta = searchedHeader;
                        if (!currentPemakaianId) {
                            currentPemakaianId = searchedHeader.pemakaian_id;
                        }
                    } else if (!currentPemakaianId && isNumeric) {
                        currentPemakaianId = cleanInput;
                    }
                } else if (!currentPemakaianId && isNumeric) {
                    currentPemakaianId = cleanInput;
                }

                // Jika terdeteksi item rejected pada hasil pencarian Lensa, proses rollback segera
                if (rejectedInSearch.length > 0) {
                    await processRejectedWOLensaItems(rejectedInSearch, 'detail-service');
                }

                // Cek awal jika header metadata dari Lensa sudah terdeteksi REJECTED, jangan lanjutkan scrape detail material
                if (isRejectedWONumber(currentHeaderMeta?.wo_number)) {
                    return {
                        detail: undefined,
                        headerMetadata: currentHeaderMeta,
                        resolvedPemakaianId: currentPemakaianId,
                        creds,
                    };
                }

                let currentDetail:
                    | {
                          header_id: number;
                          pemakaian_id: string;
                          materials: Record<string, string>[];
                      }
                    | undefined;

                if (currentPemakaianId) {
                    try {
                        const details = await scrapeWOLensaDetails(
                            [
                                {
                                    id: header?.id ? Number(header.id) : 0,
                                    pemakaian_id: currentPemakaianId,
                                    type: currentHeaderMeta?.type || 'assurance',
                                },
                            ],
                            creds.username,
                            creds.password
                        );
                        if (details[0] && details[0].materials.length > 0) {
                            currentDetail = details[0];
                        }
                    } catch (detailErr) {
                        actionLogger.warn(
                            `[scrapeSingleWODetailService] Direct detail scrape failed for ${currentPemakaianId}:`,
                            {
                                error:
                                    detailErr instanceof Error
                                        ? detailErr.message
                                        : String(detailErr),
                            }
                        );
                    }
                }

                if (!currentDetail || currentDetail.materials.length === 0) {
                    actionLogger.info(
                        `[scrapeSingleWODetailService] Running fallback search header on Lensa for '${cleanInput}' via ${creds.username}...`
                    );
                    const fallbackQuery =
                        isNumeric && header?.wo_number ? header.wo_number : cleanInput;
                    const fallbackRejected: RejectedWOLensaItem[] = [];
                    const fallbackHeader = await searchSingleWOLensaHeader(
                        fallbackQuery,
                        creds.username,
                        creds.password,
                        targetPemakaianId,
                        fallbackRejected
                    );

                    if (fallbackRejected.length > 0) {
                        await processRejectedWOLensaItems(fallbackRejected, 'detail-service');
                    }

                    if (fallbackHeader?.pemakaian_id) {
                        currentHeaderMeta = fallbackHeader;
                        currentPemakaianId = fallbackHeader.pemakaian_id;

                        if (isRejectedWONumber(fallbackHeader.wo_number)) {
                            return {
                                detail: undefined,
                                headerMetadata: currentHeaderMeta,
                                resolvedPemakaianId: currentPemakaianId,
                                creds,
                            };
                        }

                        try {
                            const fallbackDetails = await scrapeWOLensaDetails(
                                [
                                    {
                                        id: header?.id ? Number(header.id) : 0,
                                        pemakaian_id: currentPemakaianId,
                                        type: fallbackHeader.type || 'assurance',
                                    },
                                ],
                                creds.username,
                                creds.password
                            );
                            if (fallbackDetails[0]) {
                                currentDetail = fallbackDetails[0];
                            }
                        } catch (fallbackDetailErr) {
                            actionLogger.error(
                                `[scrapeSingleWODetailService] Fallback detail scrape failed for ${currentPemakaianId}:`,
                                fallbackDetailErr instanceof Error
                                    ? fallbackDetailErr
                                    : new Error(String(fallbackDetailErr))
                            );
                        }
                    }
                }

                if (!currentPemakaianId && !currentDetail) {
                    throw new Error(
                        `Data WO '${cleanInput}' tidak ditemukan pada akun Lensa ${creds.username} (${creds.source}).`
                    );
                }

                return {
                    detail: currentDetail,
                    headerMetadata: currentHeaderMeta,
                    resolvedPemakaianId: currentPemakaianId,
                    creds,
                };
            },
            'WO-Detail-Manual'
        );

        const detail = scrapeOutcome.detail;
        headerMetadata = scrapeOutcome.headerMetadata;
        resolvedPemakaianId = scrapeOutcome.resolvedPemakaianId;

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
                const extraQuery =
                    isNumeric && header?.wo_number ? header.wo_number : cleanInput;
                const extraRejected: RejectedWOLensaItem[] = [];
                let extraHeader = await searchSingleWOLensaHeader(
                    extraQuery,
                    scrapeOutcome.creds.username,
                    scrapeOutcome.creds.password,
                    resolvedPemakaianId,
                    extraRejected
                );
                if (extraRejected.length > 0) {
                    await processRejectedWOLensaItems(extraRejected, 'detail-service');
                }
                if (!extraHeader && cleanInput !== extraQuery) {
                    extraHeader = await searchSingleWOLensaHeader(
                        cleanInput,
                        scrapeOutcome.creds.username,
                        scrapeOutcome.creds.password,
                        resolvedPemakaianId,
                        extraRejected
                    );
                    if (extraRejected.length > 0) {
                        await processRejectedWOLensaItems(extraRejected, 'detail-service');
                    }
                }
                if (
                    extraHeader &&
                    (!isRejectedWONumber(extraHeader.wo_number) || !headerMetadata?.wo_number)
                ) {
                    headerMetadata = {
                        ...headerMetadata,
                        ...extraHeader,
                    };
                }
            } catch {
                // Abaikan jika pencarian header metadata tambahan gagal, tetap simpan detail
            }
        }

        // 3. Validasi ketat REJECTED: jangan simpan WO berstatus REJECTED ke dalam database MTMS
        const finalWoNumber = headerMetadata?.wo_number || header?.wo_number || cleanInput;
        if (isRejectedWONumber(finalWoNumber)) {
            actionLogger.warn(
                `[scrapeSingleWODetailService] Menolak WO berstatus REJECTED: '${finalWoNumber}' (Pemakaian ID: ${resolvedPemakaianId})`
            );

            // Jika pemakaian sempat tercatat di MTMS (dan mungkin direkon), lakukan rollback secara otomatis
            if (resolvedPemakaianId) {
                await handleRejectedWOPemakaian({
                    pemakaianId: String(resolvedPemakaianId),
                    woNumber: finalWoNumber,
                    actor: sessionNik,
                });
            } else if (header?.id) {
                await db
                    .deleteFrom('inventory.wo_lensa_list')
                    .where('header_id', '=', header.id)
                    .execute();
                await db
                    .deleteFrom('inventory.wo_lensa_header')
                    .where('id', '=', header.id)
                    .execute();
            }

            return {
                success: false,
                error: `Nomor WO '${finalWoNumber}' berstatus REJECTED di sistem Lensa dan tidak diperkenankan untuk discrape ke dalam referensi MTMS.`,
            };
        }

        const rawMaterials: LensaDetailMaterial[] = detail?.materials || [];

        // Ingest ke staging dan proses via Database-Centric ELT (Opsi A)
        const singlePayload = [
            {
                pemakaian_id: resolvedPemakaianId,
                wo_number: headerMetadata?.wo_number ?? header?.wo_number ?? null,
                nama_gudang: headerMetadata?.nama_gudang ?? header?.nama_gudang ?? null,
                nik_pemakai: headerMetadata?.nik_pemakai ?? header?.nik_pemakai ?? null,
                gi_number: headerMetadata?.gi_number ?? header?.gi_number ?? null,
                formatted_date: headerMetadata?.formatted_date
                    ? toISODateString(headerMetadata.formatted_date)
                    : header?.formatted_date
                      ? toISODateString(header.formatted_date)
                      : null,
                tanggal_update: headerMetadata?.tanggal_update ?? header?.tanggal_update ?? null,
                type: headerMetadata?.type ?? (header as { type?: string | null })?.type ?? null,
                wbs: headerMetadata?.wbs ?? header?.wbs ?? null,
                items: rawMaterials,
            },
        ];

        const batchId = crypto.randomUUID();
        await lensaEltRepository.insertWOLensaStagingBatch(batchId, singlePayload, 'manual');
        await lensaEltRepository.processWOLensaStaging(batchId);
        await lensaEltRepository.refreshLensaMaterializedViewsSafe();

        // Ambil data terbaru dari database
        const updatedHeader = await db
            .selectFrom('inventory.wo_lensa_header')
            .selectAll()
            .where(sql<boolean>`CAST(pemakaian_id AS VARCHAR) = ${String(resolvedPemakaianId)}`)
            .executeTakeFirst();

        const savedItems = updatedHeader
            ? await db
                  .selectFrom('inventory.wo_lensa_list')
                  .selectAll()
                  .where('header_id', '=', updatedHeader.id)
                  .execute()
            : [];

        const mappedMaterials: ScrapedWODetailMaterial[] = savedItems.map((item) => ({
            material_id: item.material_id,
            material_desc: item.material_desc,
            uom: item.uom,
            qty_pemakaian: item.qty_pemakaian != null ? Number(item.qty_pemakaian) : null,
        }));

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
