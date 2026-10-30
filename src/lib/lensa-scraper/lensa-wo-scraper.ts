import { format } from 'date-fns';
import { actionLogger } from '@/lib/logger';
import { redis } from '../redis';
import { parseBapbPdfBuffer } from './bapb-pdf-parser';
import {
    asyncPool,
    fetchPageJSON,
    LENSA_URL,
    type LensaPage,
    type LensaPerformLogin,
    type LensaSafeGoto,
    parseLensaDate,
    setupContext,
} from './lensa-browser';

export interface WOLensaHeader {
    pemakaian_id: string;
    gi_number: string | null;
    nama_gudang: string | null;
    nik_pemakai: string | null;
    tanggal_update: string | null;
    formatted_date: string | null;
    type: string | null;
    wbs: string | null;
    wo_number: string | null;
}

// Cutoff: CUTOFF_MONTH env (YYYY-MM) atau default bulan berjalan.
const CUTOFF_MONTH_RAW = process.env.CUTOFF_MONTH || format(new Date(), 'yyyy-MM');
const CUTOFF_MONTH_MATCH = /^(\d{4})-(\d{2})$/.exec(CUTOFF_MONTH_RAW);
if (!CUTOFF_MONTH_MATCH) {
    throw new Error(
        `CUTOFF_MONTH="${CUTOFF_MONTH_RAW}" invalid. Expected format: YYYY-MM (e.g. 2026-10)`
    );
}
const CUTOFF_YEAR = parseInt(CUTOFF_MONTH_MATCH[1], 10);
const CUTOFF_MONTH = parseInt(CUTOFF_MONTH_MATCH[2], 10);
const CUTOFF_DATE = new Date(CUTOFF_YEAR, CUTOFF_MONTH - 1, 1);

const MAX_PAGES_DEFAULT = 50;
const MAX_PAGES_PREFIX = 50;
const CONSECUTIVE_STOP_THRESHOLD = 2;

function isWithinCutoff(dateStr: string | null | undefined): boolean {
    const d = parseLensaDate(dateStr);
    if (!d) return false;
    return d >= CUTOFF_DATE;
}

function isBeforeCutoff(dateStr: string | null | undefined): boolean {
    const d = parseLensaDate(dateStr);
    if (!d) return true;
    return d < CUTOFF_DATE;
}

function allBeforeCutoff(items: Array<Record<string, unknown>>): boolean {
    if (items.length === 0) return true;
    return items.every((item) => isBeforeCutoff(item.tanggal_update?.toString() || null));
}

function processItems(
    items: Array<Record<string, unknown>>,
    seenIds: Set<string>,
    results: WOLensaHeader[]
): { found: number; added: number; filtered: number } {
    let found = 0;
    let added = 0;
    let filtered = 0;

    for (const item of items) {
        const pemakaianId = String(item.pemakaian_id ?? '');
        if (!pemakaianId || pemakaianId === 'undefined') continue;

        const rawDate = item.tanggal_update?.toString() || null;
        found++;

        if (!isWithinCutoff(rawDate)) {
            filtered++;
            continue;
        }

        if (seenIds.has(pemakaianId)) continue;
        seenIds.add(pemakaianId);
        added++;

        const parsedDate = parseLensaDate(rawDate);
        results.push({
            pemakaian_id: pemakaianId,
            gi_number: item.gi_number?.toString() || null,
            nama_gudang: item.nama_gudang?.toString() || null,
            nik_pemakai: item.nik_pemakai?.toString() || null,
            tanggal_update: rawDate,
            formatted_date: parsedDate ? format(parsedDate, 'yyyy-MM-dd') : null,
            type: item.type?.toString() || null,
            wbs: item.wbs?.toString() || null,
            wo_number: item.wo_number?.toString() || null,
        });
    }

    return { found, added, filtered };
}

async function scrapeDefaultEndpoint(
    page: LensaPage,
    performLogin: LensaPerformLogin,
    safeGoto: LensaSafeGoto,
    perpage: number,
    seenIds: Set<string>,
    results: WOLensaHeader[]
): Promise<void> {
    const url1 = `${LENSA_URL}/teknisi/wo-data?page=1&perpage=${perpage}&search=&orderBy=gi_number&orderDirection=desc`;
    actionLogger.info('  [Default] Fetching page 1 (adaptive multi-page)...');
    const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

    const items1 = resp1?.data || [];
    const lastPage = resp1?.pagination?.last_page ?? 1;
    let pagesFetched = 1;

    const stats1 = processItems(items1, seenIds, results);
    actionLogger.info(
        `   [Default] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (cutoff=${format(CUTOFF_DATE, 'yyyy-MM-dd')})`
    );

    let consecutiveBelowCutoff = allBeforeCutoff(items1) ? 1 : 0;
    const maxPages = Math.min(lastPage, MAX_PAGES_DEFAULT);

    for (let p = 2; p <= maxPages; p++) {
        if (consecutiveBelowCutoff >= CONSECUTIVE_STOP_THRESHOLD) break;

        const url = `${LENSA_URL}/teknisi/wo-data?page=${p}&perpage=${perpage}&search=&orderBy=gi_number&orderDirection=desc`;
        const resp = await fetchPageJSON(page, url, performLogin, safeGoto);
        const items = resp?.data || [];
        pagesFetched++;

        processItems(items, seenIds, results);

        if (allBeforeCutoff(items)) {
            consecutiveBelowCutoff++;
        } else {
            consecutiveBelowCutoff = 0;
        }

        if (items.length === 0) break;
    }

    actionLogger.info(
        `  [Default] Done pages=${pagesFetched}/${lastPage} (cap ${MAX_PAGES_DEFAULT})`
    );
}

