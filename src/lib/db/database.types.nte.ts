/**
 * NTE Inventory Schema Types
 * Extended types for nte_inventory.* tables (not the existing nte.* schema).
 * These augment the generated database.types.ts DB interface via module augmentation.
 */

import type { ColumnType } from 'kysely';

type NteTimestamp = ColumnType<Date, Date | string, Date | string>;
type NteInt8 = ColumnType<string, bigint | number | string, bigint | number | string>;

export type NteInventoryEnumOwner = 'telkom' | 'tif' | 'tsel';
export type NteInventoryEnumLocationType = 'warehouse' | 'customer';
export type NteInventoryEnumInventoryStatus = 'available' | 'unavailable' | 'installed';
export type NteInventoryEnumConditionStatus = 'normal' | 'damage' | 'refurbish';
export type NteInventoryEnumTypeTransaksi =
    | 'stock_transfer'
    | 'send_to_technician'
    | 'installation'
    | 'return_from_technician';

export interface NteInventoryMasItemNte {
    id: NteInt8;
    type: string;
    merek: string;
    type_sn: string;
    item_description: string;
    is_active: boolean | null;
    created_at: NteTimestamp | null;
    updated_at: NteTimestamp | null;
}

export interface NteInventoryMasAddressNte {
    address_name: string;
    owner: NteInventoryEnumOwner;
    location_type: NteInventoryEnumLocationType;
    ui_label: string;
    is_active: boolean | null;
    created_at: NteTimestamp | null;
    mapping_mas_wh: number | null;
}

export interface NteInventoryMasSnNte {
    id: NteInt8;
    serial_number: string;
    item_description: string;
    owner: NteInventoryEnumOwner;
    address: string | null;
    inventory_status: NteInventoryEnumInventoryStatus | null;
    condition_status: NteInventoryEnumConditionStatus | null;
    wo_number: string | null;
    inet_number: string | null;
    created_at: NteTimestamp | null;
    updated_at: NteTimestamp | null;
}

export interface NteInventoryLogTransactionNte {
    id: NteInt8;
    id_transaksi: string;
    serial_number: string;
    type_transaksi: NteInventoryEnumTypeTransaksi;
    asal: string | null;
    tujuan: string | null;
    create_at: NteTimestamp | null;
    create_by: string | null;
}

// Module augmentation — adds nte_inventory tables to the generated DB interface
declare module '@/lib/db/database.types' {
    interface DB {
        'nte_inventory.mas_item_nte': NteInventoryMasItemNte;
        'nte_inventory.mas_address_nte': NteInventoryMasAddressNte;
        'nte_inventory.mas_sn_nte': NteInventoryMasSnNte;
        'nte_inventory.log_transaction_nte': NteInventoryLogTransactionNte;
    }
}
