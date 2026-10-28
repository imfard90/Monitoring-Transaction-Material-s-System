'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface ScraperLastUpdateInfo {
    timestamp: string;
    action: 'system' | 'manual';
    resume_result: string;
}

export interface OutLensaHeader {
    id: string;
    reservation_id: string | null;
    tgl_entry: string | null;
    formatted_date: string | Date | null;
    nama_gudang: string | null;
    gi_number: string | null;
    status_proses: string | null;
    nik_pemakai: string | null;
    reservation_id_sap: string | null;
    sap_out_check: boolean | null;
    mitra: string | null;
    materials?: OutLensaDetail[];
}

export interface OutLensaDetail {
    id: string;
    header_id: string | null;
    material_id: string | null;
    material_desc: string | null;
    qty_approve: number | null;
    sap_out_matched: boolean | null;
}

export interface PaginatedOutLensaResult {
    headers: OutLensaHeader[];
    warehouses: string[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    lastUpdate?: ScraperLastUpdateInfo | null;
}

export interface GetOutLensaRefListOptions {
    page?: number;
    pageSize?: number;
    warehouseFilter?: string;
    search?: string;
}

export async function getOutLensaRefList(options: GetOutLensaRefListOptions = {}) {
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
                        page: 1,
                        pageSize,
                        totalPages: 0,
                        lastUpdate: null,
                    },
                };
            }
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select('name')
                .where('id', 'in', warehouseIds)
                .execute();
            whNames = expandWarehouseAliases(whs.map((w) => w.name as string).filter(Boolean));
        }

        if (isStaff && whNames.length === 0) {
            return {
                success: true,
                data: { headers: [], warehouses: [], total: 0, page: 1, pageSize, totalPages: 0 },
            };
        }

        // Determine warehouse filter (staff warehouse list or custom filter)
        let filterWarehouse: string[] | undefined;
        if (warehouseFilter && warehouseFilter !== 'all') {
            filterWarehouse = expandWarehouseAliases(warehouseFilter);
        } else if (isStaff && whNames.length > 0) {
            filterWarehouse = whNames;
        }


        // Get total count first
        let countQuery = db
            .selectFrom('inventory.out_lensa_ref_header')
            .select((eb) => eb.fn.count('id').as('total'));

        if (filterWarehouse) {
            countQuery = countQuery.where('nama_gudang', 'in', filterWarehouse);
        }

        if (search?.trim()) {
            const s = `%${search.trim()}%`;
            countQuery = countQuery.where((eb) =>
                eb.or([
                    eb('reservation_id', 'ilike', s),
                    eb('gi_number', 'ilike', s),
                    eb('nik_pemakai', 'ilike', s),
                    eb('reservation_id_sap', 'ilike', s),
                    eb('mitra', 'ilike', s),
                    eb('nama_gudang', 'ilike', s),
                ])
            );
        }

        const countResult = await countQuery.executeTakeFirst();
        const total = Number(countResult?.total ?? 0);

        let warehouseOptionsQuery = db
            .selectFrom('inventory.out_lensa_ref_header')
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

        // Fetch paginated headers
        let headerQuery = db
            .selectFrom('inventory.out_lensa_ref_header')
            .selectAll()
            .orderBy('formatted_date', 'desc')
            .limit(pageSize)
            .offset((page - 1) * pageSize);

        if (filterWarehouse) {
            headerQuery = headerQuery.where('nama_gudang', 'in', filterWarehouse);
        }

        if (search?.trim()) {
            const s = `%${search.trim()}%`;
            headerQuery = headerQuery.where((eb) =>
                eb.or([
                    eb('reservation_id', 'ilike', s),
                    eb('gi_number', 'ilike', s),
                    eb('nik_pemakai', 'ilike', s),
                    eb('reservation_id_sap', 'ilike', s),
                    eb('mitra', 'ilike', s),
                    eb('nama_gudang', 'ilike', s),
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
                    totalPages: Math.ceil(total / pageSize),
                },
            };
        }

        const headerIds = headers.map((h) => h.id as string);

        // Batch fetch details for all headers (fixes N+1 pattern)
        const details = await db
            .selectFrom('inventory.out_lensa_ref_list')
            .selectAll()
            .where('header_id', 'in', headerIds)
            .execute();

        // Get SAP out items for matching in one query
        const giNumbers = headers
            .map((h) => h.gi_number?.trim())
            .filter((n): n is string => Boolean(n));
        const reservationIds = headers
            .map((h) => h.reservation_id?.trim())
            .filter((n): n is string => Boolean(n));

        const sapOutMap: Map<string, { material_id: string; qty_req: number }[]> = new Map();
        if (giNumbers.length > 0 || reservationIds.length > 0) {
            let sapQuery = db
                .selectFrom('inventory.sap_out_header')
                .select(['id', 'sap_number', 'request_id']);

            if (giNumbers.length > 0 && reservationIds.length > 0) {
                sapQuery = sapQuery.where((eb) =>
                    eb.or([
                        eb('sap_number', 'in', giNumbers),
                        eb('request_id', 'in', reservationIds),
                    ])
                );
            } else if (giNumbers.length > 0) {
                sapQuery = sapQuery.where('sap_number', 'in', giNumbers);
            } else {
                sapQuery = sapQuery.where('request_id', 'in', reservationIds);
            }

            const sapHeaders = await sapQuery.execute();
            const sapHeaderIds = sapHeaders.map((sh) => sh.id);

            if (sapHeaderIds.length > 0) {
                const sapItems = await db
                    .selectFrom('inventory.sap_out_items as si')
                    .innerJoin('inventory.materials as m', 'm.id', 'si.designator_id')
                    .select(['si.header_id', 'm.code as material_id', 'si.qty_req'])
                    .where('si.header_id', 'in', sapHeaderIds)
                    .execute();

                const itemsByHeaderId = new Map<string, { material_id: string; qty_req: number }[]>();
                for (const item of sapItems) {
                    if (item.header_id) {
                        const headerKey = String(item.header_id);
                        const existing = itemsByHeaderId.get(headerKey) ?? [];
                        existing.push({
                            material_id: item.material_id ?? '',
                            qty_req: Number(item.qty_req),
                        });
                        itemsByHeaderId.set(headerKey, existing);
                    }
                }

                // Map by both trimmed sap_number and trimmed request_id
                for (const sh of sapHeaders) {
                    const items = itemsByHeaderId.get(String(sh.id)) ?? [];
                    if (sh.sap_number?.trim()) {
                        sapOutMap.set(sh.sap_number.trim(), items);
                    }
                    if (sh.request_id?.trim()) {
                        sapOutMap.set(sh.request_id.trim(), items);
                    }
                }
            }

            // Sync sap_out_check for any unflagged headers on the current page
            const matchedSapNumbers = new Set(
                sapHeaders.map((sh) => sh.sap_number?.trim()).filter((n): n is string => Boolean(n))
            );
            const matchedRequestIds = new Set(
                sapHeaders.map((sh) => sh.request_id?.trim()).filter((n): n is string => Boolean(n))
            );

            const unflaggedMatchedIds = headers
                .filter((h) => {
                    if (h.sap_out_check) return false;
                    const gi = h.gi_number?.trim();
                    const res = h.reservation_id?.trim();
                    const isGiMatch = gi ? matchedSapNumbers.has(gi) : false;
                    const isResMatch = res ? matchedRequestIds.has(res) : false;
                    return isGiMatch || isResMatch;
                })
                .map((h) => h.id);

            if (unflaggedMatchedIds.length > 0) {
                await db
                    .updateTable('inventory.out_lensa_ref_header')
                    .set({ sap_out_check: true })
                    .where('id', 'in', unflaggedMatchedIds)
                    .execute();
            }
        }

        // Build result with materials attached
        const result: OutLensaHeader[] = headers.map((h) => {
            const headerDetails = details.filter((d) => d.header_id === h.id);

            // Match with SAP out items
            const matchedDetails: OutLensaDetail[] = headerDetails.map((d) => {
                let sap_out_matched: boolean | null = null;
                const sapItems = (h.gi_number ? sapOutMap.get(h.gi_number.trim()) : undefined)
                    ?? (h.reservation_id ? sapOutMap.get(h.reservation_id.trim()) : undefined);
                if (sapItems && sapItems.length > 0) {
                    const sapItem = sapItems.find(
                        (si) =>
                            si.material_id === d.material_id && si.qty_req === Number(d.qty_approve)
                    );
                    if (sapItem) sap_out_matched = true;
                }
                return {
                    id: String(d.id),
                    header_id: d.header_id,
                    material_id: d.material_id,
                    material_desc: d.material_desc,
                    qty_approve: d.qty_approve ? Number(d.qty_approve) : null,
                    sap_out_matched,
                };
            });

            const gi = h.gi_number?.trim();
            const res = h.reservation_id?.trim();
            const hasMatchedSap = Boolean(
                (gi && sapOutMap.has(gi)) || (res && sapOutMap.has(res))
            );
            const isSapOutCheck = Boolean(h.sap_out_check || hasMatchedSap);

            return {
                id: String(h.id),
                reservation_id: h.reservation_id,
                tgl_entry: h.tgl_entry,
                formatted_date: h.formatted_date,
                nama_gudang: h.nama_gudang,
                gi_number: h.gi_number,
                status_proses: h.status_proses,
                nik_pemakai: h.nik_pemakai,
                reservation_id_sap: h.reservation_id_sap,
                sap_out_check: isSapOutCheck,
                mitra: h.mitra,
                materials: matchedDetails,
            };
        });

        const lastLog = await scraperLogRepository.getLatestLog('out_lensa');
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
                totalPages: Math.ceil(total / pageSize),
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

export async function getOutLensaFilterOptions() {
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
            warehouses: whs.map((w) => w.name as string).filter(Boolean),
        };
    } catch {
        return { warehouses: [] };
    }
}

