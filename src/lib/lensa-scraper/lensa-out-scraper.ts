import { format } from 'date-fns';
import { actionLogger } from '@/lib/logger';
import { redis } from '../redis';
import {
    asyncPool,
    fetchPageJSON,
    LENSA_URL,
    parseOutLensaDate,
    setupContext,
} from './lensa-browser';

export interface OutLensaHeader {
    reservation_id: string;
    tgl_entry: string | null;
    formatted_date: string | null;
    nama_gudang: string | null;
    regional: string | null;
    project_id: string | null;
    nik_pemakai: string | null;
    reservation_id_sap: string | null;
    gi_number: string | null;
    status_proses: string | null;
}

const OUT_MAX_PAGES = 50;
const OUT_STOP_ON_EMPTY = 2; // berhenti setelah N halaman kosong berturut-turut

/**
 * Proses item dari endpoint resevation_list_data.
 * Hanya ambil data dengan status_proses === 'done' dan memiliki gi_number,
 * dan belum ada di seenIds. Update seenIds supaya dedupe antar halaman.
 */
function processOutItems(
    items: Array<Record<string, unknown>>,
    seenIds: Set<string>,
    results: OutLensaHeader[]
): { found: number; added: number; filtered: number } {
    let found = 0;
    let added = 0;
    let filtered = 0;

    for (const item of items) {
        const resId = String(item.reservation_id ?? '');
        if (!resId || resId === 'undefined') continue;

        found++;

        if (!item.gi_number) {
            filtered++;
            continue;
        }

        const statusProses = item.status_proses?.toString().toLowerCase() || '';
        if (statusProses !== 'done') {
            filtered++;
            continue;
        }

        if (seenIds.has(resId)) {
            filtered++;
            continue;
        }
        seenIds.add(resId);
        added++;

        const rawTglEntry = item.tgl_entry?.toString() || null;
        const parsedTglEntry = parseOutLensaDate(rawTglEntry);
        results.push({
            reservation_id: resId,
            tgl_entry: rawTglEntry,
            formatted_date: parsedTglEntry ? format(parsedTglEntry, 'yyyy-MM-dd') : null,
            nama_gudang: item.nama_gudang?.toString() || null,
            regional: item.regional?.toString() || null,
            project_id: item.project_id?.toString() || null,
            nik_pemakai: item.nik_pemakai?.toString() || null,
            reservation_id_sap: item.reservation_id_sap?.toString() || null,
            gi_number: item.gi_number?.toString() || null,
            status_proses: item.status_proses?.toString() || null,
        });
    }

    return { found, added, filtered };
}

export async function scrapeLensaHeaders(
    existingHeaderIds: string[],
    customUsername?: string,
    customPassword?: string,
    perpage: number = 20
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password) throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set');

    const { context, page, safeGoto, performLogin } = await setupContext(
        username,
        password
    );

    try {
        const newHeaders: OutLensaHeader[] = [];
        const seenIds = new Set<string>(existingHeaderIds);

        // Halaman 1: juga membaca metadata pagination
        const url1 = `${LENSA_URL}/resevation_list_data?page=1&perpage=${perpage}&search=&orderBy=reservation_id&orderDirection=desc`;
        actionLogger.info(`[OUT][${username}] Fetching page 1...`);
        const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

        const items1 = resp1?.data || [];
        const lastPage = resp1?.pagination?.last_page ?? 1;
        const stats1 = processOutItems(items1, seenIds, newHeaders);
        actionLogger.info(
            `[OUT][${username}] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (last_page=${lastPage})`
        );

        const maxPages = Math.min(lastPage, OUT_MAX_PAGES);
        let pagesFetched = 1;
        let consecutiveEmpty = items1.length === 0 ? 1 : 0;

        // Halaman berikutnya
        for (let p = 2; p <= maxPages; p++) {
            if (consecutiveEmpty >= OUT_STOP_ON_EMPTY) {
                actionLogger.info(
                    `[OUT][${username}] Stop early: ${consecutiveEmpty} empty pages in a row.`
                );
                break;
            }

            const url = `${LENSA_URL}/resevation_list_data?page=${p}&perpage=${perpage}&search=&orderBy=reservation_id&orderDirection=desc`;
            const resp = await fetchPageJSON(page, url, performLogin, safeGoto);
            const items = resp?.data || [];
            pagesFetched++;

            const stats = processOutItems(items, seenIds, newHeaders);
            actionLogger.info(
                `[OUT][${username}] page ${p}: items=${items.length} found=${stats.found} added=${stats.added} filtered=${stats.filtered}`
            );

            if (items.length === 0) {
                consecutiveEmpty++;
            } else {
                consecutiveEmpty = 0;
            }
        }

        actionLogger.info(
            `[OUT][${username}] Done pages=${pagesFetched}/${lastPage} (cap ${OUT_MAX_PAGES}) → new headers=${newHeaders.length}`
        );

        return newHeaders;
    } catch (error) {
        actionLogger.error(
            `[OUT][${username}] Header sync error:`,
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    } finally {
        await context.close();
    }
}

