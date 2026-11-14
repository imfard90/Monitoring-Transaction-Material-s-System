import fs from 'node:fs/promises';
import path from 'node:path';
import { type Browser, type BrowserServer, chromium } from 'playwright';
import { kproLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { KPRO_CONFIG } from './kpro-config';
import type { KproCookie } from './kpro-types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const COOKIE_FILE_PATH = path.join(KPRO_CONFIG.tempDir, 'cookies.json');

/**
 * Memastikan seluruh pohon proses Chromium (termasuk Zygote, renderer, crashpad)
 * dimatikan tuntas sampai ke anak-anaknya agar tidak meninggalkan zombie process.
 */
export async function killProcessTree(rootPid: number): Promise<void> {
    if (!rootPid || rootPid <= 0) return;

    if (process.platform !== 'linux' && process.platform !== 'darwin') {
        try {
            process.kill(rootPid, 'SIGKILL');
        } catch {
            // Abaikan jika sudah mati
        }
        return;
    }

    try {
        const { exec } = await import('node:child_process');
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
        // Best effort cleanup
    }
}

/**
 * Menyapu bersih seluruh sisa proses Chromium headless yang mungkin menjadi orphan/zombie.
 */
export async function reapZombieChromiumProcesses(): Promise<void> {
    if (process.platform === 'linux' || process.platform === 'darwin') {
        try {
            const { exec } = await import('node:child_process');
            exec('pkill -f "chrome-headless|ms-playwright.*chrome" 2>/dev/null || true', () => {});
        } catch {}
    }
}

/**
 * Memeriksa apakah server intranet K-PRO dapat dijangkau.
 */
export async function checkIntranetConnection(): Promise<boolean> {
    try {
        const res = await fetch(KPRO_CONFIG.urls.intranetCheck, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(KPRO_CONFIG.timeouts.intranetCheckMs),
        });
        return res.status === 200;
    } catch (err) {
        kproLogger.warn('[KPRO-AUTH] Intranet check failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Mengambil snapshot nilai OTP terakhir tanpa loop (untuk pembanding apakah token sudah berganti).
 */
export async function getLatestOtpSnapshot(): Promise<string | null> {
    try {
        const res = await fetch(`${KPRO_CONFIG.urls.webOtp}?action=getOTP`, {
            method: 'GET',
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
            const otp = (await res.text()).trim();
            if (/^\d{6}$/.test(otp)) {
                return otp;
            }
        }
    } catch {}
    return null;
}

/**
 * Mengambil token 6 digit OTP dari endpoint web Google Apps Script dengan mekanisme polling
 * hingga batas waktu 5 menit (60x percobaan dengan interval 5 detik).
 * Jika diberikan `previousOtp`, fungsi akan menunggu hingga token yang baru tiba dari Telegram.
 */
export async function fetchOtpFromWebService(previousOtp?: string | null): Promise<string> {
    let lastError: Error | null = null;
    const maxAttempts = KPRO_CONFIG.retry.otpMaxPollAttempts;
    const pollIntervalMs = KPRO_CONFIG.retry.otpPollIntervalMs;

    kproLogger.info(
        `[KPRO-AUTH] Starting OTP polling (timeout 5 minutes, previous token: ${previousOtp ?? 'none'})...`
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${KPRO_CONFIG.urls.webOtp}?action=getOTP`, {
                method: 'GET',
                signal: AbortSignal.timeout(20000),
            });

            if (res.ok) {
                const otp = (await res.text()).trim();
                if (/^\d{6}$/.test(otp)) {
                    // Jika token masih sama persis dengan token sebelum login dibuka,
                    // tunggu beberapa detik agar Telegram bot sempat meng-update Google Apps Script.
                    if (previousOtp && otp === previousOtp && attempt <= 20) {
                        kproLogger.info(
                            `[KPRO-AUTH] OTP from web (${otp}) is still previous token. Waiting for fresh token from Telegram (attempt ${attempt}/${maxAttempts})...`
                        );
                    } else {
                        kproLogger.info(
                            `[KPRO-AUTH] Valid fresh OTP captured on attempt ${attempt}: ${otp}`
                        );
                        return otp;
                    }
                } else {
                    lastError = new Error(`Invalid OTP format received: "${otp}"`);
                }
            } else {
                lastError = new Error(`HTTP error ${res.status}: ${res.statusText}`);
            }
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }

        if (attempt < maxAttempts) {
            await sleep(pollIntervalMs);
        }
    }

    throw (
        lastError ||
        new Error('Failed to retrieve valid 6-digit OTP from web service after 5 minutes')
    );
}

/**
 * Memvalidasi apakah cookie sesi K-PRO masih aktif tanpa harus membuka browser.
 */
export async function checkCookiesValidity(cookies: KproCookie[]): Promise<boolean> {
    if (!Array.isArray(cookies) || cookies.length === 0) {
        return false;
    }

    try {
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const res = await fetch(KPRO_CONFIG.urls.dashboard, {
            method: 'GET',
            headers: {
                Cookie: cookieHeader,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
            return false;
        }

        const text = await res.text();
        return text.includes('K-PRO | Dashboard');
    } catch {
        return false;
    }
}

/**
 * Menghapus cache cookie sesi dari Redis dan file fallback saat sesi dinyatakan hangus.
 */
export async function clearCachedCookies(): Promise<void> {
    try {
        await redis.del(KPRO_CONFIG.redisKeys.cookies);
    } catch {}
    try {
        await fs.unlink(COOKIE_FILE_PATH).catch(() => {});
    } catch {}
}

/**
 * Eksekusi satu kali percobaan login Playwright.
 * Timeout navigasi dan elemen disetel ke 5 menit (300,000 ms) sesuai arahan pengguna.
 */
async function performSingleLoginAttempt(): Promise<KproCookie[]> {
    let server: BrowserServer | null = null;
    let browser: Browser | null = null;
    let pid: number | null = null;

    try {
        server = await chromium.launchServer({
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
                '--disable-crash-reporter',
                '--disable-breakpad',
                '--no-first-run',
                '--no-default-browser-check',
                '--renderer-process-limit=2',
            ],
        });

        pid = server.process()?.pid ?? null;
        kproLogger.info(`[KPRO-AUTH] Chromium server started (pid=${pid ?? 'unknown'})`);

        browser = await chromium.connect(server.wsEndpoint());
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const page = await context.newPage();

        // Terapkan batas timeout 5 menit (300.000 ms) pada seluruh aksi halaman
        const timeout5Min = KPRO_CONFIG.timeouts.loginTimeoutMs; // 300000 ms
        page.setDefaultTimeout(timeout5Min);
        page.setDefaultNavigationTimeout(timeout5Min);

        // Ambil snapshot token sebelum halaman login dibuka
        const previousOtp = await getLatestOtpSnapshot();
        kproLogger.info(`[KPRO-AUTH] Snapshot OTP sebelum login: ${previousOtp ?? 'tidak ada'}`);

        kproLogger.info(
            `[KPRO-AUTH] Navigating to login URL: ${KPRO_CONFIG.urls.login} (timeout: 5 menit)...`
        );
        await page.goto(KPRO_CONFIG.urls.login, {
            waitUntil: 'commit',
            timeout: timeout5Min,
        });

        kproLogger.info('[KPRO-AUTH] Waiting for input[name="verifikasi"] (timeout: 5 menit)...');
        const otpInput = page.locator('input[name="verifikasi"]');
        await otpInput.waitFor({ state: 'visible', timeout: timeout5Min });

        // Berikan jeda awal 5 detik agar K-PRO selesai memicu pengiriman OTP ke Telegram
        kproLogger.info(
            '[KPRO-AUTH] Form verifikasi siap. Menunggu 5 detik pengiriman OTP K-PRO...'
        );
        await sleep(5000);

        // Ambil OTP baru via polling (timeout hingga 5 menit)
        const otp = await fetchOtpFromWebService(previousOtp);
        kproLogger.info(`[KPRO-AUTH] Mengisi kode OTP: ${otp} dan menekan tombol verifikasi...`);

        await otpInput.fill(otp);
        await page.locator('button[type="submit"]').click({ noWaitAfter: true });

        // Tunggu hingga berhasil masuk dashboard atau muncul alert error (timeout 5 menit)
        kproLogger.info(
            '[KPRO-AUTH] Menunggu verifikasi sesi masuk ke Dashboard (timeout: 5 menit)...'
        );

        await Promise.race([
            // Kondisi A: Berhasil redirect ke Dashboard
            page.waitForFunction(
                () =>
                    document.title.includes('K-PRO | Dashboard') ||
                    window.location.href.includes('/provi/index'),
                null,
                { timeout: timeout5Min }
            ),
            // Kondisi B: Muncul alert gagal / ditolak
            (async () => {
                await sleep(3000);
                const alertEl = page.locator('div.alert.alert-danger');
                if ((await alertEl.count()) > 0) {
                    const errText = await alertEl.first().innerText();
                    throw new Error(`Login ditolak oleh K-PRO: ${errText.trim()}`);
                }
                // Jika tidak ada alert, tahan agar Promise.race dipimpin oleh kondisi A
                await new Promise(() => {});
            })(),
        ]);

        // Pastikan mendarat di dashboard
        const currentUrl = page.url();
        const currentTitle = await page.title();
        kproLogger.info(
            `[KPRO-AUTH] Berhasil sampai di Dashboard! URL: ${currentUrl}, Title: "${currentTitle}"`
        );

        if (!currentTitle.includes('K-PRO | Dashboard')) {
            await page.goto(KPRO_CONFIG.urls.dashboard, {
                waitUntil: 'commit',
                timeout: timeout5Min,
            });
            await sleep(2000);
        }

        const rawCookies = await context.cookies();
        const cookies: KproCookie[] = rawCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite as KproCookie['sameSite'],
        }));

        if (cookies.length === 0) {
            throw new Error('Login berhasil tetapi tidak ada cookie yang tersimpan');
        }

        kproLogger.info(
            `[KPRO-AUTH] Berhasil mengekstrak ${cookies.length} cookie sesi: ${cookies.map((c) => c.name).join(', ')}`
        );

        return cookies;
    } finally {
        // Pembersihan ketat: pastikan browser, server, dan seluruh pohon proses (zygote) tertutup
        if (browser) {
            await browser.close().catch(() => {});
            browser = null;
        }
        if (server) {
            await server.kill().catch(() => {});
            server = null;
        }
        if (typeof pid === 'number' && pid > 0) {
            await killProcessTree(pid);
        }
        await reapZombieChromiumProcesses();
    }
}

/**
 * Melakukan proses login otomatis ke K-PRO via Playwright dengan mekanisme RETRY hingga maxLoginAttempts.
 */
export async function loginAndGetCookies(): Promise<KproCookie[]> {
    kproLogger.info('[KPRO-AUTH] Starting Playwright login process...');
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= KPRO_CONFIG.retry.maxLoginAttempts; attempt++) {
        try {
            kproLogger.info(
                `[KPRO-AUTH] Login attempt ${attempt}/${KPRO_CONFIG.retry.maxLoginAttempts}...`
            );
            const cookies = await performSingleLoginAttempt();

            kproLogger.info(`[KPRO-AUTH] Login attempt ${attempt} succeeded! Saving cookies.`);

            // Simpan ke Redis cache dan fallback file lokal
            try {
                await redis.set(
                    KPRO_CONFIG.redisKeys.cookies,
                    JSON.stringify(cookies),
                    'EX',
                    KPRO_CONFIG.timeouts.cookieCacheTtlSeconds
                );
            } catch (redisErr) {
                kproLogger.warn('[KPRO-AUTH] Failed to save cookies to Redis', {
                    error: String(redisErr),
                });
            }

            try {
                await fs.mkdir(KPRO_CONFIG.tempDir, { recursive: true });
                await fs.writeFile(COOKIE_FILE_PATH, JSON.stringify(cookies, null, 2), {
                    mode: 0o600,
                });
            } catch (fileErr) {
                kproLogger.warn('[KPRO-AUTH] Failed to save cookies to fallback file', {
                    error: String(fileErr),
                });
            }

            return cookies;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            kproLogger.warn(`[KPRO-AUTH] Login attempt ${attempt} failed: ${lastError.message}`);

            if (attempt < KPRO_CONFIG.retry.maxLoginAttempts) {
                kproLogger.info(
                    `[KPRO-AUTH] Waiting ${KPRO_CONFIG.retry.loginRetryDelayMs}ms before retrying login...`
                );
                await sleep(KPRO_CONFIG.retry.loginRetryDelayMs);
            }
        }
    }

    throw (
        lastError ||
        new Error(`Login failed after ${KPRO_CONFIG.retry.maxLoginAttempts} attempts`)
    );
}

/**
 * Mendapatkan cookie yang masih valid. Jika cookie di cache habis / kedaluwarsa,
 * jalankan Playwright untuk login ulang.
 */
export async function getValidCookies(forceRefresh = false): Promise<KproCookie[]> {
    if (!forceRefresh) {
        // Cek Redis
        try {
            const cached = await redis.get(KPRO_CONFIG.redisKeys.cookies);
            if (cached) {
                const parsed = JSON.parse(cached) as KproCookie[];
                if (await checkCookiesValidity(parsed)) {
                    kproLogger.info('[KPRO-AUTH] Using valid cached session cookies from Redis');
                    return parsed;
                }
            }
        } catch {
            // Redis error handled quietly
        }

        // Cek file lokal fallback
        try {
            const fileData = await fs.readFile(COOKIE_FILE_PATH, 'utf8');
            const parsed = JSON.parse(fileData) as KproCookie[];
            if (await checkCookiesValidity(parsed)) {
                kproLogger.info('[KPRO-AUTH] Using valid cached session cookies from local file');
                return parsed;
            }
        } catch {
            // File not found / invalid, proceed to login
        }

        kproLogger.info('[KPRO-AUTH] No valid cached cookies found, proceeding to login...');
    }

    return loginAndGetCookies();
}
