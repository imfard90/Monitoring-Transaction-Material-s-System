import { format, parse } from 'date-fns';
import { type Browser, chromium } from 'playwright';
import { redis } from '../src/lib/redis';

let globalBrowser: Browser | null = null;

async function getBrowserInstance() {
    if (!globalBrowser?.isConnected()) {
        globalBrowser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
    }
    return globalBrowser;
}

function parseLensaDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    try {
        const parsed = parse(dateStr.split(' ')[0], 'dd/MM/yyyy', new Date());
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    } catch (_e) {
        return null;
    }
}

/**
 * Parser tanggal untuk OUT Lensa.
 * Endpoint OUT mengirim tgl_entry dalam format "yyyy-MM-dd" (opsional bagian waktu),
 * berbeda dari WO yang memakai "dd/MM/yyyy".
 * Fallback ke parseLensaDate() jika format ternyata dd/MM/yyyy.
 */
function parseOutLensaDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    try {
        const datePart = dateStr.split(' ')[0];
        // Coba yyyy-MM-dd (format yang diamati dari endpoint OUT)
        const isoParsed = parse(datePart, 'yyyy-MM-dd', new Date());
        if (!Number.isNaN(isoParsed.getTime())) return isoParsed;
        // Fallback ke dd/MM/yyyy (sama seperti WO)
        return parseLensaDate(dateStr);
    } catch (_e) {
        return null;
    }
}

const LENSA_URL = (process.env.LENSA_URL || '').replace(/\/+$/, ''); //'https://lensa-inventory.telkomakses.co.id';
const SESSION_TTL = 60 * 60 * 2;

export async function setupContext(username: string, password: string) {
    const browser = await getBrowserInstance();
    const context = await browser.newContext();
    const sessionKey = `lensa_session:${username}`;
    const cachedCookies = await redis.get(sessionKey);
    let isAuthenticated = false;

    if (cachedCookies) {
        const cookies = JSON.parse(cachedCookies);
        await context.addCookies(cookies);
        isAuthenticated = true;
    }

    const page = await context.newPage();

    const safeGoto = async (url: string, retries = 2) => {
        for (let i = 0; i <= retries; i++) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                return;
            } catch (error: unknown) {
                if (i === retries) throw error;
                console.warn(
                    `Nav to ${url} failed, retrying... (${i + 1}/${retries})`,
                    error instanceof Error ? error.message : String(error)
                );
                await page.waitForTimeout(2000);
            }
        }
    };

    const performLogin = async () => {
        await safeGoto(`${LENSA_URL}/login`);
        await page.fill('input[type="text"], input[name="username"]', username);
        await page.fill('input[type="password"], input[name="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => null);

        if (page.url().includes('login')) {
            throw new Error('Gagal login ke sistem Lensa.');
        }

        const freshCookies = await context.cookies();
        await redis.set(sessionKey, JSON.stringify(freshCookies), 'EX', SESSION_TTL);
    };

    if (!isAuthenticated) {
        await performLogin();
    }

    return { context, page, safeGoto, sessionKey, performLogin };
}

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

    const { context, page, safeGoto, sessionKey, performLogin } = await setupContext(
        username,
        password
    );

    try {
        const newHeaders: OutLensaHeader[] = [];
        const seenIds = new Set<string>(existingHeaderIds);

        // Halaman 1: juga membaca metadata pagination
        const url1 = `${LENSA_URL}/resevation_list_data?page=1&perpage=${perpage}&search=&orderBy=reservation_id&orderDirection=desc`;
        console.warn(`[OUT][${username}] Fetching page 1...`);
        const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

        const items1 = resp1?.data || [];
        const lastPage = resp1?.pagination?.last_page ?? 1;
        const stats1 = processOutItems(items1, seenIds, newHeaders);
        console.warn(
            `[OUT][${username}] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (last_page=${lastPage})`
        );

        const maxPages = Math.min(lastPage, OUT_MAX_PAGES);
        let pagesFetched = 1;
        let consecutiveEmpty = items1.length === 0 ? 1 : 0;

        // Halaman berikutnya
        for (let p = 2; p <= maxPages; p++) {
            if (consecutiveEmpty >= OUT_STOP_ON_EMPTY) {
                console.warn(
                    `[OUT][${username}] Stop early: ${consecutiveEmpty} empty pages in a row.`
                );
                break;
            }

            const url = `${LENSA_URL}/resevation_list_data?page=${p}&perpage=${perpage}&search=&orderBy=reservation_id&orderDirection=desc`;
            const resp = await fetchPageJSON(page, url, performLogin, safeGoto);
            const items = resp?.data || [];
            pagesFetched++;

            const stats = processOutItems(items, seenIds, newHeaders);
            console.warn(
                `[OUT][${username}] page ${p}: items=${items.length} found=${stats.found} added=${stats.added} filtered=${stats.filtered}`
            );

            if (items.length === 0) {
                consecutiveEmpty++;
            } else {
                consecutiveEmpty = 0;
            }
        }

        console.warn(
            `[OUT][${username}] Done pages=${pagesFetched}/${lastPage} (cap ${OUT_MAX_PAGES}) → new headers=${newHeaders.length}`
        );

        return newHeaders;
    } catch (error) {
        console.error(`[OUT][${username}] Header sync error:`, error);
        throw error;
    } finally {
        await context.close();
    }
}

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

