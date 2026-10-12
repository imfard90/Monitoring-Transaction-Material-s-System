'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface WOLensaHeader {
    id: number | string;
    tanggal_update: string | null;
    no_transaksi: string | null;
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

        let baseQuery = db.selectFrom('inventory.wo_lensa_header').selectAll();

        // P0-A1: Staff must be scoped to their assigned warehouses
        if (isStaff && warehouseIds.length > 0) {
            const allowedWhNames = await db
                .selectFrom('inventory.mas_wh')
                .select('name')
                .where('id', 'in', warehouseIds)
                .execute();

            const expandedNames = allowedWhNames.flatMap((w) =>
                w.name ? expandWarehouseAliases(w.name) : []
            );

            if (expandedNames.length > 0) {
                baseQuery = baseQuery.where('nama_gudang', 'in', expandedNames);
            }
        }

        if (warehouseFilter && warehouseFilter !== 'all') {
            const filterExpanded = expandWarehouseAliases(warehouseFilter);
            baseQuery = baseQuery.where('nama_gudang', 'in', filterExpanded);
        }

        // Hitung total data
        const countResult = await baseQuery
            .select(sql<number>`count(*)::int`.as('total'))
            .executeTakeFirst();
        const total = countResult?.total ?? 0;

        // Ambil data halaman aktif
        const offset = (page - 1) * pageSize;
        const headers = await baseQuery
            .selectAll()
            .orderBy('tanggal_update', 'desc')
            .limit(pageSize)
            .offset(offset)
            .execute();

        if (headers.length === 0) {
            return {
                success: true,
                data: {
                    headers: [],
                    total,
                    page,
                    pageSize,
                    totalPages: Math.ceil(total / pageSize),
                },
            };
        }

        const headerIds = headers.map((h) => h.id);

        const details = await db
            .selectFrom('inventory.wo_lensa_list')
            .selectAll()
            .where('header_id', 'in', headerIds)
            .execute();

        const result = headers.map((h) => ({
            ...h,
            materials: details.filter((d) => String(d.header_id) === String(h.id)),
        }));

        return {
            success: true,
            data: {
                headers: result,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
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
