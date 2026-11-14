export interface KproCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface KproCompworkRecord {
    wonum: string;
    crmordertype: string | null;
    scorderno: string | null;
    servicenum: string | null;
    ncli: string | null;
    flag_order: string | null;
    regional_baru: string | null;
    district_baru: string | null;
    datel_baru: string | null;
    sto: string | null;
    regional_lama: string | null;
    district_lama: string | null;
    datel_lama: string | null;
    package_name: string | null;
    product: string | null;
    jenis_product: string | null;
    customer_name: string | null;
    customer_address: string | null;
    no_hp: string | null;
    latitude_ins: number | null;
    longitude_ins: number | null;
    datecreated: Date | null;
    tgl_manja: Date | null;
    actstart: Date | null;
    schedule_labor: Date | null;
    statusdate: Date | null;
    tanggal_approval: Date | null;
    status_survey: string | null;
    status_task: string | null;
    status: string; // 'COMPWORK'
    status_approval: string | null;
    status_odp: string | null;
    desc_task: string | null;
    engineermemo: string | null;
    catatan_teknisi: string | null;
    keterangan_pi: string | null;
    engineermemo_akhir: string | null;
    amcrew: string | null;
    laborcode: string | null;
    laborname: string | null;
    chief_code: string | null;
    chief_name: string | null;
    ownergroup: string | null;
    errorcode: string | null;
    suberrorcode: string | null;
    errorcode_akhir: string | null;
    suberrorcode_akhir: string | null;
    measurement: string | null;
    odp_name: string | null;
    odp_name_ut: string | null;
    new_reservationid: string | null;
    tiket_id: string | null;
    flag_wsa: string | null;
    flag_pda: string | null;
    homepassid: string | null;
    tgl_pi_awal: Date | null;
    tgl_pi_akhir: Date | null;
    tgl_fallout_awal: Date | null;
    tgl_fallout_akhir: Date | null;
    territory_tif: string | null;
    district_tif: string | null;
    long_inst_ut: number | null;
    lat_inst_ut: number | null;
    long_retag_ut: number | null;
    lat_retag_ut: number | null;
}

export interface KproParseResult {
    records: KproCompworkRecord[];
    totalRows: number;
    compworkRows: number;
    skippedRows: number;
}

export interface KproWitelSyncResult {
    witel: string;
    filePath: string;
    fileSize: number;
    jobId: number;
    totalRows: number;
    compworkRows: number;
    durationMs: number;
    error?: string;
}

export interface KproSyncSummary {
    success: boolean;
    startDate: string;
    endDate: string;
    witels: KproWitelSyncResult[];
    totalCompworkUpserted: number;
    totalDurationMs: number;
    error?: string;
}
