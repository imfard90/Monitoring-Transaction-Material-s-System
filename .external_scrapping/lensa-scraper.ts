import { type Cookie, chromium } from 'playwright';
import { redis } from '../src/lib/redis';

const LENSA_URL = 'https://lensa-inventory.telkomakses.co.id';
const REDIS_SESSION_KEY = 'lensa_session:user';
const SESSION_TTL = 60 * 60 * 2; // 2 hours

export async function scrapeReservation(
    reservationId: string,
    customUsername?: string,
    customPassword?: string
) {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;

    if (!username || !password) {
        throw new Error('LENSA_USERNAME or LENSA_PASSWORD is not set in .env or User Profile');
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    try {
        // Try to load cookies from Redis
        const cachedCookies = await redis.get(REDIS_SESSION_KEY);
        let isAuthenticated = false;

        if (cachedCookies) {
            const cookies: Cookie[] = JSON.parse(cachedCookies);
            await context.addCookies(cookies);
            isAuthenticated = true;
        }

        const page = await context.newPage();

        // Helper function for resilient navigation to handle ERR_CONNECTION_RESET
        const safeGoto = async (url: string, retries = 2) => {
            for (let i = 0; i <= retries; i++) {
                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    return;
                } catch (error: any) {
                    if (i === retries) throw error;
                    console.warn(
                        `Nav to ${url} failed, retrying... (${i + 1}/${retries})`,
                        error.message
                    );
                    await page.waitForTimeout(2000);
                }
            }
        };

        if (!isAuthenticated) {
            // Login flow
            await safeGoto(`${LENSA_URL}/login`);

            // Adjust selectors based on actual Lensa login page
            await page.fill('input[type="text"], input[name="username"]', username);
            await page.fill('input[type="password"], input[name="password"]', password);
            await page.click('button[type="submit"]');

            // Wait for navigation or successful login indicator
            await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => null);

            // Check if login failed by verifying the URL
            if (page.url().includes('login')) {
                throw new Error(
                    'Gagal login ke sistem Lensa. Silakan periksa username dan password di .env.'
                );
            }

            // Extract cookies and save to Redis
            const freshCookies = await context.cookies();
            await redis.set(REDIS_SESSION_KEY, JSON.stringify(freshCookies), 'EX', SESSION_TTL);
        }

        // 1. Fetch Reservation List
        const listUrl = `${LENSA_URL}/resevation_list_data?page=1&perpage=10&search=${reservationId}&orderBy=reservation_id&orderDirection=asc`;
        await safeGoto(listUrl);

        // Check if session was invalid/expired (server redirected us back to login)
        if (page.url().includes('login')) {
            await redis.del(REDIS_SESSION_KEY); // Clear invalid cached session
            throw new Error(
                'Sesi Lensa tidak valid atau telah kadaluarsa. Sistem akan mencoba login ulang pada request berikutnya. Silakan coba lagi.'
            );
        }
        const listContent = await page.evaluate(() => {
            return document.body.innerText || document.body.textContent;
        });

        // Try to parse if it's JSON
        let listData = listContent;
        try {
            listData = JSON.parse(listContent || '{}');
        } catch (_e) {
            // keep as string if not JSON
        }

        // 2. Fetch Reservation Detail
        const detailUrl = `${LENSA_URL}/reservation/detail/${reservationId}`;
        await safeGoto(detailUrl);

        // Extract structured detail from the page using isolated evaluations
        const tablesData = await page.$$eval('table', (tables) => {
            return tables.map((tableEl) => {
                const rows = Array.from(tableEl.querySelectorAll('tr'));
                if (rows.length === 0) return { type: 'unknown', data: [] };

                const headers = Array.from(rows[0].querySelectorAll('th, td')).map(
                    (th) => th.textContent?.trim() || ''
                );

                let type = 'unknown';
                if (headers.includes('ID MATERIAL')) type = 'materials';
                else if (headers.includes('Created Date')) type = 'history';

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
        const historyApproval = tablesData.find((t) => t.type === 'history')?.data || [];

        // Extract Header info by analyzing full text on Node side
        const fullText = await page.evaluate(() => document.body.innerText || '');
        const lines = fullText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        const getLineAfter = (label: string) => {
            const idx = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
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
                if (knownLabels.some((k) => k.toLowerCase() === nextLine.toLowerCase())) {
                    return null; // Field is empty
                }
                return nextLine;
            }
            return null;
        };

        const detailContent = {
            headerInfo: {
                requester: getLineAfter('Requester'),
                tanggalTarget: getLineAfter('Tanggal Target Penerimaan'),
                gudang: getLineAfter('Gudang'),
                projectId: getLineAfter('Project ID'),
                mitra: getLineAfter('Mitra'),
                nikPemakai: getLineAfter('NIK Pemakai'),
                statusReservasi: getLineAfter('Status Reservasi'),
            },
            materials,
            historyApproval,
        };

        return {
            reservationId,
            listData,
            detailContent,
            success: true,
        };
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}
