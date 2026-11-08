/** Address option row from `listAddresses`. */
export type NteAddressRow = {
    address_name: string;
    owner: string;
    ui_label: string;
    check_sn: boolean;
    is_active: boolean;
};

/** Item option row from `listItems`. */
export type NteItemRow = {
    id: string;
    item_description: string;
    type: string;
    merek: string;
};

/**
 * NTE Repository — stored procedure wrappers + read queries.
 * Mutations go through stored procedures.
 * Reads use raw SQL to avoid Kysely module-augmentation complexity.
 */

import type { Kysely } from 'kysely';
import { type RawBuilder, sql } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import '@/lib/db/database.types.nte';
import { db } from '@/lib/db/db';

export type CreateTagParams = {
    /** Warehouse address_name asal */
    asal: string;
    /** Warehouse address_name tujuan */
    tujuan: string;
    /**
     * SN list format depending on TAG subtype (§4.1 bispro-nte.md):
     * - Inter-SO / Dari-SO: string[] e.g. ["SN001", "SN002"]
     * - Ke-SO: Array<{serial_number, item_description}>
     */
    snList: string[] | Array<{ serial_number: string; item_description: string }>;
    createdBy: string;
};

export type ApproveTagParams = {
    idTransaksi: string;
    approvedBy: string;
    warehouseId: number | null; // NULL for non-Staff, warehouse_id for Staff
};

export type RejectTagParams = {
    idTransaksi: string;
    rejectedBy: string;
    warehouseId: number | null;
    notes?: string;
};

export type SetInstallParams = {
    woNumber: string;
    inetNumber: string;
    snList: string[];
    createdBy: string;
};

export type ReturnNteParams = {
    nikTeknisi: string;
    tujuan: string;
    snList: string[];
    createdBy: string;
};

/** Row shape of `listNteTags` (one row per transaction, `total_count` is the window total). */
export type NteTagRow = {
    id_transaksi: string;
    type_transaksi: string;
    asal: string | null;
    tujuan: string | null;
    status: string | null;
    created_at: string;
    created_by_name: string | null;
    total_count: string;
    sn_count: string;
};

/** Row shape of `listNteInventory` (one row per SN). */
export type NteInventoryRow = {
    serial_number: string;
    item_description: string | null;
    inventory_status: string | null;
    condition_status: string | null;
    owner: string | null;
    address: string | null;
    item_type: string | null;
    item_merek: string | null;
    total_count: string;
};

