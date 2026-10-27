import { parse } from 'date-fns';
import { type Browser, chromium, type Page } from 'playwright';
import { actionLogger } from '@/lib/logger';
import { redis } from '../redis';

let globalBrowser: Browser | null = null;
let browserLastLaunched = 0;

// Refresh browser every 30 min to prevent memory bloat from accumulated state.
// Contexts are closed per-scrape; this reaps the underlying Chromium process.
const BROWSER_MAX_AGE_MS = 30 * 60 * 1000;

export async function closeBrowser() {
    if (globalBrowser) {
        await globalBrowser.close().catch(() => {});
        globalBrowser = null;
        browserLastLaunched = 0;
    }
}

export async function getBrowserInstance(): Promise<Browser> {
    const now = Date.now();
    const isStale = browserLastLaunched > 0 && now - browserLastLaunched > BROWSER_MAX_AGE_MS;
    const needsReconnect = !globalBrowser?.isConnected() || isStale;

    if (needsReconnect) {
        await closeBrowser();
        globalBrowser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        browserLastLaunched = now;
    }
    return globalBrowser!;
}

// Graceful shutdown — Chromium headless process is reaped on SIGTERM/SIGINT.
process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
});
process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
});

/**
 * Internal — returns browser health snapshot for health-check endpoints.
 * Safe to expose via GET handler (read-only, no mutation).
 */
export function getLensaBrowserHealth() {
    return {
        connected: globalBrowser?.isConnected() ?? false,
        launchedAt: browserLastLaunched || null,
        stale:
            browserLastLaunched > 0 ? Date.now() - browserLastLaunched > BROWSER_MAX_AGE_MS : true,
    };
}

export function parseLensaDate(dateStr: string | null | undefined): Date | null {
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
export function parseOutLensaDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    try {
        const datePart = dateStr.split(' ')[0];
        const isoParsed = parse(datePart, 'yyyy-MM-dd', new Date());
        if (!Number.isNaN(isoParsed.getTime())) return isoParsed;
        return parseLensaDate(dateStr);
    } catch (_e) {
        return null;
    }
}

export const LENSA_URL = (process.env.LENSA_URL || '').replace(/\/+$/, '');
const SESSION_TTL = 60 * 60 * 2;
const MAX_RETRIES = 3;

// Mutex in-memory untuk mencegah session stampede (multiple concurrent login form submissions)
const loginLocks = new Map<string, Promise<void>>();

export type LensaPage = Page;
export type LensaPerformLogin = (targetPage?: Page) => Promise<void>;
export type LensaSafeGoto = (url: string) => Promise<void>;

export interface LensaResponse {
    status?: boolean;
    data?: Array<Record<string, unknown>>;
    pagination?: { current_page?: number; last_page?: number; per_page?: number; total?: number };
}

export async function setupContext(username: string, password: string) {
    const browser = await getBrowserInstance();
    const context = await browser.newContext();
    const sessionKey = `lensa_session:${username}`;
    const cachedCookies = await redis.get(sessionKey);
    let isAuthenticated = false;

    if (cachedCookies) {
        try {
            const cookies = JSON.parse(cachedCookies);
            await context.addCookies(cookies);
            isAuthenticated = true;
        } catch (_parseErr) {
            isAuthenticated = false;
        }
    }

    const page = await context.newPage();

    const safeGoto = async (url: string, retries = 2) => {
        for (let i = 0; i <= retries; i++) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                return;
            } catch (error: unknown) {
                if (i === retries) throw error;
                actionLogger.info(`Nav to ${url} failed, retrying... (${i + 1}/${retries})`, {
                    error: error instanceof Error ? error.message : String(error),
                });
                await page.waitForTimeout(1000 * (i + 1));
            }
        }
    };

    const performLogin: LensaPerformLogin = async (targetPage?: Page) => {
        // Cek apakah login untuk username ini sedang berjalan oleh worker lain
        const activeLock = loginLocks.get(username);
        if (activeLock) {
            try {
                await activeLock;
                const freshCookies = await redis.get(sessionKey);
                if (freshCookies) {
                    await context.addCookies(JSON.parse(freshCookies));
                    return;
                }
            } catch (_lockErr) {
                // Jika login sebelumnya gagal, coba lagi secara mandiri
            }
        }

        const executeLogin = (async () => {
            let activePage: Page;
            let shouldCloseActivePage = false;

            // Prioritaskan targetPage jika aktif, lalu page context awal, atau buat page baru sementara jika sudah tertutup
            if (targetPage && !targetPage.isClosed()) {
                activePage = targetPage;
            } else if (!page.isClosed()) {
                activePage = page;
            } else {
                activePage = await context.newPage();
                shouldCloseActivePage = true;
            }

            try {
                await activePage.goto(`${LENSA_URL}/login`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });
                await activePage
                    .waitForSelector('input[type="text"], input[name="username"]', {
                        timeout: 15000,
                    })
                    .catch(() => null);
                await activePage.fill('input[type="text"], input[name="username"]', username);
                await activePage.fill('input[type="password"], input[name="password"]', password);
                await activePage.click('button[type="submit"]');
                await activePage.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => null);

                if (activePage.url().includes('login')) {
                    throw new Error(
                        'Gagal login ke sistem Lensa (masih tertahan di halaman login).'
                    );
                }

                const freshCookies = await context.cookies();
                await redis.set(sessionKey, JSON.stringify(freshCookies), 'EX', SESSION_TTL);
            } finally {
                if (shouldCloseActivePage) {
                    await activePage.close().catch(() => {});
                }
                loginLocks.delete(username);
            }
        })();

        loginLocks.set(username, executeLogin);
        await executeLogin;
    };

    if (!isAuthenticated) {
        await performLogin(page);
    }

    return { context, page, safeGoto, sessionKey, performLogin };
}

