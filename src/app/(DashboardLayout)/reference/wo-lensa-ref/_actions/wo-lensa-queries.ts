'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface ScraperLastUpdateInfo {
    timestamp: string;
    action: 'system' | 'manual';
    resume_result: string;
}

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
    lastUpdate?: ScraperLastUpdateInfo | null;
}

export interface GetWOLensaListOptions {
    page?: number;
    pageSize?: number;
    warehouseFilter?: string;
    search?: string;
}

export async function getWOLensaList(options: GetWOLensaListOptions = {}) {
    const { page = 1, pageSize = 20, warehouseFilter, search } = options;

    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whNames: string[] = [];
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return {
                    success: true,
                    data: {
                        headers: [],
                        warehouses: [],
                        total: 0,
                        page,
                        pageSize,
                        totalPages: 0,
                        lastUpdate: null,
                    },
                };
            }
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

        // Hitung total data
        let countQuery = db
            .selectFrom('inventory.wo_lensa_header')
            .select((eb) => eb.fn.count('id').as('total'));

        if (filterWarehouse && filterWarehouse.length > 0) {
            countQuery = countQuery.where('nama_gudang', 'in', filterWarehouse);
        }

        if (search?.trim()) {
            const s = `%${search.trim()}%`;
            countQuery = countQuery.where((eb) =>
                eb.or([
                    eb(sql`CAST(pemakaian_id AS text)`, 'ilike', s),
                    eb('wo_number', 'ilike', s),
                    eb('gi_number', 'ilike', s),
                    eb('nik_pemakai', 'ilike', s),
                    eb('nama_gudang', 'ilike', s),
                    eb('wbs', 'ilike', s),
                    eb('type', 'ilike', s),
                ])
            );
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

        if (search?.trim()) {
            const s = `%${search.trim()}%`;
            headerQuery = headerQuery.where((eb) =>
                eb.or([
                    eb(sql`CAST(pemakaian_id AS text)`, 'ilike', s),
                    eb('wo_number', 'ilike', s),
                    eb('gi_number', 'ilike', s),
                    eb('nik_pemakai', 'ilike', s),
                    eb('nama_gudang', 'ilike', s),
                    eb('wbs', 'ilike', s),
                    eb('type', 'ilike', s),
                ])
            );
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

        // Sync rekon_check for any unflagged headers on the current page via dual-matching
        const unflaggedHeaders = headers.filter((h) => !h.rekon_check);
        if (unflaggedHeaders.length > 0) {
            const pIds = unflaggedHeaders
                .map((h) => (h.pemakaian_id ? String(h.pemakaian_id).trim() : ''))
                .filter(Boolean);
            const woNums = unflaggedHeaders
                .map((h) => (h.wo_number ? String(h.wo_number).trim() : ''))
                .filter(Boolean);

            if (pIds.length > 0 || woNums.length > 0) {
                let rekonQuery = db
                    .selectFrom('inventory.rekon_used_header')
                    .select(['id_pemakaian', 'wo_number']);

                if (pIds.length > 0 && woNums.length > 0) {
                    rekonQuery = rekonQuery.where((eb) =>
                        eb.or([eb('id_pemakaian', 'in', pIds), eb('wo_number', 'in', woNums)])
                    );
                } else if (pIds.length > 0) {
                    rekonQuery = rekonQuery.where('id_pemakaian', 'in', pIds);
                } else {
                    rekonQuery = rekonQuery.where('wo_number', 'in', woNums);
                }

                const matchedRekons = await rekonQuery.execute();
                if (matchedRekons.length > 0) {
                    const matchedPIds = new Set(
                        matchedRekons
                            .map((r) => r.id_pemakaian?.trim())
                            .filter((n): n is string => Boolean(n))
                    );
                    const matchedWos = new Set(
                        matchedRekons
                            .map((r) => r.wo_number?.trim())
                            .filter((n): n is string => Boolean(n))
                    );

                    const idsToUpdate = unflaggedHeaders
                        .filter((h) => {
                            const pId = h.pemakaian_id ? String(h.pemakaian_id).trim() : '';
                            const wo = h.wo_number ? String(h.wo_number).trim() : '';
                            const isPIdMatch = pId ? matchedPIds.has(pId) : false;
                            const isWoMatch = wo ? matchedWos.has(wo) : false;
                            return isPIdMatch || isWoMatch;
                        })
                        .map((h) => h.id);

                    if (idsToUpdate.length > 0) {
                        await db
                            .updateTable('inventory.wo_lensa_header')
                            .set({ rekon_check: true })
                            .where('id', 'in', idsToUpdate)
                            .execute();

                        for (const h of headers) {
                            if (idsToUpdate.includes(h.id)) {
                                h.rekon_check = true;
                            }
                        }
                    }
                }
            }
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

        const lastLog = await scraperLogRepository.getLatestLog('wo_lensa');
        const lastUpdate: ScraperLastUpdateInfo | null = lastLog
            ? {
                  timestamp: lastLog.timestamp.toISOString(),
                  action: lastLog.action,
                  resume_result: lastLog.resume_result,
              }
            : null;

        return {
            success: true,
            data: {
                headers: result,
                warehouses,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize) || 1,
                lastUpdate,
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
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { warehouses: [] };
            }
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
    if (isStaff) {
        if (warehouseIds.length === 0) {
            return [];
        }
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

export interface WOPemakaianOption {
    value: string;
    label: string;
    wo_number: string | null;
    nama_gudang: string | null;
    has_details: boolean;
}

export async function getWOPemakaianIdOptions(): Promise<{
    success: boolean;
    data?: WOPemakaianOption[];
    error?: string;
}> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whNames: string[] = [];
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, data: [] };
            }
            const allowedWhNames = await db
                .selectFrom('inventory.mas_wh')
                .select('name')
                .where('id', 'in', warehouseIds)
                .execute();
            whNames = expandWarehouseAliases(allowedWhNames.map((w) => w.name));
        }

        let query = db
            .selectFrom('inventory.wo_lensa_header as h')
            .leftJoin('inventory.wo_lensa_list as l', 'l.header_id', 'h.id')
            .select([
                'h.id',
                'h.pemakaian_id',
                'h.wo_number',
                'h.nama_gudang',
                sql<number>`count(l.id)`.as('item_count'),
            ])
            .where('h.pemakaian_id', 'is not', null)
            .groupBy(['h.id', 'h.pemakaian_id', 'h.wo_number', 'h.nama_gudang']);

        if (isStaff && whNames.length > 0) {
            query = query.where('h.nama_gudang', 'in', whNames);
        }

        // Prioritize headers with 0 items (missing details), then newest by id
        const rows = await query
            .orderBy(sql`count(l.id) ASC`)
            .orderBy('h.id', 'desc')
            .limit(300)
            .execute();

        const options: WOPemakaianOption[] = rows.map((r) => {
            const hasDetails = Number(r.item_count) > 0;
            const pid = String(r.pemakaian_id);
            const wo = r.wo_number ? `WO: ${r.wo_number}` : 'Tanpa No WO';
            const gd = r.nama_gudang ? ` (${r.nama_gudang})` : '';
            const status = hasDetails ? `[${r.item_count} item]` : '[Belum ada detail]';
            return {
                value: pid,
                label: `${pid} — ${wo}${gd} ${status}`,
                wo_number: r.wo_number,
                nama_gudang: r.nama_gudang,
                has_details: hasDetails,
            };
        });

        return { success: true, data: options };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal memuat opsi pemakaian ID',
        };
    }
}
