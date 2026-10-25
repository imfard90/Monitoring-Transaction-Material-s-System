export interface TeknisiStockListItem {
    nik: string;
    nama: string;
    branch: string | null;
    service_area: string | null;
    warehouse_name: string | null;
    status: 'match' | 'selisih' | 'failed' | 'not_scraped';
    scraped_at: string | null;
    total_materials: number;
    total_selisih: number | null;
}

export interface StockComparisonItem {
    id_material: string;
    nama_material: string;
    satuan: string | null;
    stock_lensa: number;
    stock_mtms: number;
    selisih: number;
    match_status: 'match' | 'selisih';
}

export interface StockComparisonResult {
    nik_teknisi: string;
    nama_teknisi: string;
    branch: string | null;
    service_area: string | null;
    warehouse_name: string | null;
    scraped_at: string | null;
    items: StockComparisonItem[];
}

export interface CachedLensaStock {
    status: 'success' | 'failed';
    scraped_at: string;
    error_message?: string | null;
    materials?: Array<{
        id_material: string;
        nama_material: string;
        satuan?: string;
        stock_teknisi: string;
    }>;
}

export interface TeknisiRow {
    nik: string;
    name: string;
    wh_id: number | null;
    ref_intech_lensa: unknown;
    branch: string | null;
    service_area: string | null;
    warehouse_name: string | null;
}
