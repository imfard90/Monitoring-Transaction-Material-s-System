/**
 * Shared types for the inventory repository modules.
 *
 * Split out so each domain module (stored procedures, master data, out SAP,
 * hasil rekon) can reference the contracts without importing each other.
 */

export interface HasilRekonItem {
    header_id: number;
    item_id: number;
    sap_out_id?: number;
    designator_id?: number;
    created_at: string | null;
    trx_id: string | null;
    id_pemakaian?: string | null;
    sap_number: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number;
    isNewRekon?: boolean;
}

export interface HasilRekonPaginatedFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouse?: string;
    type?: string;
    material?: string;
    startDate?: string;
    endDate?: string;
    warehouseIds?: readonly number[];
}

export type InOutTagFilters = {
    status?: 'OPEN' | 'IN_TRANSIT' | 'CLOSED' | 'CANCEL';
    fromWarehouseId?: number;
    toWarehouseId?: number;
    fromDate?: Date;
    toDate?: Date;
    search?: string;
    limit?: number;
    offset?: number;
};