export async function checkScrapingStatus(jobId: string) {
    const data = await redis.get(`job:${jobId}`);
    if (!data) return { status: 'not_found' };

    const parsed = JSON.parse(data);
    if (parsed.status === 'success') {
        revalidatePath('/reference/out-lensa-ref');
        revalidatePath('/form/out-sap');
    }
    return parsed;
}

export async function getOutLensaRefDetails(headerId: string) {
    try {
        const details = await db
            .selectFrom('inventory.out_lensa_ref_list')
            .selectAll()
            .where('header_id', '=', headerId)
            .execute();

        const header = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .select(['gi_number', 'reservation_id'])
            .where('id', '=', headerId)
            .executeTakeFirst();

        let sapItems: { material_id: string; qty_req: number }[] = [];
        const giNum = header?.gi_number?.trim();
        const resId = header?.reservation_id?.trim();
        if (giNum || resId) {
            let sapHeaderQuery = db
                .selectFrom('inventory.sap_out_header')
                .select(['id']);

            if (giNum && resId) {
                sapHeaderQuery = sapHeaderQuery.where((eb) =>
                    eb.or([
                        eb('sap_number', '=', giNum),
                        eb('request_id', '=', resId),
                    ])
                );
            } else if (giNum) {
                sapHeaderQuery = sapHeaderQuery.where('sap_number', '=', giNum);
            } else if (resId) {
                sapHeaderQuery = sapHeaderQuery.where('request_id', '=', resId);
            }

            const sapHeader = await sapHeaderQuery.executeTakeFirst();

            if (sapHeader) {
                const rawSapItems = await db
                    .selectFrom('inventory.sap_out_items as si')
                    .innerJoin('inventory.materials as m', 'm.id', 'si.designator_id')
                    .select(['m.code as material_id', 'si.qty_req'])
                    .where('si.header_id', '=', sapHeader.id)
                    .execute();
                sapItems = rawSapItems.map((si) => ({
                    material_id: si.material_id ?? '',
                    qty_req: Number(si.qty_req),
                }));
            }
        }

        const data: OutLensaDetail[] = details.map((d) => {
            let matched = false;
            if (sapItems.length > 0) {
                const sapItem = sapItems.find(
                    (si) => si.material_id === d.material_id && si.qty_req === Number(d.qty_approve)
                );
                if (sapItem) matched = true;
            }
            return {
                id: String(d.id),
                header_id: d.header_id,
                material_id: d.material_id,
                material_desc: d.material_desc,
                qty_approve: d.qty_approve ? Number(d.qty_approve) : null,
                sap_out_matched: matched,
            };
        });

        return { success: true, data };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
