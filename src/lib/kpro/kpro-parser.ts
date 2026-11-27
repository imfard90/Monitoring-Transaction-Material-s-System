import fs from 'node:fs/promises';
import { kproLogger } from '@/lib/logger';
import type { KproParseResult, KproRawRowRecord } from './kpro-types';

/**
 * Membersihkan tag HTML dan decode entitas HTML sederhana.
 */
function cleanHtmlText(text: string): string {
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Membaca dan mem-parsing file HTML Table K-PRO secara cepat untuk dimasukkan ke staging table.
 * Seluruh pembersihan string, parsing tanggal/koordinat, dan pengetatan tipe data
 * telah didelegasikan langsung ke Stored Procedure etl.sp_process_kpro_staging di database PostgreSQL.
 */
export async function parseKproHtmlFile(filePath: string): Promise<KproParseResult> {
    kproLogger.info(`[KPRO-PARSER] Reading file: ${filePath}`);
    const t0 = Date.now();
    const html = await fs.readFile(filePath, 'utf8');

    // 1. Ekstrak Header Row
    const theadMatch = html.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
    const headerRowHtml = theadMatch
        ? theadMatch[1]
        : html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1];

    if (!headerRowHtml) {
        throw new Error('Failed to locate table header row in HTML file');
    }

    const headerMatches = [...headerRowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
    const headers = headerMatches.map((m) =>
        cleanHtmlText(m[1]).toUpperCase().replace(/\s+/g, '_')
    );

    // 2. Loop Baris Data dalam <tbody>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tbodyStart = html.indexOf('<tbody>');
    if (tbodyStart !== -1) {
        rowRegex.lastIndex = tbodyStart;
    }

    const rawRecords: KproRawRowRecord[] = [];
    let totalRows = 0;

    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;

    let rowMatch: RegExpExecArray | null = rowRegex.exec(html);
    while (rowMatch !== null) {
        totalRows++;
        const rowContent = rowMatch[1];

        // Ekstrak nilai sel
        cellRegex.lastIndex = 0;
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null = cellRegex.exec(rowContent);
        while (cellMatch !== null) {
            cells.push(cleanHtmlText(cellMatch[1]));
            cellMatch = cellRegex.exec(rowContent);
        }

        // Simpan baris mentah untuk staging ingestion (dengan header terstandarisasi)
        if (cells.length > 0) {
            const rawRow: KproRawRowRecord = {};
            for (let i = 0; i < headers.length; i++) {
                const h = headers[i];
                if (h && cells[i] !== undefined) {
                    rawRow[h] = cells[i];
                }
            }
            rawRecords.push(rawRow);
        }

        rowMatch = rowRegex.exec(html);
    }

    const elapsedMs = Date.now() - t0;
    kproLogger.info(
        `[KPRO-PARSER] Extracted ${rawRecords.length} raw rows from ${totalRows} total rows in ${elapsedMs}ms`
    );

    return {
        rawRecords,
        totalRows,
    };
}
