import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
}));

import { buildWitelDownloadUrl } from '@/lib/kpro/kpro-downloader';
import { parseKproHtmlFile } from '@/lib/kpro/kpro-parser';
import { createKproRepository } from '@/lib/repositories/kpro.repository';

describe('K-PRO Downloader URL Builder', () => {
    it('should build download URL preserving literal + in witel parameter with psb=CREATE', () => {
        const url = buildWitelDownloadUrl('JATIM+BARAT', 'CREATE', '2026-10-15', '2026-11-14');

        expect(url).toContain('witel=JATIM+BARAT');
        expect(url).not.toContain('witel=JATIM%2BBARAT');
        expect(url).toContain('psb=CREATE');
        expect(url).toContain('product=ALL');
        expect(url).toContain('kolom=COMPWORK');
        expect(url).toContain('start=2026-10-15');
        expect(url).toContain('end=2026-11-14');
    });

    it('should build download URL for psb=PDA', () => {
        const url = buildWitelDownloadUrl('SURAMADU', 'PDA', '2026-10-15', '2026-11-14');

        expect(url).toContain('witel=SURAMADU');
        expect(url).toContain('psb=PDA');
        expect(url).toContain('product=ALL');
        expect(url).toContain('kolom=COMPWORK');
    });
});

describe('K-PRO HTML Table Parser', () => {
    it('should parse HTML table and extract raw records for staging ingestion', async () => {
        const testHtml = `
        <table border="1">
            <thead>
                <tr>
                    <th>NO</th>
                    <th>WONUM</th>
                    <th>CRMORDERTYPE</th>
                    <th>REGIONAL BARU</th>
                    <th>DISTRICT BARU</th>
                    <th>DATEL BARU</th>
                    <th>STO</th>
                    <th>SCORDERNO</th>
                    <th>PACKAGE_NAME</th>
                    <th>SERVICENUM</th>
                    <th>CUSTOMER_NAME</th>
                    <th>LATITUDE_INS</th>
                    <th>LONGITUDE_INS</th>
                    <th>DATECREATED</th>
                    <th>STATUS</th>
                    <th>STATUSDATE</th>
                    <th>LONG_INST_UT</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>WO010001</td>
                    <td>CREATE</td>
                    <td>3</td>
                    <td>SURAMADU</td>
                    <td>GRESIK</td>
                    <td>GSK</td>
                    <td>SC12345</td>
                    <td>IndiHome 30M</td>
                    <td>031123456</td>
                    <td>Pelanggan Satu</td>
                    <td>-7.155</td>
                    <td>112.655</td>
                    <td>2026-11-01 10:00:00</td>
                    <td>COMPWORK</td>
                    <td>2026-11-01 12:00:00</td>
                    <td>ODP-GSK-FBJ/40</td>
                </tr>
                <tr>
                    <td>2</td>
                    <td>WO010002</td>
                    <td>CREATE</td>
                    <td>3</td>
                    <td>SURAMADU</td>
                    <td>GRESIK</td>
                    <td>GSK</td>
                    <td>SC12346</td>
                    <td>IndiHome 50M</td>
                    <td>031123457</td>
                    <td>Pelanggan Dua</td>
                    <td>-7.156</td>
                    <td>112.656</td>
                    <td>2026-11-01 11:00:00</td>
                    <td>CANCLWORK</td>
                    <td>2026-11-01 13:00:00</td>
                    <td>ODP-GSK-FBJ/41</td>
                </tr>
                <tr>
                    <td>3</td>
                    <td>WO010003</td>
                    <td>CREATE</td>
                    <td>3</td>
                    <td>SURAMADU</td>
                    <td>GRESIK</td>
                    <td>GSK</td>
                    <td>SC12347</td>
                    <td>IndiHome 100M</td>
                    <td>031123458</td>
                    <td>Pelanggan Tiga</td>
                    <td>-7.157</td>
                    <td>112.657</td>
                    <td>2026-11-01 12:00:00</td>
                    <td>COMPWORK</td>
                    <td>2026-11-01 14:00:00</td>
                    <td>112.657</td>
                </tr>
            </tbody>
        </table>
        `;

        const tempFilePath = path.join(process.cwd(), 'temp', 'test_kpro_sample.html');
        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
        await fs.writeFile(tempFilePath, testHtml, 'utf8');

        try {
            const result = await parseKproHtmlFile(tempFilePath);

            expect(result.totalRows).toBe(3);
            expect(result.rawRecords.length).toBe(3);

            // Row 1
            expect(result.rawRecords[0].WONUM).toBe('WO010001');
            expect(result.rawRecords[0].CRMORDERTYPE).toBe('CREATE');
            expect(result.rawRecords[0].REGIONAL_BARU).toBe('3');
            expect(result.rawRecords[0].DISTRICT_BARU).toBe('SURAMADU');
            expect(result.rawRecords[0].DATEL_BARU).toBe('GRESIK');
            expect(result.rawRecords[0].STO).toBe('GSK');
            expect(result.rawRecords[0].STATUS).toBe('COMPWORK');
            expect(result.rawRecords[0].LATITUDE_INS).toBe('-7.155');
            expect(result.rawRecords[0].LONGITUDE_INS).toBe('112.655');

            // Row 2 (CANCLWORK in rawRecords, filtered later by SP)
            expect(result.rawRecords[1].WONUM).toBe('WO010002');
            expect(result.rawRecords[1].STATUS).toBe('CANCLWORK');

            // Row 3 (COMPWORK)
            expect(result.rawRecords[2].WONUM).toBe('WO010003');
            expect(result.rawRecords[2].STATUS).toBe('COMPWORK');
        } finally {
            await fs.unlink(tempFilePath).catch(() => {});
        }
    });
});

describe('K-PRO Repository Unit Test', () => {
    it('should create import job with correct parameters', async () => {
        const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: '42' }] });
        const mockPool = { query: mockQuery } as unknown as import('pg').Pool;

        const repo = createKproRepository(mockPool);
        const jobId = await repo.createImportJob('kpro_SURAMADU_123.html', 1048576);

        expect(jobId).toBe(42);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual(['kpro_SURAMADU_123.html', 1048576]);
    });

    it('should execute insertRawStagingBatch in chunks with transaction', async () => {
        const mockClientQuery = vi.fn().mockResolvedValue({ rows: [] });
        const mockClientRelease = vi.fn();
        const mockConnect = vi.fn().mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease,
        });
        const mockPool = { connect: mockConnect } as unknown as import('pg').Pool;

        const repo = createKproRepository(mockPool);
        const rawRows = [
            { WONUM: 'WO1', STATUS: 'COMPWORK' },
            { WONUM: 'WO2', STATUS: 'CANCLWORK' },
        ];
        const inserted = await repo.insertRawStagingBatch(101, rawRows, 1);

        expect(inserted).toBe(2);
        expect(mockConnect).toHaveBeenCalledTimes(1);
        // Expect BEGIN, 2 chunks of INSERT, COMMIT
        expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
        expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('should call callProcessKproStaging and return SP metrics', async () => {
        const mockQuery = vi.fn().mockResolvedValue({
            rows: [
                {
                    p_total_staging: '150',
                    p_compwork_upserted: '120',
                    p_error_count: '0',
                },
            ],
        });
        const mockPool = { query: mockQuery } as unknown as import('pg').Pool;

        const repo = createKproRepository(mockPool);
        const result = await repo.callProcessKproStaging(101);

        expect(result).toEqual({
            totalStaging: 150,
            compworkUpserted: 120,
            errorCount: 0,
        });
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('CALL etl.sp_process_kpro_staging'),
            [101]
        );
    });
});
