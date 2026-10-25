'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { decryptLensaPassword } from '@/lib/crypto/decrypt-lensa';
import { db } from '@/lib/db/db';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { scrapeStockTeknisi } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { warehouseScope } from '@/lib/policies';

const NikParamSchema = z.string().trim().min(1, 'NIK teknisi wajib diisi');

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

interface CachedLensaStock {
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

interface TeknisiRow {
    nik: string;
    name: string;
    wh_id: number | null;
    ref_intech_lensa: unknown;
    branch: string | null;
    service_area: string | null;
    warehouse_name: string | null;
}

/**
 * Resolve Lensa credentials for a warehouse — PIC 1 first, fallback PIC 2.
 */
async function resolveLensaCredentials(
    whId: number
): Promise<{ username: string; password: string } | null> {
    const wh = await db
        .selectFrom('inventory.mas_wh')
        .select(['pic_1', 'pic_2'])
        .where('id', '=', whId)
        .executeTakeFirst();

    if (!wh) return null;

    for (const picNik of [wh.pic_1, wh.pic_2]) {
        if (!picNik) continue;

        const picUser = await db
            .selectFrom('auth.user')
            .select([
                sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
            ])
            .where('nik', '=', picNik)
            .executeTakeFirst();

        if (picUser?.lensa_username && picUser?.lensa_password) {
            try {
                return {
                    username: picUser.lensa_username,
                    password: decryptLensaPassword(picUser.lensa_password),
                };
            } catch (error) {
                actionLogger.error(
                    `Failed to decrypt Lensa password for PIC ${picNik}:`,
                    error instanceof Error ? error : new Error(String(error))
                );
            }
        }
    }

    return null;
}

/**
 * Get list teknisi with cached Intech Lensa scraping status.
 * Staff scoped by warehouse assignment; non-staff sees all.
 */
export async function getTeknisiStockList(): Promise<{
    success: boolean;
    data?: TeknisiStockListItem[];
    error?: string;
}> {
    try {
        const user = await getSessionUser();
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');

        let query = db
            .selectFrom('hr.technicians as t')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 't.wh_id')
            .leftJoin('hr.branches as b', 'b.id', 't.branch_id')
            .select([
                't.nik',
                't.name',
                't.wh_id',
                't.ref_intech_lensa',
                'b.branch',
                'b.service_area',
                'wh.name as warehouse_name',
            ])
            .orderBy('t.name', 'asc');

        if (user.isStaff) {
            if (!scopedWarehouseIds || scopedWarehouseIds.length === 0) {
                return { success: true, data: [] };
            }
            query = query.where('t.wh_id', 'in', scopedWarehouseIds);
        }

        const rows = (await query.execute()) as TeknisiRow[];

        const niks = rows.map((r) => r.nik).filter(Boolean);
        const mtmsStockRows =
            niks.length > 0
                ? await inventoryRepository.getBatchTechnicianIntechStock(niks)
                : [];

        const mtmsStockByNik = new Map<string, Map<string, number>>();
        for (const row of mtmsStockRows) {
            if (!row.nik_teknisi || !row.material_code) continue;
            let techMap = mtmsStockByNik.get(row.nik_teknisi);
            if (!techMap) {
                techMap = new Map();
                mtmsStockByNik.set(row.nik_teknisi, techMap);
            }
            techMap.set(row.material_code, Number(row.qty_intech ?? 0));
        }

        const items: TeknisiStockListItem[] = rows.map((row) => {
            const cached = row.ref_intech_lensa as CachedLensaStock | null;

            let status: TeknisiStockListItem['status'] = 'not_scraped';
            let totalMaterials = 0;
            let totalSelisih: number | null = null;

            if (cached?.status === 'failed') {
                status = 'failed';
            } else if (cached?.status === 'success' && cached.materials) {
                totalMaterials = cached.materials.length;
                const techMtmsMap = mtmsStockByNik.get(row.nik) ?? new Map<string, number>();

                const lensMap = new Map<string, number>();
                for (const material of cached.materials) {
                    lensMap.set(
                        material.id_material,
                        Number.parseInt(material.stock_teknisi, 10) || 0
                    );
                }

                const allCodes = new Set([...lensMap.keys(), ...techMtmsMap.keys()]);
                let diffCount = 0;
                for (const code of allCodes) {
                    const lQty = lensMap.get(code) ?? 0;
                    const mQty = techMtmsMap.get(code) ?? 0;
                    if (lQty !== mQty) {
                        diffCount++;
                    }
                }

                totalSelisih = diffCount;
                status = diffCount === 0 ? 'match' : 'selisih';
            }

            return {
                nik: row.nik,
                nama: row.name,
                branch: row.branch,
                service_area: row.service_area,
                warehouse_name: row.warehouse_name,
                status,
                scraped_at: cached?.scraped_at ?? null,
                total_materials: totalMaterials,
                total_selisih: totalSelisih,
            };
        });

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch teknisi stock list:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal memuat daftar teknisi',
        };
    }
}

