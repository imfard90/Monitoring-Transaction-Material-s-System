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
 * Mengambil token 6 digit OTP dari endpoint web Google Apps Script dengan mekanisme polling/retry.
 */
export async function fetchOtpFromWebService(): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= KPRO_CONFIG.retry.otpMaxPollAttempts; attempt++) {
        try {
            const res = await fetch(`${KPRO_CONFIG.urls.webOtp}?action=getOTP`, {
                method: 'GET',
                signal: AbortSignal.timeout(KPRO_CONFIG.timeouts.defaultMs),
            });

            if (res.ok) {
                const otp = (await res.text()).trim();
                if (/^\d{6}$/.test(otp)) {
                    return otp;
                }
                lastError = new Error(`Invalid OTP format received: "${otp}"`);
            } else {
                lastError = new Error(`HTTP error ${res.status}: ${res.statusText}`);
            }
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }

        if (attempt < KPRO_CONFIG.retry.otpMaxPollAttempts) {
            kproLogger.info(
                `[KPRO-AUTH] Polling OTP attempt ${attempt}/${KPRO_CONFIG.retry.otpMaxPollAttempts} waiting ${KPRO_CONFIG.retry.otpPollIntervalMs}ms...`
            );
            await sleep(KPRO_CONFIG.retry.otpPollIntervalMs);
        }
    }

    throw (
        lastError ||
        new Error('Failed to retrieve valid 6-digit OTP from web service after polling')
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
            signal: AbortSignal.timeout(KPRO_CONFIG.timeouts.defaultMs),
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
 * Menggunakan launchServer agar memiliki akses ke process PID untuk mematikan seluruh subproses Zygote/renderer.
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
        kproLogger.info(`[KPRO-AUTH] Navigating to ${KPRO_CONFIG.urls.login}`);

        await page.goto(KPRO_CONFIG.urls.login, {
            waitUntil: 'commit',
            timeout: 60000,
        });

        const otpInput = page.locator('input[name="verifikasi"]');
        await otpInput.waitFor({ state: 'visible', timeout: 60000 });

        // Jeda waktu awal agar K-PRO selesai mengirimkan OTP ke Telegram
        kproLogger.info('[KPRO-AUTH] Waiting 6 seconds for K-PRO OTP dispatch...');
        await sleep(6000);

        const otp = await fetchOtpFromWebService();
        kproLogger.info(`[KPRO-AUTH] Submitting OTP: ${otp}`);

        await otpInput.fill(otp);
        await page.locator('button[type="submit"]').click({ noWaitAfter: true });

        // Tunggu transisi atau cek alert kesalahan
        await sleep(4000);
        const errorAlert = page.locator('div.alert.alert-danger');
        if ((await errorAlert.count()) > 0) {
            const errText = await errorAlert.first().innerText();
            throw new Error(`Login rejected by K-PRO: ${errText.trim()}`);
        }

        // Buka dashboard untuk memastikan sesi terkonfirmasi
        await page.goto(KPRO_CONFIG.urls.dashboard, {
            waitUntil: 'commit',
            timeout: 60000,
        });

        await sleep(2000);
        const pageTitle = await page.title();
        if (!pageTitle.includes('K-PRO | Dashboard')) {
            kproLogger.warn(`[KPRO-AUTH] Page title was "${pageTitle}", waiting 3s...`);
            await sleep(3000);
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
            throw new Error('Login succeeded but no cookies were returned');
        }

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
