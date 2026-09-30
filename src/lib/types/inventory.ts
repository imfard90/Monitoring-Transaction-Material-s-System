/**
 * Shared inventory domain types.
 *
 * Derived from database.types.ts (Kysely codegen) and server-action return shapes.
 * Import from here in client components instead of using `any`.
 */

// ─── Enums (mirror database enums) ───────────────────────────────────────────

export type InoutTagStatus = 'requested' | 'in_transit' | 'closed' | 'cancel';
export type TransactionAction = 'request' | 'send' | 'accept';
export type StockMovementType =
    | 'adjustment'
    | 'material_used'
    | 'opening_balance'
    | 'receive'
    | 'return'
    | 'sap_out'
    | 'transfer_in'
    | 'transfer_out';

// ─── InOut Tag ────────────────────────────────────────────────────────────────

/** Row returned by getInOutTags() — merged inout + return headers */
export interface InOutTagRow {
    id: string | number;
    id_trx: string;
    request_id: string | null;
    send_id: string | null;
    accept_id: string | null;
    end_status: string;
    request_time: Date | string | null;
    name_vendor: string | null;
    from_wh_name: string | null;
    to_wh_name: string | null;
    type: 'inout' | 'return';
    /** Additional columns from selectAll('h') — present only for 'inout' type */
    nik_send?: string | null;
    notes?: string | null;
    from_wh_id?: number | null;
    to_wh_id?: number | null;
    to_wh?: string | null;
    updated_at?: Date | string | null;
    created_by_name?: string | null;
    reject_reason?: string | null;
}

/** Status counts for InOut Tag card header */
export interface InOutTagCounts {
    requested: number;
    in_transit: number;
    closed: number;
    cancel: number;
}

/** Single item inside a tag transaction (request/send/accept) */
export interface InOutTagItem {
    id: string | number;
    action?: TransactionAction;
    action_id?: string;
    designator_id?: string | number;
    qty: number;
    unit_price?: string | null;
    header_id?: string | number;
    created_at?: Date | string;
    /** Joined from inventory.materials */
    material_code?: string | null;
    designator_code?: string | null;
    material_description?: string | null;
    material_unit?: string | null;
    created_by_name?: string | null;
    updated_by_name?: string | null;
}

// ─── Out Material (SAP Out) ───────────────────────────────────────────────────

/** Row returned by getOutMaterials() */
export interface OutMaterialRow {
    id: string | number;
    id_trx: string;
    request_id: string;
    nik_teknisi: string;
    name_sa: string;
    warehouse_id: number | null;
    end_status: string | null;
    request_time: Date | string;
    sap_number: string | null;
    sap_time: Date | string | null;
    id_reservasi: string | null;
    /** Joined columns */
    nama_teknisi: string | null;
    nama_gudang: string | null;
    notes?: string | null;
}

/** Status counts for Out Material card header */
export interface OutMaterialCounts {
    wait_approve: number;
    request: number;
    intech: number;
    close: number;
}

/** Single item inside an out-material (SAP out) transaction */
export interface OutMaterialItem {
    id: string | number;
    qty_req: number;
    qty_used: number | null;
    /** Joined from inventory.materials */
    designator_code: string | null;
    material_description: string | null;
}

/** Form item used when creating a new SAP out transaction */
export interface OutSapFormItem {
    id: string;
    designator_id: string | number;
    qty_req: number;
    material_description?: string | null;
    unit?: string | null;
    notes?: string | null;
    created_by_name?: string | null;
    updated_by_name?: string | null;
}

// ─── Return Material ──────────────────────────────────────────────────────────

/** Row returned from return material SAP out list */
export interface ReturnSapOutOption {
    id: string | number;
    id_trx: string;
    sap_number: string | null;
    nik_teknisi?: string;
    nama_teknisi?: string | null;
    warehouse_id?: number | string | null;
}

/** An available item for return */
export interface ReturnAvailableItem {
    sap_out_item_id: string | number;
    designator_id: string | number;
    material_code: string | null;
    material_description?: string | null;
    qty_req: number;
    qty_used: number | null;
    maxReturn?: number;
    material_name?: string | null;
}

/** Return form item (what user selects to return) */
export interface ReturnItem {
    id?: string | number;
    designator_id: string | number;
    sap_out_item_id: string | number;
    qty: number | '';
    material_code?: string | null;
    material_description?: string | null;
    maxReturn?: number;
    notes?: string;
}

// ─── Stock Movement ───────────────────────────────────────────────────────────

/** Row returned by getStockMovements() */
export interface StockMovementRow {
    id: string | number;
    movement_type: StockMovementType;
    qty_delta: number;
    qty_after: number;
    notes: string | null;
    created_at: Date | string;
    created_by: string | null;
    /** Joined from materials */
    material_code: string | null;
    material_name: string | null;
    /** Joined from mas_wh */
    warehouse_name: string | null;
    /** Joined for traceability */
    reference_trx: string | null;
}

// ─── Hasil Rekon ─────────────────────────────────────────────────────────────

/** Row returned by getHasilRekon() */
export interface HasilRekonRow {
    id: string | number;
    trx_id: string | null;
    sap_number: string | null;
    nik: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number | null;
    type: string | null;
    created_at: Date | string | null;
    warehouse_name: string | null;
}

// ─── Technician ───────────────────────────────────────────────────────────────

export interface Technician {
    id: string | number;
    nik: string;
    name: string;
    phone: string | null;
    email: string | null;
    region: string | null;
    /** Service areas this technician covers */
    serviceAreas?: ServiceArea[];
}

export interface ServiceArea {
    id: string | number;
    name: string;
    code?: string | null;
}

// ─── Warehouse ────────────────────────────────────────────────────────────────

export interface Warehouse {
    id: number;
    name: string;
    branch: string;
    intls: string;
}

// ─── Material ────────────────────────────────────────────────────────────────

export interface Material {
    id: number;
    code: string | null;
    description: string | null;
    unit: string;
}

// ─── Generic server action response ──────────────────────────────────────────

export interface ActionResponse<T = unknown> {
    success: boolean;
    data: T[];
    message?: string;
}
