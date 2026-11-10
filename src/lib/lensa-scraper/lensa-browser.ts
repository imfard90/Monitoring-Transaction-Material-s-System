import { parse } from 'date-fns';
import { type Browser, type BrowserServer, chromium, type Page } from 'playwright';
import { actionLogger } from '@/lib/logger';
import {
    WORKER_BROWSER_KEY,
    WORKER_BROWSER_TTL_SECONDS,
    type WorkerBrowserSnapshot,
} from '@/lib/workers/worker-client';
import { redis } from '../redis';

let globalBrowser: Browser | null = null;
let globalServer: BrowserServer | null = null;
let browserLastLaunched = 0;
let launchPromise: Promise<Browser> | null = null;

// Active operations / leases counter to prevent closing browser during running processes
let activeOperationsCount = 0;
let idleCloseTimer: NodeJS.Timeout | null = null;

// Idle timeout before automatically closing Chromium after all tasks finish (2 minutes)
const BROWSER_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

// Refresh browser every 30 min to prevent memory bloat from accumulated state.
// Contexts are closed per-scrape; this reaps the underlying Chromium process.
const BROWSER_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Maximum number of browser contexts allowed to stay open simultaneously.
 *
 * Playwright contexts are the unit that leaks: every `setupContext()` call opens
 * one, and a scrape that throws before its `finally { context.close() }` (or a
 * context whose close is rejected) leaves it behind. Chromium spawns a process
 * group per context, so a handful of leaked contexts turns into dozens of
 * headless Chrome processes.
 */
const MAX_OPEN_CONTEXTS = 10;

/**
 * Recursively terminates a process and all its descendants (Zygote, renderers, utilities).
 * Prevents orphan grandchildren processes from leaking in Linux/Unix environments.
 */
export async function killProcessTree(rootPid: number): Promise<void> {
    if (!rootPid || rootPid <= 0) return;
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
        try {
            process.kill(rootPid, 'SIGKILL');
        } catch {
            // ignore if already exited
        }
        return;
    }

    try {
        const { exec } = await import('node:child_process');
        // Recursive shell function to kill all descendant child PIDs first, then the root
        const script = `
            reap_children() {
                local parent=$1
                local children=$(pgrep -P "$parent" 2>/dev/null)
                for child in $children; do
                    reap_children "$child"
                    kill -9 "$child" 2>/dev/null || true
                done
            }
            reap_children ${rootPid}
            kill -9 ${rootPid} 2>/dev/null || true
        `;
        exec(script, () => {});
    } catch {
        try {
            process.kill(rootPid, 'SIGKILL');
        } catch {
            // ignore
        }
    }
}

/**
 * Tracks an active scraping operation lease. Cancels any scheduled idle shutdown.
 */
export function acquireBrowserLease(): void {
    activeOperationsCount++;
    if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
        actionLogger.info('[BROWSER] Operasi baru masuk, idle auto-close timer dibatalkan.');
    }
}

/**
 * Releases an active scraping operation lease. If no operations remain active,
 * schedules an idle auto-close after BROWSER_IDLE_TIMEOUT_MS.
 */
export function releaseBrowserLease(): void {
    activeOperationsCount = Math.max(0, activeOperationsCount - 1);
    if (activeOperationsCount === 0 && globalBrowser?.isConnected()) {
        scheduleIdleClose();
    }
}

/**
 * Returns current count of active scraping operations using the browser.
 */
export function getActiveOperationsCount(): number {
    return activeOperationsCount;
}

function scheduleIdleClose(): void {
    if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
    }
    idleCloseTimer = setTimeout(async () => {
        if (activeOperationsCount === 0 && (globalBrowser?.isConnected() || globalServer)) {
            actionLogger.info(
                `[BROWSER] Browser idle selama ${BROWSER_IDLE_TIMEOUT_MS / 1000} detik tanpa aktivitas. Menutup browser secara otomatis.`
            );
            await closeBrowser(true).catch(() => {});
        }
    }, BROWSER_IDLE_TIMEOUT_MS);

    // Don't keep event loop alive if only this idle timer is remaining
    if (idleCloseTimer && typeof idleCloseTimer.unref === 'function') {
        idleCloseTimer.unref();
    }
}

/**
 * Publishes the browser snapshot to Redis so the web process can report it.
 *
 * The browser only lives inside the `mtms-worker` process, so `mtms-web` cannot
 * inspect it in-process. The snapshot has a short TTL: if the worker dies, the
 * key expires on its own instead of leaving a stale "healthy" reading behind.
 *
 * Exported so the worker can refresh it on its heartbeat; otherwise the key
 * would expire during idle gaps between scrapes.
 */
