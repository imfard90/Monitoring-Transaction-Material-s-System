'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { decryptLensaPassword } from '@/lib/crypto/decrypt-lensa';
import { db } from '@/lib/db/db';
import { scrapeStockTeknisi } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type { StockComparisonItem, StockComparisonResult } from './stock-comparison.types';

const NikParamSchema = z.string().trim().min(1, 'NIK teknisi wajib diisi');

/**
 * Resolve Lensa credentials for a warehouse — PIC 1 first, fallback PIC 2.
 */
export async function resolveLensaCredentials(
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
            return {
                success: false,
                error: parsedNik.error.issues[0]?.message ?? 'NIK tidak valid',
            };
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
            .select(['t.nik', 't.name', 't.wh_id', 't.exclude_intech_lensa'])
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

        const lensData = await scrapeStockTeknisi(
            validNik,
            credentials.username,
            credentials.password
        );

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

        const lensMap = new Map<
            string,
            { code: string; name: string; qty: number; satuan: string | null }
        >();
        for (const material of lensData.materials) {
            if (!material.id_material) continue;
            const codeKey = material.id_material.trim().toUpperCase();
            lensMap.set(codeKey, {
                code: material.id_material.trim(),
                name: material.nama_material,
                qty: Number.parseInt(material.stock_teknisi, 10) || 0,
                satuan: material.satuan ?? null,
            });
        }

        const rawExcludes = teknisi.exclude_intech_lensa as Array<{
            id_material: string;
            qty: number;
        }> | null;
        const excludeMap = new Map<string, number>();
        if (Array.isArray(rawExcludes)) {
            for (const ex of rawExcludes) {
                if (ex.id_material) {
                    excludeMap.set(ex.id_material.trim().toUpperCase(), Number(ex.qty) || 0);
                }
            }
        }

        const materialCodes = Array.from(new Set([...lensMap.keys(), ...mtmsMap.keys()])).sort();

        const items: StockComparisonItem[] = materialCodes.map((codeKey) => {
            const lens = lensMap.get(codeKey);
            const mtms = mtmsMap.get(codeKey);
            const rawLensQty = lens?.qty ?? 0;
            const excludeQty = excludeMap.get(codeKey) ?? 0;
            const adjustedLensQty = Math.max(0, rawLensQty - excludeQty);
            const mtmsQty = mtms?.qty ?? 0;
            const selisih = adjustedLensQty - mtmsQty;

            return {
                id_material: lens?.code ?? mtms?.code ?? codeKey,
                nama_material: lens?.name ?? mtms?.name ?? '',
                satuan: lens?.satuan ?? null,
                stock_lensa: adjustedLensQty,
                raw_stock_lensa: rawLensQty,
                exclude_qty: excludeQty > 0 ? excludeQty : undefined,
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
