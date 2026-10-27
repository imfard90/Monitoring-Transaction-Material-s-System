'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { warehouseScope } from '@/lib/policies';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type {
    CachedLensaStock,
    StockComparisonItem,
    StockComparisonResult,
    TeknisiRow,
    TeknisiStockListItem,
} from './stock-comparison.types';

const NikParamSchema = z.string().trim().min(1, 'NIK teknisi wajib diisi');

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
            niks.length > 0 ? await inventoryRepository.getBatchTechnicianIntechStock(niks) : [];

        const mtmsStockByNik = new Map<string, Map<string, number>>();
        for (const row of mtmsStockRows) {
            if (!row.nik_teknisi || !row.material_code) continue;
            const techNik = row.nik_teknisi.trim();
            const matCode = row.material_code.trim().toUpperCase();
            let techMap = mtmsStockByNik.get(techNik);
            if (!techMap) {
                techMap = new Map();
                mtmsStockByNik.set(techNik, techMap);
            }
            techMap.set(matCode, Number(row.qty_intech ?? 0));
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
                const techNik = row.nik?.trim() ?? '';
                const techMtmsMap = mtmsStockByNik.get(techNik) ?? new Map<string, number>();

                const lensMap = new Map<string, number>();
                for (const material of cached.materials) {
                    if (!material.id_material) continue;
                    const code = material.id_material.trim().toUpperCase();
                    lensMap.set(
                        code,
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
            return {
                success: false,
                error: parsedNik.error.issues[0]?.message ?? 'NIK tidak valid',
            };
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

        const mtmsMap = new Map<string, { code: string; name: string; qty: number }>();
        for (const row of mtmsRows) {
            if (!row.material_code) continue;
            const codeKey = row.material_code.trim().toUpperCase();
            mtmsMap.set(codeKey, {
                code: row.material_code.trim(),
                name: row.material_name ?? '',
                qty: Number(row.qty_intech ?? 0),
            });
        }

        const lensMap = new Map<string, { code: string; name: string; qty: number; satuan: string | null }>();
        for (const material of cached.materials) {
            if (!material.id_material) continue;
            const codeKey = material.id_material.trim().toUpperCase();
            lensMap.set(codeKey, {
                code: material.id_material.trim(),
                name: material.nama_material,
                qty: Number.parseInt(material.stock_teknisi, 10) || 0,
                satuan: material.satuan ?? null,
            });
        }

        const materialCodes = Array.from(new Set([...lensMap.keys(), ...mtmsMap.keys()])).sort();

        const items: StockComparisonItem[] = materialCodes.map((codeKey) => {
            const lens = lensMap.get(codeKey);
            const mtms = mtmsMap.get(codeKey);
            const lensQty = lens?.qty ?? 0;
            const mtmsQty = mtms?.qty ?? 0;
            const selisih = lensQty - mtmsQty;

            return {
                id_material: lens?.code ?? mtms?.code ?? codeKey,
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