export const publishBrowserSnapshot = async () => {
    if (!globalBrowser) {
        await redis.del(WORKER_BROWSER_KEY).catch(() => {});
        return;
    }
    const snapshot: WorkerBrowserSnapshot = {
        pid: globalServer?.process()?.pid ?? null,
        contexts: globalBrowser.contexts().length,
        connected: globalBrowser.isConnected(),
        updatedAt: Date.now(),
    };
    await redis
        .set(WORKER_BROWSER_KEY, JSON.stringify(snapshot), 'EX', WORKER_BROWSER_TTL_SECONDS)
        .catch((err: unknown) => {
            actionLogger.warn('[BROWSER] Gagal publish snapshot browser ke Redis:', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
};

export async function closeBrowser(force = false) {
    if (!force && activeOperationsCount > 0) {
        actionLogger.info(
            `[BROWSER] closeBrowser ditangguhkan karena masih ada ${activeOperationsCount} operasi aktif berjalan.`
        );
        return;
    }

    if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }

    const pid = globalServer?.process()?.pid ?? null;
    if (globalBrowser) {
        await globalBrowser.close().catch(() => {});
        globalBrowser = null;
    }
    if (globalServer) {
        // `server.kill()` terminates the Chromium process tree, including any
        // renderer/zygote children that outlived their context.
        await globalServer.kill().catch(() => {});
        globalServer = null;
    }

    // On Linux/Unix, ensure any remaining child processes of Chromium (including Zygote & renderers) are reaped
    if (typeof pid === 'number' && pid > 0) {
        await killProcessTree(pid);
    }

    browserLastLaunched = 0;
    await redis.del(WORKER_BROWSER_KEY).catch(() => {});
    actionLogger.info(`[BROWSER] Browser ditutup (pid=${pid ?? 'unknown'}).`);
}

export async function getBrowserInstance(): Promise<Browser> {
    const now = Date.now();
    const isStale = browserLastLaunched > 0 && now - browserLastLaunched > BROWSER_MAX_AGE_MS;
    const needsReconnect = !globalBrowser?.isConnected() || isStale;

    if (!needsReconnect && globalBrowser) {
        return globalBrowser;
    }

    // Anti-race condition: if a browser launch is already in-flight, await the same promise
    if (launchPromise) {
        return launchPromise;
    }

    launchPromise = (async () => {
        try {
            await closeBrowser(true);
            // `launchServer` (not `launch`) because only the server handle exposes the
            // spawned Chromium PID. The PID is required to reap the process tree on
            // shutdown — without it we would need a broad `pkill`, which would also
            // kill Chromium instances owned by other services on the same host.
            globalServer = await chromium.launchServer({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-background-networking',
                    '--disable-extensions',
                    '--disable-sync',
                    '--metrics-recording-only',
                    // Prevent Chromium from spawning a crash-handler / breakpad child
                    // process that survives the browser and shows up as an orphan.
                    '--disable-crash-reporter',
                    '--disable-breakpad',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--renderer-process-limit=4',
                ],
            });
            globalBrowser = await chromium.connect(globalServer.wsEndpoint());
            browserLastLaunched = Date.now();
            actionLogger.info(
                `[BROWSER] Chromium baru dijalankan (pid=${globalServer.process()?.pid ?? 'unknown'}).`
            );

            if (idleCloseTimer) {
                clearTimeout(idleCloseTimer);
                idleCloseTimer = null;
            }

            await publishBrowserSnapshot();
            return globalBrowser;
        } finally {
            launchPromise = null;
        }
    })();

    const browser = await launchPromise;
    if (!browser) {
        throw new Error('Gagal menjalankan browser Chromium untuk scraping Lensa.');
    }

    // Leak detection: force-close contexts that outlived their scrape.
    const contexts = browser.contexts();
    if (contexts.length > MAX_OPEN_CONTEXTS) {
        actionLogger.warn(
            `[BROWSER-LEAK] ${contexts.length} contexts open (max ${MAX_OPEN_CONTEXTS}). Menutup yang tertinggal.`
        );
        await Promise.allSettled(contexts.slice(0, -5).map((ctx) => ctx.close()));
    }

    return browser;
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
        pid: globalServer?.process()?.pid ?? null,
        contexts: globalBrowser?.contexts().length ?? 0,
        activeOperations: activeOperationsCount,
        stale:
            browserLastLaunched > 0 ? Date.now() - browserLastLaunched > BROWSER_MAX_AGE_MS : true,
    };
}

import { parseLensaDate } from './lensa-wo-helpers';
export { parseLensaDate };

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
    acquireBrowserLease();
    let leaseReleased = false;
    const releaseOnce = () => {
        if (!leaseReleased) {
            leaseReleased = true;
            releaseBrowserLease();
        }
    };

    try {
        const browser = await getBrowserInstance();
        const context = await browser.newContext();

        // Hook context.close to automatically release the operation lease
        const originalClose = context.close.bind(context);
        context.close = async () => {
            try {
                await originalClose();
            } finally {
                releaseOnce();
            }
        };

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
                } else if (page.isClosed()) {
                    activePage = await context.newPage();
                    shouldCloseActivePage = true;
                } else {
                    activePage = page;
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
            try {
                await performLogin(page);
            } catch (loginErr) {
                await redis.del(sessionKey).catch(() => {});
                await context.close().catch(() => {});
                throw loginErr;
            }
        }

        return { context, page, safeGoto, sessionKey, performLogin };
    } catch (err) {
        releaseOnce();
        throw err;
    }
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