/**
 * Scrape detail material Out Lensa Ref per gudang (Phase 2):
 * - Menggunakan micro-pool 2 tab concurrent di dalam BrowserContext gudang.
 * - Tab di-reuse/dibuat ringan per item tanpa overhead login ulang.
 */
export async function scrapeLensaDetails(
    headersToScrape: { id: number; reservation_id: string }[],
    customUsername?: string,
    customPassword?: string,
    concurrency: number = 2
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password) throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set');

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

    try {
        const results = await asyncPool(concurrency, headersToScrape, async (header) => {
            const page = await context.newPage();
            try {
                const resId = header.reservation_id;
                const detailUrl = `${LENSA_URL}/reservation/detail/${resId}`;
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                if (page.url().includes('login')) {
                    await redis.del(sessionKey);
                    await performLogin(page);
                    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    if (page.url().includes('login')) {
                        throw new Error('Sesi terputus saat scrap detail walau sudah relogin');
                    }
                }

                // Tunggu baris data tabel muncul atau indikator data kosong (mencegah silent empty array)
                await Promise.race([
                    page.waitForSelector('table tbody tr td', { state: 'attached', timeout: 12000 }),
                    page.waitForSelector('.dataTables_empty, .empty-state, text=/tidak ada data|no data/i', { timeout: 12000 }),
                ]).catch(() => null);

                const tablesData = await page.$$eval('table', (tables) => {
                    return tables.map((tableEl) => {
                        const rows = Array.from(tableEl.querySelectorAll('tr'));
                        if (rows.length === 0) return { type: 'unknown', data: [] };
                        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                            (th) => th.textContent?.trim() || ''
                        );
                        let type = 'unknown';
                        if (headers.includes('ID MATERIAL')) type = 'materials';
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

                const materials = tablesData.find((t) => t.type === 'materials')?.data || [];

                // Ekstraksi Mitra: Utamakan pencocokan elemen DOM terstruktur, lalu fallback ke baris teks
                const parsedMitra = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('.info-row, tr, .row, dl, div'));
                    for (const el of elements) {
                        const text = el.textContent || '';
                        const match = text.match(/Mitra\s*[:\t]\s*([^\n\r]+)/i);
                        if (match && match[1]?.trim()) {
                            const val = match[1].trim();
                            if (!/^(tanggal|gudang|project|nik|status)/i.test(val)) {
                                return val;
                            }
                        }
                    }
                    const fullText = document.body.innerText || '';
                    const lines = fullText
                        .split('\n')
                        .map((l: string) => l.trim())
                        .filter((l: string) => l.length > 0);
                    const idx = lines.findIndex(
                        (l: string) => l.toLowerCase() === 'mitra'
                    );
                    if (idx !== -1 && idx + 1 < lines.length) {
                        const nextLine = lines[idx + 1];
                        const knownLabels = [
                            'Tanggal Target Penerimaan',
                            'Gudang',
                            'Project ID',
                            'Mitra',
                            'NIK Pemakai',
                            'Status Reservasi',
                            'Position',
                            'Detail Material',
                        ];
                        if (knownLabels.some((k) => k.toLowerCase() === nextLine.toLowerCase()))
                            return null;
                        return nextLine;
                    }
                    return null;
                });

                return {
                    header_id: header.id,
                    reservation_id: resId,
                    mitra: parsedMitra,
                    materials,
                };
            } catch (err) {
                actionLogger.error(
                    `Failed to scrape detail for reservation_id ${header.reservation_id}:`,
                    err instanceof Error ? err : new Error(String(err))
                );
                return {
                    header_id: header.id,
                    reservation_id: header.reservation_id,
                    mitra: null,
                    materials: [],
                };
            } finally {
                await page.close().catch(() => {});
            }
        });

        return results;
    } catch (error) {
        actionLogger.error(
            'Detail sync error:',
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    } finally {
        await context.close();
    }
}

