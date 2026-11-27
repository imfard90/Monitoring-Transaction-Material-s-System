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

/**
 * Representasi baris mentah (raw key-value string) dari hasil parsing tabel HTML K-PRO.
 * Key adalah nama kolom terstandarisasi (misal 'WONUM', 'STATUS', 'REGIONAL_BARU').
 */
export type KproRawRowRecord = Record<string, string>;

export interface KproParseResult {
    rawRecords: KproRawRowRecord[];
    totalRows: number;
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