export function getWOPrefixes(cutoffDate: Date = CUTOFF_DATE): string[] {
    const yyMM = format(cutoffDate, 'yyMM');
    return ['INC', 'SC', `DGPS${yyMM}`, `FMC${yyMM}`, 'PDA'];
}

async function scrapePrefixEndpoint(
    page: LensaPage,
    performLogin: LensaPerformLogin,
    safeGoto: LensaSafeGoto,
    perpage: number,
    prefix: string,
    seenIds: Set<string>,
    results: WOLensaHeader[]
): Promise<void> {
    const url1 = `${LENSA_URL}/teknisi/wo-data?page=1&perpage=${perpage}&search=${prefix}&orderBy=tanggal_update&orderDirection=asc`;
    actionLogger.info(`  [${prefix}] Fetching page 1...`);
    const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

    const items1 = resp1?.data || [];
    const lastPage = resp1?.pagination?.last_page ?? 1;
    let pagesFetched = 1;

    const stats1 = processItems(items1, seenIds, results);
    actionLogger.info(
        `   [${prefix}] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (cutoff=${format(CUTOFF_DATE, 'yyyy-MM-dd')})`
    );

    const maxPages = Math.min(lastPage, MAX_PAGES_PREFIX);

    for (let p = 2; p <= maxPages; p++) {
        const url = `${LENSA_URL}/teknisi/wo-data?page=${p}&perpage=${perpage}&search=${prefix}&orderBy=tanggal_update&orderDirection=asc`;
        const resp = await fetchPageJSON(page, url, performLogin, safeGoto);
        const items = resp?.data || [];
        pagesFetched++;

        processItems(items, seenIds, results);

        if (items.length === 0) break;
    }

    actionLogger.info(
        `  [${prefix}] Done pages=${pagesFetched}/${lastPage} (cap ${MAX_PAGES_PREFIX})`
    );
}

/**
 * Scrape WO Lensa headers untuk SATU akun PIC.
 *
 * Strategi (v3 adaptive cutoff):
 *   1) Default endpoint: sort by gi_number desc, adaptive multi-page
 *      (stop jika N halaman berturut-turut semua < cutoff, cap 50).
 *   2) Prefix INC: sort by tanggal_update asc, loop sampai last_page atau cap 50.
 *   3) Prefix SC: sama seperti INC.
 *   4) Prefix DGPSyyMM: pola DGPS diikuti 2 digit tahun dan 2 digit bulan berjalan (misal DGPS2610).
 *   5) Prefix FMCyyMM: pola FMC diikuti 2 digit tahun dan 2 digit bulan berjalan (misal FMC2610).
 *   6) Prefix PDA: sama seperti INC/SC.
 */
export async function scrapeWOLensaHeaders(
    existingPemakaianIds: string[],
    customUsername?: string,
    customPassword?: string,
    perpage: number = 100,
    _fullLoop: boolean = false
): Promise<WOLensaHeader[]> {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password) throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set');

    const { context, page, safeGoto, performLogin } = await setupContext(username, password);

    try {
        const newHeaders: WOLensaHeader[] = [];
        const seenIds = new Set<string>(existingPemakaianIds);

        await scrapeDefaultEndpoint(page, performLogin, safeGoto, perpage, seenIds, newHeaders);

        for (const prefix of getWOPrefixes(CUTOFF_DATE)) {
            await scrapePrefixEndpoint(
                page,
                performLogin,
                safeGoto,
                perpage,
                prefix,
                seenIds,
                newHeaders
            );
        }

        return newHeaders;
    } catch (error) {
        actionLogger.error(
            'WO Header sync error:',
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    } finally {
        await context.close();
    }
}

/**
 * Scrape detail material WO Lensa Ref per gudang (Phase 2):
 * - Menggunakan micro-pool 2 tab concurrent di dalam BrowserContext gudang.
 * - Tab di-reuse/dibuat ringan per item tanpa overhead login ulang.
 * - Tetap menyertakan fallback ke dokumen BAPB PDF jika tabel HTML kosong/gagal.
 */