export async function scrapeReservation(
    id: string,
    customUsername?: string,
    customPassword?: string
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password)
        throw new Error('Akun Lensa tidak ditemukan. Silakan hubungkan akun Lensa Anda di profil.');

    const { context, page, safeGoto, sessionKey, performLogin } = await setupContext(
        username,
        password
    );

    try {
        const listUrl = `${LENSA_URL}/resevation_list_data?page=1&perpage=50&search=${id}&orderBy=reservation_id&orderDirection=desc`;
        const listData = await fetchPageJSON(page, listUrl, performLogin, safeGoto);

        const item = (listData?.data as Array<Record<string, unknown>>)?.[0];
        if (!item) {
            return { listData: { data: [] }, detailContent: null };
        }

        const detailUrl = `${LENSA_URL}/reservation/detail/${id}`;
        await safeGoto(detailUrl);

        if (page.url().includes('login')) {
            await performLogin(page);
            await safeGoto(detailUrl);
            if (page.url().includes('login')) {
                await redis.del(sessionKey);
                throw new Error('Sesi terputus saat scrap detail');
            }
        }

        await Promise.race([
            page.waitForSelector('table tbody tr td', { state: 'attached', timeout: 12000 }),
            page.waitForSelector('.dataTables_empty, .empty-state, text=/tidak ada data|no data/i', { timeout: 12000 }),
        ]).catch(() => null);

        const tablesData = await page.$$eval('table', (tables) => {
            return tables.map((tableEl) => {
                const rows = Array.from(tableEl.querySelectorAll('tr'));
                if (rows.length === 0) return { type: 'unknown', data: [] };
                const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                    (th) => th.textContent?.trim() || ''
                );
                let type = 'unknown';
                if (headers.includes('ID MATERIAL')) type = 'materials';
                const data = rows
                    .slice(1)
                    .filter((row) => !row.classList.contains('dataTables_empty'))
                    .map((row) => {
                        const cells = Array.from(row.querySelectorAll('td')).map(
                            (td) => td.textContent?.trim() || ''
                        );
                        const obj: Record<string, string> = {};
                        headers.forEach((header, i) => {
                            if (header) obj[header] = cells[i] || '';
                        });
                        return obj;
                    });
                return { type, data };
            });
        });

        const materials = tablesData.find((t) => t.type === 'materials')?.data || [];

        const metaInfo = await page.evaluate(() => {
            const extractLabel = (targetLabel: string) => {
                const elements = Array.from(document.querySelectorAll('.info-row, tr, .row, dl, div'));
                for (const el of elements) {
                    const text = el.textContent || '';
                    const match = text.match(new RegExp(`${targetLabel}\\s*[:\t]\\s*([^\\n\\r]+)`, 'i'));
                    if (match && match[1]?.trim()) {
                        const val = match[1].trim();
                        if (!/^(tanggal|gudang|project|nik|status)/i.test(val) || targetLabel.toLowerCase() === 'nik pemakai') {
                            return val;
                        }
                    }
                }
                const fullText = document.body.innerText || '';
                const lines = fullText
                    .split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l.length > 0);
                const idx = lines.findIndex((l: string) => l.toLowerCase() === targetLabel.toLowerCase());
                if (idx !== -1 && idx + 1 < lines.length) {
                    const nextLine = lines[idx + 1];
                    const knownLabels = [
                        'Tanggal Target Penerimaan',
                        'Gudang',
                        'Project ID',
                        'Mitra',
                        'NIK Pemakai',
                        'Status Reservasi',
                        'Position',
                        'Detail Material',
                    ];
                    if (knownLabels.some((k) => k.toLowerCase() === nextLine.toLowerCase()))
                        return null;
                    return nextLine;
                }
                return null;
            };

            return {
                nikPemakai: extractLabel('NIK Pemakai'),
                mitra: extractLabel('Mitra'),
            };
        });

        return {
            listData,
            detailContent: {
                materials,
                headerInfo: metaInfo,
            },
        };
    } finally {
        await context.close();
    }
}