/**
 * Get comparison detail from cached `ref_intech_lensa` (no live scraping).
 */
export async function getStockComparison(nik: string): Promise<{
    success: boolean;
    data?: StockComparisonResult;
    error?: string;
}> {
    try {
        const parsedNik = NikParamSchema.safeParse(nik);
        if (!parsedNik.success) {
            return { success: false, error: parsedNik.error.issues[0]?.message ?? 'NIK tidak valid' };
        }
        const validNik = parsedNik.data;

        const user = await getSessionUser();
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');

        const teknisi = await db
            .selectFrom('hr.technicians as t')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 't.wh_id')
            .leftJoin('hr.branches as b', 'b.id', 't.branch_id')
            .select([
                't.nik',
                't.name',
                't.wh_id',
                't.ref_intech_lensa',
                'b.branch',
                'b.service_area',
                'wh.name as warehouse_name',
            ])
            .where('t.nik', '=', validNik)
            .executeTakeFirst();

        if (!teknisi) {
            return { success: false, error: 'Teknisi tidak ditemukan' };
        }

        // Enforce warehouse scoping for staff
        if (user.isStaff) {
            if (
                !teknisi.wh_id ||
                !scopedWarehouseIds ||
                !scopedWarehouseIds.includes(teknisi.wh_id)
            ) {
                return {
                    success: false,
                    error: 'Akses ditolak: teknisi bukan di gudang Anda',
                };
            }
        }

        const cached = teknisi.ref_intech_lensa as CachedLensaStock | null;
        if (!cached || cached.status !== 'success' || !cached.materials) {
            return {
                success: false,
                error: 'Data belum tersedia. Jalankan scraping terlebih dahulu.',
            };
        }

        // MTMS stock: outstanding SAP out items in 'intech' status via inventoryRepository
        const mtmsRows = await inventoryRepository.getTechnicianIntechStock(validNik);

        const mtmsMap = new Map<string, { name: string; qty: number }>();
        for (const row of mtmsRows) {
            if (!row.material_code) continue;
            mtmsMap.set(row.material_code, {
                name: row.material_name ?? '',
                qty: Number(row.qty_intech ?? 0),
            });
        }

        const lensMap = new Map<string, { name: string; qty: number; satuan: string | null }>();
        for (const material of cached.materials) {
            lensMap.set(material.id_material, {
                name: material.nama_material,
                qty: Number.parseInt(material.stock_teknisi, 10) || 0,
                satuan: material.satuan ?? null,
            });
        }

        const materialCodes = Array.from(new Set([...lensMap.keys(), ...mtmsMap.keys()])).sort();

        const items: StockComparisonItem[] = materialCodes.map((code) => {
            const lens = lensMap.get(code);
            const mtms = mtmsMap.get(code);
            const lensQty = lens?.qty ?? 0;
            const mtmsQty = mtms?.qty ?? 0;
            const selisih = lensQty - mtmsQty;

            return {
                id_material: code,
                nama_material: lens?.name ?? mtms?.name ?? '',
                satuan: lens?.satuan ?? null,
                stock_lensa: lensQty,
                stock_mtms: mtmsQty,
                selisih,
                match_status: selisih === 0 ? 'match' : 'selisih',
            };
        });

        items.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));

        return {
            success: true,
            data: {
                nik_teknisi: teknisi.nik,
                nama_teknisi: teknisi.name,
                branch: teknisi.branch,
                service_area: teknisi.service_area,
                warehouse_name: teknisi.warehouse_name,
                scraped_at: cached.scraped_at,
                items,
            },
        };
    } catch (error: unknown) {
        actionLogger.error(
            `Cached stock comparison error (NIK ${nik}):`,
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal memuat detail',
        };
    }
}

/**
 * Live scrape a single teknisi (non-staff only) — bypasses cache.
 */