/**
 * Concurrency Limiter Pool (Async Pool)
 */
export async function asyncPool<T, R>(
    poolLimit: number,
    array: T[],
    iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
    const ret: Promise<R>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: Promise<void> = p.then(() => {
                executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

export async function fetchPageJSON(
    page: LensaPage,
    url: string,
    performLogin: LensaPerformLogin,
    safeGoto: LensaSafeGoto
): Promise<LensaResponse> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Eksekusi cepat melalui context.request (APIRequestContext)
            // Memanfaatkan session cookies yang sudah tersimpan tanpa overhead parsing DOM & CSS
            const resp = await page.request.get(url, {
                headers: {
                    Accept: 'application/json, text/plain, */*',
                },
                timeout: 30000,
            });

            const status = resp.status();
            const text = await resp.text();

            // Deteksi redirect ke halaman login atau sesi habis
            const isLoginRedirect =
                status === 401 ||
                status === 403 ||
                text.includes('name="username"') ||
                (text.includes('<html') && text.includes('login'));

            if (isLoginRedirect) {
                actionLogger.warn(
                    `[fetchPageJSON] Sesi expired terdeteksi pada ${url} (status: ${status}), relogin ulang...`
                );
                await performLogin(page);
                await page.waitForTimeout(1000 * attempt);
                continue;
            }

            if (!resp.ok()) {
                throw new Error(`HTTP ${status}: ${text.slice(0, 150)}`);
            }

            try {
                const parsed = JSON.parse(text || '{}') as LensaResponse;
                const itemCount = parsed?.data?.length ?? 0;
                const lastPage = parsed?.pagination?.last_page ?? '?';
                actionLogger.info(
                    `   [fetchPageJSON] OK data=${itemCount} last_page=${lastPage} url=${url.slice(-90)}`
                );
                return parsed;
            } catch (jsonErr) {
                throw new Error(
                    `JSON.parse error: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`
                );
            }
        } catch (err) {
            actionLogger.info(
                `[fetchPageJSON] Request error attempt ${attempt}/${MAX_RETRIES} for ${url}: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );

            // Pada attempt terakhir, jika APIRequestContext gagal, coba fallback navigasi browser penuh
            if (attempt === MAX_RETRIES) {
                try {
                    actionLogger.info(`[fetchPageJSON] Fallback ke safeGoto untuk ${url}`);
                    await safeGoto(url);

                    if (page.url().includes('login')) {
                        await performLogin(page);
                        await safeGoto(url);
                    }

                    const body = await page.evaluate(
                        () => document.body.innerText || document.body.textContent || ''
                    );
                    const parsed = JSON.parse(body || '{}') as LensaResponse;
                    return parsed;
                } catch (fallbackErr) {
                    actionLogger.error(
                        `Max retries (${MAX_RETRIES}) reached for ${url}. — ${
                            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
                        }`
                    );
                    return {};
                }
            }

            await page.waitForTimeout(1000 * attempt);
        }
    }
    return {};
}
