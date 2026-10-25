import type { Page } from 'playwright';
import { actionLogger } from '@/lib/logger';
import { redis } from '../redis';
import { LENSA_URL, setupContext } from './lensa-browser';

export interface StockTeknisiLensa {
    nik_teknisi: string;
    nama_teknisi: string;
    materials: Array<{
        id_material: string;
        nama_material: string;
        satuan: string;
        qty_reservasi: string;
        qty_return: string;
        qty_pemakaian: string;
        stock_teknisi: string;
    }>;
}

/**
 * Scrape detail stok teknisi pada tab/page yang sudah berada di context terautentikasi.
 * Dapat dipanggil berulang kali pada context yang sama tanpa overhead login ulang.
 */
export async function scrapeStockTeknisiOnPage(
    page: Page,
    nik: string
): Promise<StockTeknisiLensa> {
    const stockUrl = `${LENSA_URL}/teknisi/detail-stok/${nik}`;
    await page.goto(stockUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('login')) {
        throw new Error('Sesi Lensa terputus (diarahkan ke halaman login)');
    }

    // Tunggu elemen informasi teknisi atau tabel muncul
    await page.waitForSelector('.info-row', { timeout: 10000 }).catch(() => null);

    // Parse NIK - NAMA Teknisi dari .info-row
    const infoRows = await page.$$eval('.info-row', (rows) => {
        return rows.map((row) => {
            const label = row.querySelector('.label')?.textContent?.trim() || '';
            const value = row.querySelector('.value')?.textContent?.trim() || '';
            return { label, value };
        });
    });

    const nikNamaRow = infoRows.find((r) => r.label.includes('NIK - NAMA Teknisi'));
    if (!nikNamaRow?.value) {
        throw new Error(`Data teknisi NIK ${nik} tidak ditemukan di Lensa`);
    }

    // Parse "15894456 - VIKKI RUDIANTO" -> nik + nama
    const [nikParsed, ...nameParts] = nikNamaRow.value.split('-').map((s) => s.trim());
    const namaParsed = nameParts.join(' - ').trim();

    // Parse table stock dari <table>
    const materials = await page.$$eval('table tbody tr', (rows) => {
        return rows
            .map((row) => {
                const cells = Array.from(row.querySelectorAll('td')).map(
                    (td) => td.textContent?.trim() || ''
                );
                if (cells.length < 8) return null;
                return {
                    id_material: cells[1],
                    nama_material: cells[2],
                    satuan: cells[3],
                    qty_reservasi: cells[4],
                    qty_return: cells[5],
                    qty_pemakaian: cells[6],
                    stock_teknisi: cells[7],
                };
            })
            .filter((r) => r !== null) as Array<{
            id_material: string;
            nama_material: string;
            satuan: string;
            qty_reservasi: string;
            qty_return: string;
            qty_pemakaian: string;
            stock_teknisi: string;
        }>;
    });

    return {
        nik_teknisi: nikParsed || nik,
        nama_teknisi: namaParsed || '',
        materials,
    };
}

/**
 * Scrape stock teknisi dari endpoint /teknisi/detail-stok/{nik}
 * Membuka BrowserContext tersendiri dan menutupnya setelah selesai.
 */
export async function scrapeStockTeknisi(
    nik: string,
    customUsername?: string,
    customPassword?: string
): Promise<StockTeknisiLensa> {
    const username = customUsername || process.env.LENSA_USERNAME;
    const password = customPassword || process.env.LENSA_PASSWORD;
    if (!username || !password)
        throw new Error('Akun Lensa tidak ditemukan. Silakan hubungkan akun Lensa Anda di profil.');

    const { context, page, performLogin, sessionKey } = await setupContext(username, password);

    try {
        if (page.url().includes('login')) {
            await performLogin();
        }

        try {
            return await scrapeStockTeknisiOnPage(page, nik);
        } catch (innerError) {
            // Jika sesi terputus saat navigasi, hapus cache sesi di redis, login ulang 1x
            if (page.url().includes('login')) {
                await redis.del(sessionKey);
                await performLogin();
                return await scrapeStockTeknisiOnPage(page, nik);
            }
            throw innerError;
        }
    } catch (error) {
        actionLogger.error(
            `Stock teknisi scrape error (NIK ${nik}):`,
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    } finally {
        await context.close();
    }
}