export const createNteRepository = (_db: Kysely<DB>) => ({
    createTagNte: (params: CreateTagParams) =>
        sql`CALL nte_inventory.sp_create_tag_nte(
      ${params.asal}::varchar,
      ${params.tujuan}::varchar,
      ${JSON.stringify(params.snList)}::jsonb,
      ${params.createdBy}::varchar,
      NULL
    )`.execute(_db),

    approveTag: (params: ApproveTagParams) =>
        sql`CALL nte_inventory.sp_approve_nte_tag(
      ${params.idTransaksi}::varchar,
      ${params.approvedBy}::varchar,
      ${params.warehouseId}::integer
    )`.execute(_db),

    rejectTag: (params: RejectTagParams) =>
        sql`CALL nte_inventory.sp_reject_nte_tag(
      ${params.idTransaksi}::varchar,
      ${params.rejectedBy}::varchar,
      ${params.warehouseId}::integer,
      ${params.notes ?? null}::text
    )`.execute(_db),

    setInstallNte: (params: SetInstallParams) =>
        sql`CALL nte_inventory.sp_set_install_nte(
      ${params.woNumber}::varchar,
      ${params.inetNumber}::varchar,
      ${JSON.stringify(params.snList)}::jsonb,
      ${params.createdBy}::varchar,
      NULL
    )`.execute(_db),

    returnNte: (params: ReturnNteParams) =>
        sql`CALL nte_inventory.sp_return_nte(
      ${params.nikTeknisi}::varchar,
      ${params.tujuan}::varchar,
      ${JSON.stringify(params.snList)}::jsonb,
      ${params.createdBy}::varchar,
      NULL
    )`.execute(_db),

    listNteTags: (params: {
        search?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }) => {
        const conditions: RawBuilder<unknown>[] = [sql`h.type_transaksi = 'stock_transfer'`];
        const limit = params.limit ?? 50;
        const offset = params.offset ?? 0;

        if (params.search) conditions.push(sql`h.id_transaksi ILIKE ${`%${params.search}%`}`);
        if (params.startDate) conditions.push(sql`h.created_at >= ${params.startDate}`);
        if (params.endDate) conditions.push(sql`h.created_at <= ${params.endDate}`);

        return sql<NteTagRow>`
            SELECT h.id_transaksi, h.type_transaksi, h.asal, h.tujuan, h.status,
                   h.created_at, emp.nama AS created_by_name,
                   COUNT(*) OVER() AS total_count, COUNT(i.id) AS sn_count
            FROM nte_inventory.log_transaction_header h
            LEFT JOIN nte_inventory.log_transaction_items i ON i.id_transaksi = h.id_transaksi
            LEFT JOIN hr.employees emp ON emp.nik = h.created_by
            WHERE ${sql.join(conditions, sql` AND `)}
            GROUP BY h.id_transaksi, h.type_transaksi, h.asal, h.tujuan, h.status,
                     h.created_at, emp.nama
            ORDER BY h.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `.execute(_db);
    },

    getNteTagDetail: (idTransaksi: string) =>
        sql`
            SELECT h.id_transaksi, h.type_transaksi, h.asal, h.tujuan, h.status,
                   h.created_at, h.updated_at, h.notes, h.created_by,
                   emp.nama AS created_by_name, i.serial_number,
                   COALESCE(i.item_description, sn.item_description) AS item_description,
                   sn.inventory_status, sn.condition_status,
                   item.type AS item_type, item.merek AS item_merek
            FROM nte_inventory.log_transaction_header h
            LEFT JOIN nte_inventory.log_transaction_items i ON i.id_transaksi = h.id_transaksi
            LEFT JOIN hr.employees emp ON emp.nik = h.created_by
            LEFT JOIN nte_inventory.mas_sn_nte sn ON sn.serial_number = i.serial_number
            LEFT JOIN nte_inventory.mas_item_nte item
              ON item.item_description = COALESCE(i.item_description, sn.item_description)
            WHERE h.id_transaksi = ${idTransaksi}
            ORDER BY i.id
        `.execute(_db),

    getStockSummary: (params: { warehouseIds: number[] | null; limit: number; offset: number }) =>
        // Window total must wrap the grouped rows so pagination counts groups, not SNs.
        sql<{
            branch: string;
            gudang: string;
            owner: string;
            type: string;
            merek: string;
            type_sn: string;
            jumlah: string;
            total_count: string;
        }>`
            WITH grouped_stock AS (
                SELECT w.branch AS branch, w.name AS gudang, sn.owner::text AS owner,
                       item.type, item.merek, item.type_sn, COUNT(*)::text AS jumlah
                FROM nte_inventory.mas_sn_nte sn
                JOIN nte_inventory.mas_address_nte address ON address.address_name = sn.address
                JOIN inventory.mas_wh w ON w.id = address.mapping_mas_wh
                JOIN nte_inventory.mas_item_nte item ON item.item_description = sn.item_description
                WHERE sn.inventory_status = 'available'
                  AND (${params.warehouseIds}::integer[] IS NULL OR w.id = ANY(${params.warehouseIds}::integer[]))
                GROUP BY w.branch, w.name, sn.owner, item.type, item.merek, item.type_sn
            )
            SELECT *, COUNT(*) OVER()::text AS total_count
            FROM grouped_stock
            ORDER BY branch, gudang, owner, type, merek, type_sn
            LIMIT ${params.limit} OFFSET ${params.offset}
        `.execute(_db),

    listNteInventory: (params: {
        search?: string;
        inventoryStatus?: string;
        owner?: string;
        limit?: number;
        offset?: number;
    }) => {
        const conditions: RawBuilder<unknown>[] = [];
        const limit = params.limit ?? 100;
        const offset = params.offset ?? 0;

        if (params.search) {
            conditions.push(
                sql`(sn.serial_number ILIKE ${`%${params.search}%`} OR sn.item_description ILIKE ${`%${params.search}%`})`
            );
        }
        if (params.inventoryStatus)
            conditions.push(sql`sn.inventory_status = ${params.inventoryStatus}`);
        if (params.owner) conditions.push(sql`sn.owner = ${params.owner}`);
        const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        return sql<NteInventoryRow>`
            SELECT sn.serial_number, sn.item_description, sn.inventory_status,
                   sn.condition_status, sn.owner, sn.address,
                   item.type AS item_type, item.merek AS item_merek,
                   COUNT(*) OVER() AS total_count
            FROM nte_inventory.mas_sn_nte sn
            LEFT JOIN nte_inventory.mas_item_nte item ON item.item_description = sn.item_description
            ${where}
            ORDER BY sn.serial_number
            LIMIT ${limit} OFFSET ${offset}
        `.execute(_db);
    },

    listAddresses: (owner?: string) => {
        const query = sql<NteAddressRow>`
            SELECT address_name, owner, ui_label, check_sn, is_active
            FROM nte_inventory.mas_address_nte
            WHERE is_active = true ${owner ? sql`AND owner = ${owner}` : sql``}
            ORDER BY ui_label
        `;
        return query.execute(_db);
    },

    listItems: () =>
        sql<NteItemRow>`
        SELECT id, item_description, type, merek
        FROM nte_inventory.mas_item_nte
        WHERE is_active = true
        ORDER BY type, merek, type_sn
    `.execute(_db),

    listTechnicians: () =>
        sql`
        SELECT t.nik, t.name, m.mitra_name
        FROM hr.technicians t
        LEFT JOIN hr.mitras m ON m.id = t.mitra_id
        WHERE t.is_active = true
        ORDER BY t.name
    `.execute(_db),

    listTags: (params: {
        search?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }) => {
        const limit = params.limit ?? 50;
        const offset = params.offset ?? 0;
        const conditions: RawBuilder<unknown>[] = [];

        if (params.search) {
            conditions.push(sql`h.id_transaksi ILIKE ${`%${params.search}%`}`);
        }
        if (params.startDate) {
            conditions.push(sql`h.created_at >= ${params.startDate}`);
        }
        if (params.endDate) {
            const end = new Date(params.endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(sql`h.created_at <= ${end}`);
        }

        const where =
            conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        return sql<
            {
                id_transaksi: string;
                type_transaksi: string;
                asal: string;
                tujuan: string;
                status: string;
                created_at: Date;
                created_by_name: string | null;
                total_count: string;
                sn_count: string;
            }[]
        >`
      SELECT
        h.id_transaksi,
        h.type_transaksi,
        h.asal,
        h.tujuan,
        h.status,
        h.created_at,
        emp.nama AS created_by_name,
        COUNT(*) OVER() AS total_count,
        COUNT(i.id) AS sn_count
      FROM nte_inventory.log_transaction_header h
      LEFT JOIN nte_inventory.log_transaction_items i ON i.id_transaksi = h.id_transaksi
      LEFT JOIN hr.employees emp ON emp.nik = h.created_by
      ${where}
      GROUP BY h.id_transaksi, h.type_transaksi, h.asal, h.tujuan, h.status, h.created_at, emp.nama
      ORDER BY h.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(_db);
    },

    getTagDetail: (idTransaksi: string) =>
        sql<
            {
                id_transaksi: string;
                type_transaksi: string;
                asal: string;
                tujuan: string;
                status: string;
                created_at: Date;
                updated_at: Date;
                notes: string | null;
                created_by: string;
                created_by_name: string | null;
                serial_number: string;
                item_description: string | null;
                inventory_status: string | null;
                condition_status: string | null;
                item_type: string | null;
                item_merek: string | null;
            }[]
        >`
      SELECT
        h.id_transaksi,
        h.type_transaksi,
        h.asal,
        h.tujuan,
        h.status,
        h.created_at,
        h.updated_at,
        h.notes,
        h.created_by,
        emp.nama AS created_by_name,
        i.serial_number,
        COALESCE(i.item_description, sn.item_description) AS item_description,
        sn.inventory_status,
        sn.condition_status,
        item.type AS item_type,
        item.merek AS item_merek
      FROM nte_inventory.log_transaction_header h
      LEFT JOIN nte_inventory.log_transaction_items i ON i.id_transaksi = h.id_transaksi
      LEFT JOIN hr.employees emp ON emp.nik = h.created_by
      LEFT JOIN nte_inventory.mas_sn_nte sn ON sn.serial_number = i.serial_number
      LEFT JOIN nte_inventory.mas_item_nte item ON item.item_description = COALESCE(i.item_description, sn.item_description)
      WHERE h.id_transaksi = ${idTransaksi}
      ORDER BY i.id
    `.execute(_db),

    listInstalls: (params: {
        search?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }) => {
        const limit = params.limit ?? 50;
        const offset = params.offset ?? 0;
        const conditions: RawBuilder<unknown>[] = [];

        if (params.search) {
            conditions.push(
                sql`(h.id_transaksi ILIKE ${`%${params.search}%`} OR h.wo_number ILIKE ${`%${params.search}%`} OR h.inet_number ILIKE ${`%${params.search}%`})`
            );
        }
        if (params.startDate) {
            conditions.push(sql`h.created_at >= ${params.startDate}`);
        }
        if (params.endDate) {
            const end = new Date(params.endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(sql`h.created_at <= ${end}`);
        }

        const where =
            conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        return sql<
            {
                id_transaksi: string;
                wo_number: string;
                inet_number: string;
                status: string;
                created_at: Date;
                created_by_name: string | null;
                total_count: string;
                sn_count: string;
            }[]
        >`
      SELECT
        h.id_transaksi,
        h.wo_number,
        h.inet_number,
        h.status,
        h.created_at,
        emp.nama AS created_by_name,
        COUNT(*) OVER() AS total_count,
        COUNT(i.id) AS sn_count
      FROM nte_inventory.log_install_header h
      LEFT JOIN nte_inventory.log_install_items i ON i.id_transaksi = h.id_transaksi
      LEFT JOIN hr.employees emp ON emp.nik = h.created_by
      ${where}
      GROUP BY h.id_transaksi, h.wo_number, h.inet_number, h.status, h.created_at, emp.nama
      ORDER BY h.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(_db);
    },

    listReturns: (params: {
        search?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }) => {
        const limit = params.limit ?? 50;
        const offset = params.offset ?? 0;
        const conditions: RawBuilder<unknown>[] = [];

        if (params.search) {
            conditions.push(
                sql`(h.id_transaksi ILIKE ${`%${params.search}%`} OR h.nik_teknisi ILIKE ${`%${params.search}%`})`
            );
        }
        if (params.startDate) {
            conditions.push(sql`h.created_at >= ${params.startDate}`);
        }
        if (params.endDate) {
            const end = new Date(params.endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(sql`h.created_at <= ${end}`);
        }

        const where =
            conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        return sql<
            {
                id_transaksi: string;
                nik_teknisi: string;
                tujuan: string;
                status: string;
                created_at: Date;
                created_by_name: string | null;
                total_count: string;
                sn_count: string;
            }[]
        >`
      SELECT
        h.id_transaksi,
        h.nik_teknisi,
        h.tujuan,
        h.status,
        h.created_at,
        emp.nama AS created_by_name,
        COUNT(*) OVER() AS total_count,
        COUNT(i.id) AS sn_count
      FROM nte_inventory.log_return_header h
      LEFT JOIN nte_inventory.log_return_items i ON i.id_transaksi = h.id_transaksi
      LEFT JOIN hr.employees emp ON emp.nik = h.created_by
      ${where}
      GROUP BY h.id_transaksi, h.nik_teknisi, h.tujuan, h.status, h.created_at, emp.nama
      ORDER BY h.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(_db);
    },

    getSnHistory: (serialNumber: string, limit?: number) =>
        sql<
            {
                id_transaksi: string;
                serial_number: string;
                type_transaksi: string;
                asal: string;
                tujuan: string;
                status: string;
                created_at: Date;
                created_by_name: string | null;
                item_description: string | null;
                inventory_status: string | null;
                condition_status: string | null;
            }[]
        >`
      SELECT
        h.id_transaksi,
        i.serial_number,
        h.type_transaksi,
        h.asal,
        h.tujuan,
        h.status,
        h.created_at,
        emp.nama AS created_by_name,
        COALESCE(i.item_description, sn.item_description) AS item_description,
        sn.inventory_status,
        sn.condition_status
      FROM nte_inventory.log_transaction_items i
      JOIN nte_inventory.log_transaction_header h ON h.id_transaksi = i.id_transaksi
      LEFT JOIN hr.employees emp ON emp.nik = h.created_by
      LEFT JOIN nte_inventory.mas_sn_nte sn ON sn.serial_number = i.serial_number
      WHERE i.serial_number = ${serialNumber}
      ORDER BY h.created_at DESC
      LIMIT ${limit ?? 100}
    `.execute(_db),

    listInventory: (params: {
        search?: string;
        inventoryStatus?: string;
        owner?: string;
        limit?: number;
        offset?: number;
    }) => {
        const limit = params.limit ?? 100;
        const offset = params.offset ?? 0;
        const conditions: RawBuilder<unknown>[] = [];

        if (params.search) {
            conditions.push(
                sql`(sn.serial_number ILIKE ${`%${params.search}%`} OR item.item_description ILIKE ${`%${params.search}%`})`
            );
        }
        if (params.inventoryStatus) {
            conditions.push(sql`sn.inventory_status = ${params.inventoryStatus}`);
        }
        if (params.owner) {
            conditions.push(sql`sn.owner = ${params.owner}`);
        }

        const where =
            conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        return sql`
      SELECT
        sn.serial_number,
        sn.item_description,
        sn.inventory_status,
        sn.condition_status,
        sn.owner,
        sn.address,
        item.type AS item_type,
        item.merek AS item_merek,
        COUNT(*) OVER() AS total_count
      FROM nte_inventory.mas_sn_nte sn
      LEFT JOIN nte_inventory.mas_item_nte item ON item.item_description = sn.item_description
      ${where}
      ORDER BY sn.serial_number
      LIMIT ${limit} OFFSET ${offset}
    `.execute(_db);
    },

    getAddressByName: (addressName: string) =>
        sql`
      SELECT address_name, is_active, mapping_mas_wh
      FROM nte_inventory.mas_address_nte
      WHERE address_name = ${addressName}
    `.execute(_db),

    listAddressWarehouseMappings: () =>
        sql`
        SELECT address_name, owner, ui_label, mapping_mas_wh
        FROM nte_inventory.mas_address_nte
        ORDER BY ui_label
    `.execute(_db),

    listInventoryWarehouses: () =>
        sql`
        SELECT id, name
        FROM inventory.mas_wh
        ORDER BY name
    `.execute(_db),

    getInventoryWarehouse: (warehouseId: number) =>
        sql`
        SELECT id, name
        FROM inventory.mas_wh
        WHERE id = ${warehouseId}
    `.execute(_db),

    updateAddressWarehouseMapping: (addressName: string, warehouseId: number | null) =>
        sql`
        UPDATE nte_inventory.mas_address_nte
        SET mapping_mas_wh = ${warehouseId}
        WHERE address_name = ${addressName}
    `.execute(_db),

    getAddressWarehouseMapping: (addressName: string) =>
        sql<{ address_name: string; mapping_mas_wh: number | null }>`
      SELECT address_name, mapping_mas_wh
      FROM nte_inventory.mas_address_nte
      WHERE address_name = ${addressName}
    `.execute(_db),
});

export const nteRepository = createNteRepository(db);