interface LensaResponse {
    status?: boolean;
    data?: Array<Record<string, unknown>>;
    pagination?: { current_page?: number; last_page?: number; per_page?: number; total?: number };
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

const MAX_RETRIES = 3;
const MAX_PAGES_DEFAULT = 50;
const MAX_PAGES_PREFIX = 50;
const CONSECUTIVE_STOP_THRESHOLD = 2;

type LensaPage = Awaited<ReturnType<typeof setupContext>>['page'];
type LensaPerformLogin = () => Promise<void>;
type LensaSafeGoto = (url: string) => Promise<void>;

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

async function fetchPageJSON(
    page: LensaPage,
    url: string,
    performLogin: LensaPerformLogin,
    safeGoto: LensaSafeGoto
): Promise<LensaResponse> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await safeGoto(url);

            if (page.url().includes('login')) {
                await performLogin();
                await safeGoto(url);
                if (page.url().includes('login')) {
                    throw new Error('Sesi tidak valid walau sudah relogin.');
                }
            }

            const body = await page.evaluate(
                () => document.body.innerText || document.body.textContent || ''
            );
            try {
                const parsed = JSON.parse(body || '{}') as LensaResponse;
                const itemCount = parsed?.data?.length ?? 0;
                const lastPage = parsed?.pagination?.last_page ?? '?';
                console.warn(
                    `   [fetchPageJSON] OK data=${itemCount} last_page=${lastPage} url=${url.slice(-90)}`
                );
                return parsed;
            } catch (_e) {
                console.warn(
                    `   [fetchPageJSON] JSON.parse FAILED — bodyLen=${body.length} bodyPreview="${body.slice(0, 200)}"`
                );
                return {};
            }
        } catch (err) {
            if (attempt === MAX_RETRIES) {
                console.error(
                    `Max retries (${MAX_RETRIES}) reached for ${url}. — ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
                throw err;
            }
            console.warn(`Retry ${attempt}/${MAX_RETRIES} for ${url}...`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    return {};
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
    console.warn('  [Default] Fetching page 1 (adaptive multi-page)...');
    const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

    const items1 = resp1?.data || [];
    const lastPage = resp1?.pagination?.last_page ?? 1;
    let pagesFetched = 1;

    const stats1 = processItems(items1, seenIds, results);
 console.warn(`   [Default] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (cutoff=${format(CUTOFF_DATE, 'yyyy-MM-dd')})`);

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

    console.warn(`  [Default] Done pages=${pagesFetched}/${lastPage} (cap ${MAX_PAGES_DEFAULT})`);
}

async function scrapePrefixEndpoint(
    page: LensaPage,
    performLogin: LensaPerformLogin,
    safeGoto: LensaSafeGoto,
    perpage: number,
    prefix: 'INC' | 'SC',
    seenIds: Set<string>,
    results: WOLensaHeader[]
): Promise<void> {
    const url1 = `${LENSA_URL}/teknisi/wo-data?page=1&perpage=${perpage}&search=${prefix}&orderBy=tanggal_update&orderDirection=asc`;
    console.warn(`  [${prefix}] Fetching page 1...`);
    const resp1 = await fetchPageJSON(page, url1, performLogin, safeGoto);

    const items1 = resp1?.data || [];
    const lastPage = resp1?.pagination?.last_page ?? 1;
    let pagesFetched = 1;

    const stats1 = processItems(items1, seenIds, results);
 console.warn(`   [${prefix}] page 1: items=${items1.length} found=${stats1.found} added=${stats1.added} filtered=${stats1.filtered} (cutoff=${format(CUTOFF_DATE, 'yyyy-MM-dd')})`);

 const maxPages = Math.min(lastPage, MAX_PAGES_PREFIX);

    for (let p = 2; p <= maxPages; p++) {
        const url = `${LENSA_URL}/teknisi/wo-data?page=${p}&perpage=${perpage}&search=${prefix}&orderBy=tanggal_update&orderDirection=asc`;
        const resp = await fetchPageJSON(page, url, performLogin, safeGoto);
        const items = resp?.data || [];
        pagesFetched++;

        processItems(items, seenIds, results);

        if (items.length === 0) break;
    }

    console.warn(`  [${prefix}] Done pages=${pagesFetched}/${lastPage} (cap ${MAX_PAGES_PREFIX})`);
}

/**
 * Scrape WO Lensa headers untuk SATU akun PIC.
 *
 * Strategi (v3 adaptive cutoff):
 *   1) Default endpoint: sort by gi_number desc, adaptive multi-page
 *      (stop jika N halaman berturut-turut semua < cutoff, cap 50).
 *   2) Prefix INC: sort by tanggal_update asc, loop sampai last_page atau cap 50.
 *   3) Prefix SC: sama seperti INC.
 *
 * Parameter `fullLoop` (legacy) diabaikan — hanya INC/SC yang diproses,
 * LP/WO/FMC tidak lagi di-scrape sesuai keputusan.
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
        await scrapePrefixEndpoint(
            page,
            performLogin,
            safeGoto,
            perpage,
            'INC',
            seenIds,
            newHeaders
        );
        await scrapePrefixEndpoint(
            page,
            performLogin,
            safeGoto,
            perpage,
            'SC',
            seenIds,
            newHeaders
        );

        return newHeaders;
    } catch (error) {
        console.error('WO Header sync error:', error);
        throw error;
    } finally {
        await context.close();
    }
}

export async function scrapeLensaDetails(
    headersToScrape: { id: number; reservation_id: string }[],
    customUsername?: string,
    customPassword?: string
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password) throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set');

    const { context, page, safeGoto, sessionKey, performLogin } = await setupContext(
        username,
        password
    );

    const results = [];

    try {
        for (const header of headersToScrape) {
            try {
                const resId = header.reservation_id;
                const detailUrl = `${LENSA_URL}/reservation/detail/${resId}`;
                await safeGoto(detailUrl);

                if (page.url().includes('login')) {
                    // Sesi mungkin expired, coba relogin
                    await performLogin();
                    await safeGoto(detailUrl);

                    if (page.url().includes('login')) {
                        await redis.del(sessionKey);
                        throw new Error('Sesi terputus saat scrap detail walau sudah relogin');
                    }
                }

                await page.waitForTimeout(3000);

                const tablesData = await page.$$eval('table', (tables) => {
                    return tables.map((tableEl) => {
                        const rows = Array.from(tableEl.querySelectorAll('tr'));
                        if (rows.length === 0) return { type: 'unknown', data: [] };
                        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                            (th) => th.textContent?.trim() || ''
                        );
                        let type = 'unknown';
                        if (headers.includes('ID MATERIAL')) type = 'materials';
                        const data = rows.slice(1).map((row) => {
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

                const fullText = await page.evaluate(() => document.body.innerText || '');
                const lines = fullText
                    .split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l.length > 0);
                const getLineAfter = (label: string) => {
                    const idx = lines.findIndex(
                        (l: string) => l.toLowerCase() === label.toLowerCase()
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
                };
                const parsedMitra = getLineAfter('Mitra');

                results.push({
                    header_id: header.id,
                    reservation_id: resId,
                    mitra: parsedMitra,
                    materials,
                });
            } catch (err) {
                console.error(
                    `Failed to scrape detail for reservation_id ${header.reservation_id}:`,
                    err
                );
            }
        }
        return results;
    } catch (error) {
        console.error('Detail sync error:', error);
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
        await safeGoto(listUrl);

        if (page.url().includes('login')) {
            await performLogin();
            await safeGoto(listUrl);
            if (page.url().includes('login')) {
                await redis.del(sessionKey);
                throw new Error('Sesi Lensa tidak valid.');
            }
        }

        const listContent = await page.evaluate(
            () => document.body.innerText || document.body.textContent
        );
        let listData: Record<string, unknown> = {};
        try {
            listData = JSON.parse(listContent || '{}');
        } catch (_e) {}

        const item = (listData?.data as Array<Record<string, unknown>>)?.[0];
        if (!item) {
            return { listData: { data: [] }, detailContent: null };
        }

        const detailUrl = `${LENSA_URL}/reservation/detail/${id}`;
        await safeGoto(detailUrl);

        if (page.url().includes('login')) {
            await performLogin();
            await safeGoto(detailUrl);
            if (page.url().includes('login')) {
                await redis.del(sessionKey);
                throw new Error('Sesi terputus saat scrap detail');
            }
        }

        await page.waitForTimeout(3000);

        const tablesData = await page.$$eval('table', (tables) => {
            return tables.map((tableEl) => {
                const rows = Array.from(tableEl.querySelectorAll('tr'));
                if (rows.length === 0) return { type: 'unknown', data: [] };
                const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                    (th) => th.textContent?.trim() || ''
                );
                let type = 'unknown';
                if (headers.includes('ID MATERIAL')) type = 'materials';
                const data = rows.slice(1).map((row) => {
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

        const fullText = await page.evaluate(() => document.body.innerText || '');
        const lines = fullText
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0);
        const getLineAfter = (label: string) => {
            const idx = lines.findIndex((l: string) => l.toLowerCase() === label.toLowerCase());
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

        const nikPemakai = getLineAfter('NIK Pemakai');
        const mitra = getLineAfter('Mitra');

        return {
            listData,
            detailContent: {
                materials,
                headerInfo: {
                    nikPemakai,
                    mitra,
                },
            },
        };
    } finally {
        await context.close();
    }
}

export async function scrapeWOLensaDetails(
    headersToSync: { id: number; pemakaian_id: string }[],
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
        const results = [];
        for (const header of headersToSync) {
            try {
                const detailUrl = `${LENSA_URL}/teknisi/detail-wo/${header.pemakaian_id}`;
                await safeGoto(detailUrl);

                if (page.url().includes('login')) {
                    await performLogin();
                    await safeGoto(detailUrl);

                    if (page.url().includes('login')) {
                        await redis.del(sessionKey);
                        throw new Error('Sesi terputus saat scrap detail WO walau sudah relogin');
                    }
                }

                await page.waitForTimeout(3000);

                const tablesData = await page.$$eval('table', (tables) => {
                    return tables.map((tableEl) => {
                        const rows = Array.from(tableEl.querySelectorAll('tr'));
                        if (rows.length === 0) return { type: 'unknown', data: [] };
                        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                            (th) => th.textContent?.trim() || ''
                        );
                        let type = 'unknown';
                        if (headers.includes('ID MATERIAL') || headers.includes('NAMA MATERIAL')) {
                            type = 'materials';
                        }
                        const data = rows.slice(1).map((row) => {
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

                results.push({
                    header_id: header.id,
                    pemakaian_id: header.pemakaian_id,
                    materials,
                });
            } catch (err) {
                console.error(
                    `Failed to scrape detail for pemakaian_id ${header.pemakaian_id}:`,
                    err
                );
            }
        }
        return results;
    } catch (error) {
        console.error('WO Lensa Detail sync error:', error);
        throw error;
    } finally {
        await context.close();
    }
}