export async function scrapeWOLensaDetails(
    headersToSync: { id: number; pemakaian_id: string; type?: string | null }[],
    customUsername?: string,
    customPassword?: string,
    concurrency: number = 2
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password)
        throw new Error('Akun Lensa tidak ditemukan. Silakan hubungkan akun Lensa Anda di profil.');

    const {
        context,
        page: authPage,
        performLogin,
        sessionKey,
    } = await setupContext(username, password);

    // Pastikan context terautentikasi
    if (authPage.url().includes('login')) {
        await performLogin(authPage);
    }
    await authPage.close().catch(() => {});

    const tryBapbPdfFallback = async (header: {
        id: number;
        pemakaian_id: string;
        type?: string | null;
    }) => {
        try {
            const candidateTypes = [header.type || 'assurance'];
            if (!candidateTypes.includes('assurance')) candidateTypes.push('assurance');
            if (!candidateTypes.includes('provisioning')) candidateTypes.push('provisioning');

            for (const docType of candidateTypes) {
                const bapbUrl = `${LENSA_URL}/pemakaian/document-bapb/${header.pemakaian_id}/${docType}`;
                actionLogger.info(
                    `Attempting fallback to BAPB PDF for WO ${header.pemakaian_id}: ${bapbUrl}`
                );
                const pdfResp = await context.request.get(bapbUrl);
                if (pdfResp.ok()) {
                    const pdfBuf = await pdfResp.body();
                    if (pdfBuf.length > 4 && pdfBuf.subarray(0, 5).toString('ascii') === '%PDF-') {
                        const parsed = parseBapbPdfBuffer(pdfBuf);
                        if (parsed.materials.length > 0) {
                            actionLogger.info(
                                `Successfully extracted ${parsed.materials.length} materials from BAPB PDF for WO ${header.pemakaian_id}`
                            );
                            return parsed.materials.map((m) => ({
                                'ID MATERIAL': m['ID MATERIAL'],
                                'NAMA MATERIAL': m['NAMA MATERIAL'],
                                SATUAN: m.SATUAN,
                                'QTY PEMAKAIAN': m['QTY PEMAKAIAN'],
                            }));
                        }
                    }
                }
            }
        } catch (pdfErr) {
            actionLogger.warn(`BAPB PDF fallback failed for pemakaian_id ${header.pemakaian_id}`, {
                error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
            });
        }
        return [];
    };

    try {
        const results = await asyncPool(concurrency, headersToSync, async (header) => {
            const page = await context.newPage();
            try {
                let materials: Record<string, string>[] = [];
                const detailUrl = `${LENSA_URL}/teknisi/detail-wo/${header.pemakaian_id}`;

                let htmlScrapeFailed = false;
                try {
                    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    if (page.url().includes('login')) {
                        await redis.del(sessionKey);
                        await performLogin(page);
                        await page.goto(detailUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 30000,
                        });
                        if (page.url().includes('login')) {
                            throw new Error(
                                'Sesi terputus saat scrap detail WO walau sudah relogin'
                            );
                        }
                    }

                    // Tunggu baris data tabel muncul atau indikator data kosong (mencegah silent empty array)
                    await Promise.race([
                        page.waitForSelector('table tbody tr td', {
                            state: 'attached',
                            timeout: 12000,
                        }),
                        page.waitForSelector(
                            '.dataTables_empty, .empty-state, text=/tidak ada data|no data/i',
                            { timeout: 12000 }
                        ),
                    ]).catch(() => null);

                    const tablesData = await page.$$eval('table', (tables) => {
                        return tables.map((tableEl) => {
                            const rows = Array.from(tableEl.querySelectorAll('tr'));
                            if (rows.length === 0) return { type: 'unknown', data: [] };
                            const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                                (th) => th.textContent?.trim() || ''
                            );
                            let type = 'unknown';
                            if (
                                headers.includes('ID MATERIAL') ||
                                headers.includes('NAMA MATERIAL')
                            ) {
                                type = 'materials';
                            }
                            const data = rows
                                .slice(1)
                                .filter((row) => !row.classList.contains('dataTables_empty'))
                                .map((row) => {
                                    const cells = Array.from(row.querySelectorAll('td')).map(
                                        (td) => td.textContent?.trim() || ''
                                    );
                                    const obj: Record<string, string> = {};
                                    headers.forEach((h, i) => {
                                        if (h) obj[h] = cells[i] || '';
                                    });
                                    return obj;
                                });
                            return { type, data };
                        });
                    });

                    materials = tablesData.find((t) => t.type === 'materials')?.data || [];
                } catch (_err) {
                    htmlScrapeFailed = true;
                }

                // If HTML table did not yield materials (e.g. 500 error or page failure), fallback to BAPB PDF
                if (materials.length === 0 || htmlScrapeFailed) {
                    const fallbackMaterials = await tryBapbPdfFallback(header);
                    if (fallbackMaterials.length > 0) {
                        materials = fallbackMaterials;
                    }
                }

                return {
                    header_id: header.id,
                    pemakaian_id: header.pemakaian_id,
                    materials,
                };
            } catch (err) {
                actionLogger.error(
                    `Failed to scrape detail for pemakaian_id ${header.pemakaian_id}:`,
                    err instanceof Error ? err : new Error(String(err))
                );
                return {
                    header_id: header.id,
                    pemakaian_id: header.pemakaian_id,
                    materials: [],
                };
            } finally {
                await page.close().catch(() => {});
            }
        });

        return results;
    } catch (error) {
        actionLogger.error(
            'WO Lensa Detail sync error:',
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    } finally {
        await context.close();
    }
}
