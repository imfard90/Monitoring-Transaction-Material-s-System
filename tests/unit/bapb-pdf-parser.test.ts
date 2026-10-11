import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTextBlocksFromPdf, parseBapbPdfBuffer } from '@/lib/lensa-scraper/bapb-pdf-parser';

describe('BAPB PDF Parser', () => {
    it('returns empty structures on empty buffer', () => {
        const result = parseBapbPdfBuffer(Buffer.from(''));
        expect(result.header).toEqual({});
        expect(result.materials).toEqual([]);
    });

    it('returns empty structures on non-PDF buffer', () => {
        const result = parseBapbPdfBuffer(Buffer.from('<html><body>Error 500</body></html>'));
        expect(result.header).toEqual({});
        expect(result.materials).toEqual([]);
    });

    const samplePdfPath = path.resolve('tmp/85087150-bapb.pdf');
    if (fs.existsSync(samplePdfPath)) {
        it('correctly parses real BAPB PDF for WO 85087150', () => {
            const buf = fs.readFileSync(samplePdfPath);
            const blocks = extractTextBlocksFromPdf(buf);
            expect(blocks.length).toBeGreaterThan(0);

            const result = parseBapbPdfBuffer(buf);

            // Verify header values
            expect(result.header.no_bapm).toBe('INC52615587');
            expect(result.header.id_project).toBe('26MC15R504-0001');
            expect(result.header.nama_project).toBe('QE AKSES LAMONGAN');
            expect(result.header.nama_gudang).toBe('SO Gresik');
            expect(result.header.mitra).toBe('TELKOM AKSES');
            expect(result.header.lokasi_project).toBe('SA GRESIK');
            expect(result.header.tanggal).toBe('2026-09-01');
            expect(result.header.nik_petugas).toBe('18950848');
            expect(result.header.nama_petugas).toBe('AHMAD SHODIQIN');

            // Verify materials
            expect(result.materials).toHaveLength(2);

            expect(result.materials[0]).toEqual({
                NO: '1',
                'ID MATERIAL': 'STAINLESS-BELT',
                'NAMA MATERIAL': 'Stainless Belt Lengkap',
                SATUAN: 'Pcs',
                'QTY PEMAKAIAN': '4',
                KETERANGAN: '',
            });

            expect(result.materials[1]).toEqual({
                NO: '2',
                'ID MATERIAL': 'HELICAL-GRIP-LKP',
                'NAMA MATERIAL': 'Helical Performed Grip Lengkap',
                SATUAN: 'Pcs',
                'QTY PEMAKAIAN': '2',
                KETERANGAN: '',
            });
        });
    }
});
