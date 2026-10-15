'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface WOLensaHeader {
    id: number | string;
    pemakaian_id: string | null;
    tanggal_update: string | null;
    formatted_date: string | Date | null;
    no_transaksi?: string | null;
    type: string | null;
    wo_number: string | null;
    nik_pemakai: string | null;
    nama_gudang: string | null;
    gi_number: string | null;
    wbs: string | null;
    rekon_check: boolean | null;
    materials?: WOLensaDetail[];
}

export interface WOLensaDetail {
    id?: number | string;
    header_id?: number | string | null;
    material_id: string | null;
    material_desc: string | null;
    uom: string | null;
    qty_pemakaian: number | null;
}

export interface PaginatedWOLensaResult {
    headers: WOLensaHeader[];
    warehouses: string[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface GetWOLensaListOptions {
    page?: number;
    pageSize?: number;
    warehouseFilter?: string;
}

export async function getWOLensaList(options: GetWOLensaListOptions = {}) {
    const { page = 1, pageSize = 20, warehouseFilter } = options;

    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whNames: string[] = [];
        if (isStaff && warehouseIds.length > 0) {
            const allowedWhNames = await db
                .selectFrom('inventory.mas_wh')
                .select('name')
                .where('id', 'in', warehouseIds as number[])
                .execute();

            whNames = expandWarehouseAliases(
                allowedWhNames.map((w: Record<string, unknown>) => w.name as string).filter(Boolean)
            );
        }

        if (isStaff && whNames.length === 0) {
            return {
                success: true,
                data: {
                    headers: [],
                    warehouses: [],
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0,
                },
            };
        }

        // Determine warehouse filter (staff warehouse list or custom filter)
        let filterWarehouse: string[] | undefined;
        if (warehouseFilter && warehouseFilter !== 'all') {
            filterWarehouse = expandWarehouseAliases(warehouseFilter);
        } else if (isStaff && whNames.length > 0) {
            filterWarehouse = whNames;
        }

        // Auto-update rekon_check: flag WO entries that have been submitted to rekon_used_header
        await sql`
            UPDATE inventory.wo_lensa_header wlh
            SET rekon_check = TRUE
            FROM inventory.rekon_used_header ruh
            WHERE CAST(wlh.pemakaian_id AS VARCHAR) = ruh.id_pemakaian
              AND (wlh.rekon_check IS FALSE OR wlh.rekon_check IS NULL)
        `.execute(db);

        // Hitung total data
        let countQuery = db
            .selectFrom('inventory.wo_lensa_header')
            .select((eb) => eb.fn.count('id').as('total'));

        if (filterWarehouse && filterWarehouse.length > 0) {
            countQuery = countQuery.where('nama_gudang', 'in', filterWarehouse);
        }

        const countResult = await countQuery.executeTakeFirst();
        const total = Number(countResult?.total ?? 0);

        let warehouseOptionsQuery = db
            .selectFrom('inventory.wo_lensa_header')
            .select('nama_gudang')
            .distinct()
            .orderBy('nama_gudang', 'asc');
        if (isStaff && whNames.length > 0) {
            warehouseOptionsQuery = warehouseOptionsQuery.where('nama_gudang', 'in', whNames);
        }
        const warehouseRows = await warehouseOptionsQuery.execute();
        const warehouses = Array.from(
            new Set(
                warehouseRows
                    .map((row) => row.nama_gudang)
                    .filter((name): name is string => Boolean(name))
            )
        );

        // Ambil data halaman aktif
        const offset = (page - 1) * pageSize;
        let headerQuery = db
            .selectFrom('inventory.wo_lensa_header')
            .selectAll()
            .orderBy('formatted_date', 'desc')
            .orderBy(sql<number>`pemakaian_id`, 'desc')
            .limit(pageSize)
            .offset(offset);

        if (filterWarehouse && filterWarehouse.length > 0) {
            headerQuery = headerQuery.where('nama_gudang', 'in', filterWarehouse);
        }

        const headers = await headerQuery.execute();

        if (headers.length === 0) {
            return {
                success: true,
                data: {
                    headers: [],
                    warehouses,
                    total,
                    page,
                    pageSize,
                    totalPages: Math.ceil(total / pageSize) || 1,
                },
            };
        }

        const headerIds = headers.map((h) => h.id);

        const details = await db
            .selectFrom('inventory.wo_lensa_list')
            .selectAll()
            .where('header_id', 'in', headerIds)
            .execute();

        const result: WOLensaHeader[] = headers.map((h) => ({
            ...h,
            id: String(h.id),
            pemakaian_id: h.pemakaian_id ? String(h.pemakaian_id) : null,
            materials: details.filter((d) => String(d.header_id) === String(h.id)),
        }));

        return {
            success: true,
            data: {
                headers: result,
                warehouses,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize) || 1,
            },
        };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function getWOLensaFilterOptions() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whQuery = db.selectFrom('inventory.mas_wh').select('name').orderBy('name', 'asc');
        if (isStaff && warehouseIds.length > 0) {
            whQuery = whQuery.where('id', 'in', warehouseIds as number[]);
        }
        const whs = await whQuery.execute();

        return {
            warehouses: whs.map((w) => w.name).filter(Boolean) as string[],
        };
    } catch {
        return { warehouses: [] };
    }
}

export async function getWOLensaRefList() {
    const { isStaff, warehouseIds } = await getSessionUser();

    let whNames: string[] = [];
    if (isStaff && warehouseIds.length > 0) {
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select('name')
            .where('id', 'in', warehouseIds)
            .execute();
        whNames = expandWarehouseAliases(
            whs.map((w: Record<string, unknown>) => w.name as string).filter(Boolean)
        );
    }

    if (isStaff && whNames.length === 0) {
        return [];
    }

    // Auto-update rekon_check: flag WO entries that have been submitted to rekon_used_header
    await sql`
        UPDATE inventory.wo_lensa_header wlh
        SET rekon_check = TRUE
        FROM inventory.rekon_used_header ruh
        WHERE CAST(wlh.pemakaian_id AS VARCHAR) = ruh.id_pemakaian
          AND (wlh.rekon_check IS FALSE OR wlh.rekon_check IS NULL)
    `.execute(db);

    let query = db
        .selectFrom('inventory.wo_lensa_header as wlh')
        .selectAll('wlh')
        .orderBy('wlh.formatted_date', 'desc')
        .orderBy(sql<number>`CAST(wlh.pemakaian_id AS BIGINT)`, 'desc');

    if (isStaff && whNames.length > 0) {
        query = query.where('wlh.nama_gudang', 'in', whNames);
    }

    const list = await query.execute();
    return list;
}

export async function getWOLensaRefDetails(headerId: number | string) {
    try {
        const details = await db
            .selectFrom('inventory.wo_lensa_list')
            .selectAll()
            .where('header_id', '=', String(headerId))
            .execute();

        return { success: true, data: details };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
