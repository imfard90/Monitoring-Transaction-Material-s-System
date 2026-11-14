import fs from 'node:fs/promises';
import path from 'node:path';
import { kproLogger } from '@/lib/logger';
import { clearCachedCookies, getValidCookies } from './kpro-auth';
import { KPRO_CONFIG } from './kpro-config';
import type { KproCookie } from './kpro-types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Menyusun URL download export data fulfillment endstate per witel dan tipe PSB (CREATE atau PDA).
 * CATATAN PENTING: K-PRO backend memerlukan karakter literal '+' pada parameter witel
 * (misal 'witel=JATIM+BARAT'), bukan '%2B' yang dihasilkan standar URLSearchParams.
 */
export function buildWitelDownloadUrl(
    witel: string,
    psb: 'CREATE' | 'PDA' = 'CREATE',
    start: string = '',
    end: string = ''
): string {
    const params = new URLSearchParams({
        reg: 'REGIONAL 3',
        start,
        end,
        psb,
        product: KPRO_CONFIG.product,
        teritory: 'TELKOM_BARU',
        reseller: 'ALL',
        tbg: 'ALL',
        homepassid: 'ALL',
    });

    params.set('witel', witel);
    const queryString = params
        .toString()
        .replace(`witel=${encodeURIComponent(witel)}`, `witel=${witel}`);

    return `${KPRO_CONFIG.urls.data}&${queryString}`;
}

/**
 * Mengunduh file laporan K-PRO untuk satu witel dan jenis PSB tertentu dengan mekanisme:
 * 1. Retry bertahap (hingga maxDownloadAttempts) jika jaringan timeout / server sibuk.
 * 2. Auto-recovery sesi: jika cookie hangus di tengah jalan, langsung trigger login ulang
 *    dan ulangi download secara transparan.
 */
export async function downloadWitelFile(
    initialCookies: KproCookie[],
    witel: string,
    psb: 'CREATE' | 'PDA' = 'CREATE',
    start: string = '',
    end: string = '',
    destDir: string = KPRO_CONFIG.tempDir
): Promise<{ filePath: string; fileSize: number }> {
    await fs.mkdir(destDir, { recursive: true });

    let activeCookies = initialCookies;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= KPRO_CONFIG.retry.maxDownloadAttempts; attempt++) {
        const safeWitelName = witel.replace(/\+/g, '_');
        const timestamp = Date.now();
        const filePath = path.join(destDir, `kpro_${safeWitelName}_${psb}_${timestamp}.html`);

        const url = buildWitelDownloadUrl(witel, psb, start, end);
        const cookieHeader = activeCookies.map((c) => `${c.name}=${c.value}`).join('; ');

        kproLogger.info(
            `[KPRO-DOWNLOAD] Downloading ${witel} (PSB: ${psb}, attempt ${attempt}/${KPRO_CONFIG.retry.maxDownloadAttempts}, ${start} to ${end})...`
        );
        const t0 = Date.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Cookie: cookieHeader,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(KPRO_CONFIG.timeouts.downloadMs),
            });

            if (!response.ok) {
                throw new Error(
                    `Download failed with HTTP ${response.status} ${response.statusText}`
                );
            }

            const htmlContent = await response.text();

            // Sesi hangus biasanya me-redirect ke login page (tidak mengandung '<table')
            if (!htmlContent.includes('<table')) {
                kproLogger.warn(
                    `[KPRO-DOWNLOAD] Response for ${witel} does not contain an HTML table. Sesi kemungkinan kedaluwarsa. Melakukan re-login otomatis...`
                );

                // Hapus cookie lama dan dapatkan cookie baru secara paksa
                await clearCachedCookies();
                activeCookies = await getValidCookies(true);

                // Lempar error sementara agar dicoba kembali dengan cookie baru di loop berikutnya
                throw new Error(
                    'Session expired during download, re-authenticated with fresh cookies'
                );
            }

            const fileBuffer = Buffer.from(htmlContent, 'utf8');
            await fs.writeFile(filePath, fileBuffer);

            const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
            const fileSize = fileBuffer.byteLength;

            kproLogger.info(
                `[KPRO-DOWNLOAD] ${witel} (${psb}): Success! ${(fileSize / (1024 * 1024)).toFixed(2)} MB in ${elapsedSec}s -> ${path.basename(filePath)}`
            );

            return { filePath, fileSize };
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            kproLogger.warn(
                `[KPRO-DOWNLOAD] Attempt ${attempt} failed for ${witel} (${psb}): ${lastError.message}`
            );

            // Bersihkan file parsial jika sempat dibuat
            await fs.unlink(filePath).catch(() => {});

            if (attempt < KPRO_CONFIG.retry.maxDownloadAttempts) {
                const backoffMs = KPRO_CONFIG.retry.downloadRetryDelayMs * attempt;
                kproLogger.info(`[KPRO-DOWNLOAD] Retrying ${witel} in ${backoffMs}ms...`);
                await sleep(backoffMs);
            }
        }
    }

    throw (
        lastError ||
        new Error(
            `Failed to download data for witel ${witel} after ${KPRO_CONFIG.retry.maxDownloadAttempts} attempts`
        )
    );
}
