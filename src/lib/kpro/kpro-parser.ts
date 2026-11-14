import fs from 'node:fs/promises';
import { kproLogger } from '@/lib/logger';
import type { KproCompworkRecord, KproParseResult } from './kpro-types';

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
 * Parsing angka desimal secara aman (menangani tanda koma/titik dan nilai invalid seperti nama ODP).
 */
function parseSafeFloat(val: string | undefined | null): number | null {
    if (!val) return null;
    const clean = val.replace(/,/g, '.').trim();
    if (!clean || clean === '-' || clean.toLowerCase() === 'null') return null;
    const num = Number.parseFloat(clean);
    return Number.isNaN(num) ? null : num;
}

/**
 * Parsing tanggal secara aman ke objek Date.
 * Format umum dari K-PRO adalah "YYYY-MM-DD HH:mm:ss" atau "YYYY-MM-DD".
 */
function parseSafeDate(val: string | undefined | null): Date | null {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null') return null;

    // Ubah "YYYY-MM-DD HH:mm:ss" menjadi format ISO yang ramah Date constructor
    const isoString =
        trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed;

    const parsed = new Date(isoString);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalisasi string: kosong atau '-' dikonversi ke null.
 */
function parseSafeString(val: string | undefined | null): string | null {
    if (!val) return null;
    const trimmed = cleanHtmlText(val);
    return trimmed.length > 0 && trimmed !== '-' ? trimmed : null;
}

/**
 * Membaca dan mem-parsing file HTML Table K-PRO secara in-memory streaming.
 * Memfilter baris dan HANYA mengambil status 'COMPWORK'.
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
    const headers = headerMatches.map((m) => cleanHtmlText(m[1]).toUpperCase());

    const getColIndex = (name: string): number => headers.indexOf(name);

    const idx = {
        wonum: getColIndex('WONUM'),
        status: getColIndex('STATUS'),
        crmordertype: getColIndex('CRMORDERTYPE'),
        scorderno: getColIndex('SCORDERNO'),
        servicenum: getColIndex('SERVICENUM'),
        ncli: getColIndex('NCLI'),
        flag_order: getColIndex('FLAG_ORDER'),
        regional_baru: getColIndex('REGIONAL BARU'),
        district_baru: getColIndex('DISTRICT BARU'),
        datel_baru: getColIndex('DATEL BARU'),
        sto: getColIndex('STO'),
        regional_lama: getColIndex('REGIONAL LAMA'),
        district_lama: getColIndex('DISTRICT LAMA'),
        datel_lama: getColIndex('DATEL LAMA'),
        package_name: getColIndex('PACKAGE_NAME'),
        product: getColIndex('PRODUCT'),
        jenis_product: getColIndex('JENIS_PRODUCT'),
        customer_name: getColIndex('CUSTOMER_NAME'),
        customer_address: getColIndex('CUSTOMER_ADDRESS'),
        no_hp: getColIndex('NO_HP'),
        latitude_ins: getColIndex('LATITUDE_INS'),
        longitude_ins: getColIndex('LONGITUDE_INS'),
        datecreated: getColIndex('DATECREATED'),
        tgl_manja: getColIndex('TGL_MANJA'),
        actstart: getColIndex('ACTSTART'),
        schedule_labor: getColIndex('SCHEDULE_LABOR'),
        statusdate: getColIndex('STATUSDATE'),
        tanggal_approval: getColIndex('TANGGAL_APPROVAL'),
        status_survey: getColIndex('STATUS_SURVEY'),
        status_task: getColIndex('STATUS_TASK'),
        status_approval: getColIndex('STATUS_APPROVAL'),
        status_odp: getColIndex('STATUS_ODP'),
        desc_task: getColIndex('DESC_TASK'),
        engineermemo: getColIndex('ENGINEERMEMO'),
        catatan_teknisi: getColIndex('CATATAN_TEKNISI'),
        keterangan_pi: getColIndex('KETERANGAN_PI'),
        engineermemo_akhir: getColIndex('ENGINEERMEMO_AKHIR'),
        amcrew: getColIndex('AMCREW'),
        laborcode: getColIndex('LABORCODE'),
        laborname: getColIndex('LABORNAME'),
        chief_code: getColIndex('CHIEF_CODE'),
        chief_name: getColIndex('CHIEF_NAME'),
        ownergroup: getColIndex('OWNERGROUP'),
        errorcode: getColIndex('ERRORCODE'),
        suberrorcode: getColIndex('SUBERRORCODE'),
        errorcode_akhir: getColIndex('ERRORCODE_AKHIR'),
        suberrorcode_akhir: getColIndex('SUBERRORCODE_AKHIR'),
        measurement: getColIndex('MEASUREMENT'),
        odp_name: getColIndex('ODP_NAME'),
        odp_name_ut: getColIndex('ODP_NAME_UT'),
        new_reservationid: getColIndex('NEW_RESERVATIONID'),
        tiket_id: getColIndex('TIKET_ID'),
        flag_wsa: getColIndex('FLAG_WSA'),
        flag_pda: getColIndex('FLAG_PDA'),
        homepassid: getColIndex('HOMEPASSID'),
        tgl_pi_awal: getColIndex('TGL_PI_AWAL'),
        tgl_pi_akhir: getColIndex('TGL_PI_AKHIR'),
        tgl_fallout_awal: getColIndex('TGL_FALLOUT_AWAL'),
        tgl_fallout_akhir: getColIndex('TGL_FALLOUT_AKHIR'),
        territory_tif: getColIndex('TERRITORY_TIF'),
        district_tif: getColIndex('DISTRICT_TIF'),
        long_inst_ut: getColIndex('LONG_INST_UT'),
        lat_inst_ut: getColIndex('LAT_INST_UT'),
        long_retag_ut: getColIndex('LONG_RETAG_UT'),
        lat_retag_ut: getColIndex('LAT_RETAG_UT'),
    };

    if (idx.wonum === -1 || idx.status === -1) {
        throw new Error(
            `Crucial column missing in table header. WONUM idx: ${idx.wonum}, STATUS idx: ${idx.status}`
        );
    }

    // 2. Loop Baris Data dalam <tbody>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tbodyStart = html.indexOf('<tbody>');
    if (tbodyStart !== -1) {
        rowRegex.lastIndex = tbodyStart;
    }

    const records: KproCompworkRecord[] = [];
    let totalRows = 0;
    let compworkRows = 0;
    let skippedRows = 0;

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

        const wonum = cells[idx.wonum];
        const status = cells[idx.status];

        // Filter ketat: HANYA COMPWORK dan WONUM valid
        if (!wonum || !status || status.toUpperCase() !== 'COMPWORK') {
            skippedRows++;
            rowMatch = rowRegex.exec(html);
            continue;
        }

        compworkRows++;
        records.push({
            wonum: wonum.trim(),
            crmordertype: parseSafeString(cells[idx.crmordertype]),
            scorderno: parseSafeString(cells[idx.scorderno]),
            servicenum: parseSafeString(cells[idx.servicenum]),
            ncli: parseSafeString(cells[idx.ncli]),
            flag_order: parseSafeString(cells[idx.flag_order]),
            regional_baru: parseSafeString(cells[idx.regional_baru]),
            district_baru: parseSafeString(cells[idx.district_baru]),
            datel_baru: parseSafeString(cells[idx.datel_baru]),
            sto: parseSafeString(cells[idx.sto]),
            regional_lama: parseSafeString(cells[idx.regional_lama]),
            district_lama: parseSafeString(cells[idx.district_lama]),
            datel_lama: parseSafeString(cells[idx.datel_lama]),
            package_name: parseSafeString(cells[idx.package_name]),
            product: parseSafeString(cells[idx.product]),
            jenis_product: parseSafeString(cells[idx.jenis_product]),
            customer_name: parseSafeString(cells[idx.customer_name]),
            customer_address: parseSafeString(cells[idx.customer_address]),
            no_hp: parseSafeString(cells[idx.no_hp]),
            latitude_ins: parseSafeFloat(cells[idx.latitude_ins]),
            longitude_ins: parseSafeFloat(cells[idx.longitude_ins]),
            datecreated: parseSafeDate(cells[idx.datecreated]),
            tgl_manja: parseSafeDate(cells[idx.tgl_manja]),
            actstart: parseSafeDate(cells[idx.actstart]),
            schedule_labor: parseSafeDate(cells[idx.schedule_labor]),
            statusdate: parseSafeDate(cells[idx.statusdate]),
            tanggal_approval: parseSafeDate(cells[idx.tanggal_approval]),
            status_survey: parseSafeString(cells[idx.status_survey]),
            status_task: parseSafeString(cells[idx.status_task]),
            status: 'COMPWORK',
            status_approval: parseSafeString(cells[idx.status_approval]),
            status_odp: parseSafeString(cells[idx.status_odp]),
            desc_task: parseSafeString(cells[idx.desc_task]),
            engineermemo: parseSafeString(cells[idx.engineermemo]),
            catatan_teknisi: parseSafeString(cells[idx.catatan_teknisi]),
            keterangan_pi: parseSafeString(cells[idx.keterangan_pi]),
            engineermemo_akhir: parseSafeString(cells[idx.engineermemo_akhir]),
            amcrew: parseSafeString(cells[idx.amcrew]),
            laborcode: parseSafeString(cells[idx.laborcode]),
            laborname: parseSafeString(cells[idx.laborname]),
            chief_code: parseSafeString(cells[idx.chief_code]),
            chief_name: parseSafeString(cells[idx.chief_name]),
            ownergroup: parseSafeString(cells[idx.ownergroup]),
            errorcode: parseSafeString(cells[idx.errorcode]),
            suberrorcode: parseSafeString(cells[idx.suberrorcode]),
            errorcode_akhir: parseSafeString(cells[idx.errorcode_akhir]),
            suberrorcode_akhir: parseSafeString(cells[idx.suberrorcode_akhir]),
            measurement: parseSafeString(cells[idx.measurement]),
            odp_name: parseSafeString(cells[idx.odp_name]),
            odp_name_ut: parseSafeString(cells[idx.odp_name_ut]),
            new_reservationid: parseSafeString(cells[idx.new_reservationid]),
            tiket_id: parseSafeString(cells[idx.tiket_id]),
            flag_wsa: parseSafeString(cells[idx.flag_wsa]),
            flag_pda: parseSafeString(cells[idx.flag_pda]),
            homepassid: parseSafeString(cells[idx.homepassid]),
            tgl_pi_awal: parseSafeDate(cells[idx.tgl_pi_awal]),
            tgl_pi_akhir: parseSafeDate(cells[idx.tgl_pi_akhir]),
            tgl_fallout_awal: parseSafeDate(cells[idx.tgl_fallout_awal]),
            tgl_fallout_akhir: parseSafeDate(cells[idx.tgl_fallout_akhir]),
            territory_tif: parseSafeString(cells[idx.territory_tif]),
            district_tif: parseSafeString(cells[idx.district_tif]),
            long_inst_ut: parseSafeFloat(cells[idx.long_inst_ut]),
            lat_inst_ut: parseSafeFloat(cells[idx.lat_inst_ut]),
            long_retag_ut: parseSafeFloat(cells[idx.long_retag_ut]),
            lat_retag_ut: parseSafeFloat(cells[idx.lat_retag_ut]),
        });

        rowMatch = rowRegex.exec(html);
    }

    const elapsedMs = Date.now() - t0;
    kproLogger.info(
        `[KPRO-PARSER] Parsed in ${elapsedMs}ms: ${totalRows} total rows, ${compworkRows} COMPWORK kept, ${skippedRows} non-COMPWORK skipped`
    );

    return {
        records,
        totalRows,
        compworkRows,
        skippedRows,
    };
}
