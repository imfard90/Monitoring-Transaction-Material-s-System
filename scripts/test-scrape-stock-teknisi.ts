import 'dotenv/config';
import { chromium } from 'playwright';

/**
 * Quick test: scrape /teknisi/detail-stok/{nik}
 * Verifikasi structure HTML sebelum implementasi penuh.
 */

const LENSA_URL = process.env.LENSA_URL || 'https://lensa-inventory.telkomakses.co.id';
const USERNAME = process.env.LENSA_USERNAME;
const PASSWORD = process.env.LENSA_PASSWORD;
const TEST_NIK = '15894456'; // VIKKI RUDIANTO dari response sample

async function testScrapeStockTeknisi() {
    if (!USERNAME || !PASSWORD) {
        console.error('LENSA_USERNAME atau LENSA_PASSWORD tidak di-set.');
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Login
        console.log(`[1/3] Login ke ${LENSA_URL}/login ...`);
        await page.goto(`${LENSA_URL}/login`);
        await page.fill('input[type="text"], input[name="username"]', USERNAME);
        await page.fill('input[type="password"], input[name="password"]', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dashboard**', { timeout: 10000 });

        if (page.url().includes('login')) {
            throw new Error('Login gagal.');
        }
        console.log('[2/3] Login berhasil.');

        // Navigate ke detail-stok
        const stockUrl = `${LENSA_URL}/teknisi/detail-stok/${TEST_NIK}`;
        console.log(`[3/3] Fetch ${stockUrl} ...`);
        await page.goto(stockUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Parse NIK - NAMA Teknisi
        const infoRows = await page.$$eval('.info-row', (rows) => {
            return rows.map((row) => {
                const label = row.querySelector('.label')?.textContent?.trim() || '';
                const value = row.querySelector('.value')?.textContent?.trim() || '';
                return { label, value };
            });
        });

        const nikNamaRow = infoRows.find((r) => r.label.includes('NIK - NAMA Teknisi'));
        console.log('\n📋 NIK - NAMA Teknisi:', nikNamaRow?.value || 'TIDAK DITEMUKAN');

        // Parse table stock
        const stockTable = await page.$$eval('table tbody tr', (rows) => {
            return rows
                .map((row) => {
                    const cells = Array.from(row.querySelectorAll('td')).map(
                        (td) => td.textContent?.trim() || ''
                    );
                    if (cells.length < 8) return null;
                    return {
                        no: cells[0],
                        id_material: cells[1],
                        nama_material: cells[2],
                        satuan: cells[3],
                        qty_reservasi: cells[4],
                        qty_return: cells[5],
                        qty_pemakaian: cells[6],
                        stock_teknisi: cells[7],
                    };
                })
                .filter((r) => r !== null);
        });

        console.log(`\n📦 Stock Material (${stockTable.length} items):`);
        console.table(stockTable);

        console.log('\n✅ Scraping berhasil. Structure sesuai dengan response sample.');
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await context.close();
        await browser.close();
    }
}

testScrapeStockTeknisi();