export async function getLiveStockComparison(nik: string): Promise<{
    success: boolean;
    data?: StockComparisonResult;
    error?: string;
}> {
    try {
        const parsedNik = NikParamSchema.safeParse(nik);
        if (!parsedNik.success) {
            return { success: false, error: parsedNik.error.issues[0]?.message ?? 'NIK tidak valid' };
        }
        const validNik = parsedNik.data;

        const user = await getSessionUser();
        if (user.isStaff) {
            return {
                success: false,
                error: 'Hanya non-staff yang dapat melakukan scraping langsung',
            };
        }

        const teknisi = await db
            .selectFrom('hr.technicians as t')
            .select(['t.nik', 't.name', 't.wh_id'])
            .where('t.nik', '=', validNik)
            .executeTakeFirst();

        if (!teknisi) {
            return { success: false, error: 'Teknisi tidak ditemukan' };
        }

        if (!teknisi.wh_id) {
            return {
                success: false,
                error: 'Teknisi belum di-assign ke gudang',
            };
        }

        const credentials = await resolveLensaCredentials(teknisi.wh_id);
        if (!credentials) {
            return {
                success: false,
                error: 'Gudang ini belum memiliki akun Lensa yang terhubung. Silakan hubungi PIC gudang.',
            };
        }

        const lensData = await scrapeStockTeknisi(validNik, credentials.username, credentials.password);

        // Update database cache with scraped result
        await db
            .updateTable('hr.technicians')
            .set({
                ref_intech_lensa: sql`${JSON.stringify({
                    status: 'success',
                    scraped_at: new Date().toISOString(),
                    error_message: null,
                    materials: lensData.materials,
                })}::jsonb`,
            })
            .where('nik', '=', validNik)
            .execute();

        // MTMS stock via inventoryRepository
        const mtmsRows = await inventoryRepository.getTechnicianIntechStock(validNik);

        const mtmsMap = new Map<string, { name: string; qty: number }>();
        for (const row of mtmsRows) {
            if (!row.material_code) continue;
            mtmsMap.set(row.material_code, {
                name: row.material_name ?? '',
                qty: Number(row.qty_intech ?? 0),
            });
        }

        const lensMap = new Map<string, { name: string; qty: number; satuan: string | null }>();
        for (const material of lensData.materials) {
            lensMap.set(material.id_material, {
                name: material.nama_material,
                qty: Number.parseInt(material.stock_teknisi, 10) || 0,
                satuan: material.satuan ?? null,
            });
        }

        const materialCodes = Array.from(new Set([...lensMap.keys(), ...mtmsMap.keys()])).sort();

        const items: StockComparisonItem[] = materialCodes.map((code) => {
            const lens = lensMap.get(code);
            const mtms = mtmsMap.get(code);
            const lensQty = lens?.qty ?? 0;
            const mtmsQty = mtms?.qty ?? 0;
            const selisih = lensQty - mtmsQty;

            return {
                id_material: code,
                nama_material: lens?.name ?? mtms?.name ?? '',
                satuan: lens?.satuan ?? null,
                stock_lensa: lensQty,
                stock_mtms: mtmsQty,
                selisih,
                match_status: selisih === 0 ? 'match' : 'selisih',
            };
        });

        items.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));

        const wh = teknisi.wh_id
            ? await db
                  .selectFrom('inventory.mas_wh')
                  .select(['name'])
                  .where('id', '=', teknisi.wh_id)
                  .executeTakeFirst()
            : undefined;

        return {
            success: true,
            data: {
                nik_teknisi: lensData.nik_teknisi || teknisi.nik,
                nama_teknisi: lensData.nama_teknisi || teknisi.name,
                branch: null,
                service_area: null,
                warehouse_name: wh?.name ?? null,
                scraped_at: new Date().toISOString(),
                items,
            },
        };
    } catch (error: unknown) {
        actionLogger.error(
            `Live stock comparison error (NIK ${nik}):`,
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal scraping data Lensa',
        };
    }
}

/**
 * List teknisi for the live-scraping modal (non-staff only).
 */
export async function getTeknisiList(): Promise<{
    success: boolean;
    data?: Array<{ nik: string; name: string; nama: string }>;
    error?: string;
}> {
    try {
        const user = await getSessionUser();
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');

        let query = db
            .selectFrom('hr.technicians')
            .select(['nik', 'name'])
            .where('wh_id', 'is not', null);

        // Staff: hanya teknisi yang berada di gudang yang di-assign ke user
        if (user.isStaff) {
            if (!scopedWarehouseIds || scopedWarehouseIds.length === 0) {
                return { success: true, data: [] };
            }
            query = query.where('wh_id', 'in', scopedWarehouseIds);
        }

        const rows = await query.orderBy('name', 'asc').execute();
        const mapped = rows.map((r) => ({
            nik: r.nik,
            name: r.name,
            nama: r.name,
        }));

        return { success: true, data: mapped };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch teknisi list:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal memuat daftar teknisi',
        };
    }
}
