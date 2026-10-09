import { format, isAfter, isEqual, parse } from 'date-fns';
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

const LENSA_URL = process.env.LENSA_URL; //'https://lensa-inventory.telkomakses.co.id';
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
        const listUrl = `${LENSA_URL}/resevation_list_data?page=1&perpage=${perpage}&search=&orderBy=reservation_id&orderDirection=desc`;
        await safeGoto(listUrl);

        if (page.url().includes('login')) {
            // Sesi mungkin expired, coba relogin
            await performLogin();
            await safeGoto(listUrl);

            if (page.url().includes('login')) {
                await redis.del(sessionKey);
                throw new Error(
                    'Sesi Lensa tidak valid atau telah kadaluarsa walau sudah relogin.'
                );
            }
        }

        const listContent = await page.evaluate(
            () => document.body.innerText || document.body.textContent
        );
        let listData: Record<string, unknown> = {};
        try {
            listData = JSON.parse(listContent || '{}');
        } catch (_e) {}

        const items = (listData?.data as Array<Record<string, unknown>>) || [];
        const newHeaders = [];

        for (const item of items) {
            const resId = String(item.reservation_id);
            const statusProses = item.status_proses?.toString().toLowerCase() || '';

            if (!resId) continue;

            // 1. Filter: data hasil scaping yang tidak ada 'gi_number' tidak di ambil
            if (!item.gi_number) continue;

            // Filter: Hanya ambil data yang statusnya 'done'
            if (statusProses !== 'done') continue;

            // 2. data scraping header di cocokan dengan database, jika sudah ada di drop
            if (existingHeaderIds.includes(resId)) continue;

            newHeaders.push({
                reservation_id: resId,
                tgl_entry: item.tgl_entry?.toString() || null,
                nama_gudang: item.nama_gudang?.toString() || null,
                regional: item.regional?.toString() || null,
                project_id: item.project_id?.toString() || null,
                nik_pemakai: item.nik_pemakai?.toString() || null,
                reservation_id_sap: item.reservation_id_sap?.toString() || null,
                gi_number: item.gi_number?.toString() || null,
                status_proses: item.status_proses?.toString() || null,
            });
        }

        return newHeaders;
    } catch (error) {
        console.error('Header sync error:', error);
        throw error;
    } finally {
        await context.close();
    }
}

export async function scrapeWOLensaHeaders(
    existingPemakaianIds: string[],
    customUsername?: string,
    customPassword?: string,
    perpage: number = 100,
    fullLoop: boolean = false
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password) throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set');

    const { context, page, safeGoto, performLogin } = await setupContext(username, password);

    try {
        const newHeaders: any[] = [];
        const seenPemakaianIds = new Set<string>(existingPemakaianIds);
        const cutoffDate = new Date('2026-10-01');

        const fetchAndProcess = async (url: string, maxRetries = 3) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await safeGoto(url);

                    if (page.url().includes('login')) {
                        await performLogin();
                        await safeGoto(url);
                        if (page.url().includes('login')) {
                            throw new Error('Sesi terputus atau login gagal');
                        }
                    }

                    const listContent = await page.evaluate(
                        () => document.body.innerText || document.body.textContent
                    );
                    let listData: Record<string, unknown> = {};
                    try {
                        listData = JSON.parse(listContent || '{}');
                    } catch (_e) {
                        throw new Error('Failed to parse JSON response');
                    }

                    const items = (listData?.data as Array<Record<string, unknown>>) || [];
                    let foundItems = 0;

                    for (const item of items) {
                        const pemakaianId = String(item.pemakaian_id);
                        if (!pemakaianId || pemakaianId === 'undefined') continue;

                        const rawDate = item.tanggal_update?.toString() || null;
                        const parsedDate = parseLensaDate(rawDate);
                        const formattedDate = parsedDate ? format(parsedDate, 'yyyy-MM-dd') : null;

                        if (
                            !parsedDate ||
                            (!isAfter(parsedDate, cutoffDate) && !isEqual(parsedDate, cutoffDate))
                        ) {
                            continue;
                        }

                        foundItems++;

                        if (seenPemakaianIds.has(pemakaianId)) continue;
                        seenPemakaianIds.add(pemakaianId);

                        newHeaders.push({
                            pemakaian_id: pemakaianId,
                            gi_number: item.gi_number?.toString() || null,
                            nama_gudang: item.nama_gudang?.toString() || null,
                            nik_pemakai: item.nik_pemakai?.toString() || null,
                            tanggal_update: rawDate,
                            formatted_date: formattedDate,
                            type: item.type?.toString() || null,
                            wbs: item.wbs?.toString() || null,
                            wo_number: item.wo_number?.toString() || null,
                        });
                    }
                    return foundItems > 0; // Return true if we found items to process
                } catch (_error) {
                    if (attempt === maxRetries) {
                        console.error(`Max retries reached for ${url}. Giving up.`);
                        return false;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
            return false;
        };

        // Step 1: Run original query
        const originalUrl = `${LENSA_URL}/teknisi/wo-data?page=1&perpage=${perpage}&search=&orderBy=gi_number&orderDirection=desc`;
        await fetchAndProcess(originalUrl);

        // Step 2: Run prefix loop if requested
        if (fullLoop) {
            const prefixes = ['SC', 'INC', 'LP', 'WO', 'FMC'];
            const maxPages = 100; // Safe high limit, will break when empty

            for (const prefix of prefixes) {
                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                    const prefixUrl = `${LENSA_URL}/teknisi/wo-data?page=${pageNum}&perpage=${perpage}&search=${prefix}&orderBy=tanggal_update&orderDirection=desc`;
                    const hasItems = await fetchAndProcess(prefixUrl);
                    if (!hasItems) {
                        break;
                    }
                }
            }
        }

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
