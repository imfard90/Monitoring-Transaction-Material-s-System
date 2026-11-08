'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionNik, getSessionUser, requireWarehouseAccess } from '@/lib/auth-server';
import { invalidateLiveStockCache, invalidateNotificationCache } from '@/lib/cache/lru-cache';
import { decryptLensaPassword } from '@/lib/crypto/decrypt-lensa';
import { db } from '@/lib/db/db';
import { errors } from '@/lib/errors';
import { scrapeReservation } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { hrRepository } from '@/lib/repositories/hr.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';

const createOutSapSchema = z.object({
    idemKey: z.string().trim().min(1),
    warehouse_id: z.number().int().positive(),
    nik_teknisi: z.string().trim().min(1),
    name_sa: z.string().trim(),
    id_reservasi: z.string().trim(),
    sap_number: z.string().trim(),
    request_id: z.string().trim(),
    items: z
        .array(
            z.object({
                designator_id: z.number().int().positive(),
                qty_req: z.number().positive(),
                unit_price: z.number().nonnegative().optional(),
            })
        )
        .optional(),
});

export async function getOutSaps() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return {
                success: true,
                data: [],
                counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
            };
        }

        const { data, counts } = await inventoryRepository.getOutSaps({
            warehouseIds: isStaff ? warehouseIds : undefined,
            limit: 200,
        });

        return { success: true, data, counts };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch Out SAPs:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getOutSapItemsByHeaderId(headerId: number | string) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

        const items = await inventoryRepository.getOutSapItemsByHeaderId(
            headerId,
            isStaff ? warehouseIds : undefined
        );

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getTechnicianByNik(nik: string) {
    try {
        await getSessionUser();

        const t = await hrRepository.getTechnicianByNik(nik);
        return { success: true, data: t };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technician by nik:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}

export async function getTechnicians(sa?: string) {
    try {
        const technicians = await hrRepository.getTechnicians({
            ...(sa ? { serviceArea: sa } : {}),
            isActive: true,
        });
        return { success: true, data: technicians };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technicians:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterials() {
    try {
        const mats = await inventoryRepository.listMaterials();
        return { success: true, data: mats };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterialsInWarehouse(whId: number) {
    try {
        const mats = await inventoryRepository.getMaterialsInWarehouse(whId);
        return { success: true, data: mats };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching materials for warehouse:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getWarehouses() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

        const whs = await inventoryRepository.getWarehouses(isStaff ? warehouseIds : undefined);
        return { success: true, data: whs };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getBranches() {
    try {
        const { branchName } = await getSessionUser();
        const branches = await hrRepository.getBranches(branchName ? { branchName } : undefined);
        return { success: true, data: branches };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching branches:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function createOutSap(payload: {
    idemKey: string;
    warehouse_id: number;
    nik_teknisi: string;
    name_sa: string;
    id_reservasi: string;
    sap_number: string;
    request_id: string;
    items?: { designator_id: number; qty_req: number; unit_price?: number }[];
}) {
    if (!payload.idemKey)
        return { success: false, error: 'Security constraint: Idempotency key required' };

    const parsed = createOutSapSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        await requireWarehouseAccess(parsed.data.warehouse_id);

        const tech = await hrRepository.getTechnicianByNik(parsed.data.nik_teknisi);
        if (!tech || tech.is_active === false) {
            return {
                success: false,
                error: 'Teknisi tidak ditemukan atau berstatus nonaktif. Pengeluaran material baru tidak diizinkan.',
            };
        }

        const { isDuplicate, result } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                const createdBy = await getSessionNik();
                return await inventoryRepository.createOutSap({
                    warehouseId: data.warehouse_id,
                    nikTeknisi: data.nik_teknisi,
                    nameSa: data.name_sa,
                    idReservasi: data.id_reservasi || null,
                    sapNumber: data.sap_number,
                    requestId: data.request_id,
                    createdBy,
                    items: data.items ?? [],
                });
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/form/out-sap');
        revalidatePath('/reference/out-lensa-ref');
        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        revalidatePath('/form/rekon-intech');
        revalidatePath('/form/rekon-lensa');
        revalidatePath('/');
        invalidateLiveStockCache();
        invalidateNotificationCache();
        return { success: true, header_id: result.headerId, id_trx: result.idTrx };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to create Out SAP:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Additional action to update status to intech, triggering SP reduction
export async function updateOutSapStatusToIntech(headerId: number | string) {
    try {
        const _result = await db.transaction().execute(async (trx) => {
            // Set to intech
            await trx
                .updateTable('inventory.sap_out_header')
                .set({ end_status: 'intech' })
                .where('id', '=', String(headerId))
                .execute();

            // Get warehouse_id first
            const header = await trx
                .selectFrom('inventory.sap_out_header')
                .select(['warehouse_id'])
                .where('id', '=', String(headerId))
                .executeTakeFirst();

            if (!header) {
                throw errors.notFound('Data Out SAP tidak ditemukan.');
            }

            const warehouseId = Number(header.warehouse_id);
            await requireWarehouseAccess(warehouseId);
            const createdBy = await getSessionNik();

            // Call SP sp_sap_out for this header to reduce stock
            await inventoryRepository.recordSapOut({
                headerId: Number(headerId),
                warehouseId: Number(warehouseId),
                createdBy,
            });

            return true;
        });

        revalidatePath('/form/out-sap');
        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        revalidatePath('/form/rekon-intech');
        revalidatePath('/form/rekon-lensa');
        revalidatePath('/');
        invalidateLiveStockCache();
        invalidateNotificationCache();
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to update status to intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Resolve Lensa credentials for a warehouse: checks PIC 1 first, fallback to PIC 2.
 */
export async function resolveWarehouseLensaCredentials(
    whId: number
): Promise<{ username: string; password: string; picNik: string } | null> {
    const wh = await db
        .selectFrom('inventory.mas_wh')
        .select(['id', 'name', 'pic_1', 'pic_2'])
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
            .where(sql`lensa_acount->>'username'`, 'is not', null)
            .where(sql`lensa_acount->>'password'`, 'is not', null)
            .executeTakeFirst();

        if (picUser?.lensa_username && picUser?.lensa_password) {
            try {
                const decrypted = decryptLensaPassword(picUser.lensa_password);
                if (decrypted) {
                    return {
                        username: picUser.lensa_username,
                        password: decrypted,
                        picNik,
                    };
                }
            } catch (err) {
                actionLogger.warn(
                    `[OutSap] Gagal mendekripsi password Lensa untuk PIC ${picNik}:`,
                    { error: err instanceof Error ? err.message : String(err) }
                );
            }
        }
    }

    return null;
}

/**
 * Fallback to any active Lensa user registered in the system (for Admin when warehouse is unset).
 */
export async function resolveAnyActiveLensaCredentials(): Promise<{
    username: string;
    password: string;
} | null> {
    const anyUsers = await db
        .selectFrom('auth.user')
        .select([
            sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
            sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
        ])
        .where('lensa_acount', 'is not', null)
        .where(sql`lensa_acount->>'username'`, 'is not', null)
        .where(sql`lensa_acount->>'password'`, 'is not', null)
        .execute();

    for (const u of anyUsers) {
        if (u.lensa_username && u.lensa_password) {
            try {
                const pass = decryptLensaPassword(u.lensa_password);
                if (pass) return { username: u.lensa_username, password: pass };
            } catch {}
        }
    }
    return null;
}

export interface OutSapScrapedItem {
    id: string;
    designator_id: string;
    qty_req: number;
}

export interface OutSapReservationDataResult {
    request_id: string;
    id_reservasi: string;
    sap_number: string;
    warehouse_id: string;
    nama_gudang: string;
    nik_pemakai: string;
    name_sa: string;
    nik_teknisi: string;
    items: OutSapScrapedItem[];
    source: 'database' | 'lensa';
}

/**
 * Mengambil data reservasi untuk Form Out SAP:
 * - Untuk Staff: Kredensial Lensa diambil dari PIC 1 (fallback PIC 2) gudang penugasan Staff.
 *   Jika data sudah pernah tercatat di inventory.out_lensa_ref_header dengan items lengkap,
 *   langsung diambil dari database tanpa perlu headless browser scraping.
 * - Untuk Admin: "idreservasi di query ke database out lensa ref header"
 *   Langsung membaca dari database out_lensa_ref_header beserta out_lensa_ref_list.
 *   Jika belum ada di DB dan gudang dipilih, fallback live scrape via PIC gudang tersebut.
 */
export async function getOutSapReservationData(params: {
    requestId: string;
    warehouseId?: number;
}): Promise<{
    success: boolean;
    data?: OutSapReservationDataResult;
    error?: string;
}> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const cleanRequestId = params.requestId.trim();
        if (!cleanRequestId) {
            return { success: false, error: 'Masukkan Request ID terlebih dahulu' };
        }

        // Tentukan warehouseId awal:
        let targetWhId = params.warehouseId;
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return {
                    success: false,
                    error: 'Akses ditolak: Anda tidak memiliki penugasan gudang.',
                };
            }
            if (targetWhId && !warehouseIds.includes(targetWhId)) {
                return {
                    success: false,
                    error: 'Akses ditolak: Anda tidak memiliki akses ke gudang yang dipilih.',
                };
            }
            if (!targetWhId) {
                targetWhId = warehouseIds[0];
            }
        }

        // 1. Cek apakah reservasi sudah ada di inventory.out_lensa_ref_header
        // (Pola umum: query ke database out lensa ref header)
        const headerInDb = await db
            .selectFrom('inventory.out_lensa_ref_header as h')
            .selectAll()
            .where('h.reservation_id', '=', cleanRequestId)
            .executeTakeFirst();

        if (headerInDb) {
            const allWhs = await inventoryRepository.getWarehouses();
            const matchedWh = findMatchingMasterWarehouse(headerInDb.nama_gudang, allWhs);

            // Validasi kesesuaian gudang untuk Staff
            if (isStaff && matchedWh && !warehouseIds.includes(matchedWh.id)) {
                return {
                    success: false,
                    error: `Request ID ${cleanRequestId} terdaftar untuk gudang "${headerInDb.nama_gudang}", tidak sesuai dengan gudang penugasan Anda.`,
                };
            }

            const detailRows = await db
                .selectFrom('inventory.out_lensa_ref_list')
                .selectAll()
                .where('header_id', '=', headerInDb.id)
                .execute();

            // Jika ada detail item di database, kembalikan langsung dari DB
            if (detailRows.length > 0) {
                let techInfo = null;
                if (headerInDb.nik_pemakai) {
                    techInfo = await hrRepository.getTechnicianByNik(headerInDb.nik_pemakai.trim());
                }

                const allMats = await inventoryRepository.listMaterials();
                const mappedItems: OutSapScrapedItem[] = [];

                for (const d of detailRows) {
                    const code = (d.material_id || '').trim();
                    const qty = parseInt(d.qty_approve || '0', 10) || 0;
                    if (code && qty > 0) {
                        const m = allMats.find((mat) => (mat.code || '').trim() === code);
                        if (m) {
                            mappedItems.push({
                                id: crypto.randomUUID(),
                                designator_id: String(m.id),
                                qty_req: qty,
                            });
                        }
                    }
                }

                return {
                    success: true,
                    data: {
                        request_id: headerInDb.reservation_id,
                        id_reservasi: headerInDb.reservation_id_sap || '',
                        sap_number: headerInDb.gi_number || '',
                        warehouse_id: matchedWh
                            ? String(matchedWh.id)
                            : targetWhId
                              ? String(targetWhId)
                              : '',
                        nama_gudang: headerInDb.nama_gudang || matchedWh?.name || '',
                        nik_pemakai: headerInDb.nik_pemakai || '',
                        name_sa: techInfo?.sa || '',
                        nik_teknisi:
                            techInfo?.nik ||
                            (headerInDb.nik_pemakai ? headerInDb.nik_pemakai.trim() : ''),
                        items: mappedItems,
                        source: 'database',
                    },
                };
            }
        }

        // 2. Jika tidak ada di DB (atau detail items belum lengkap):
        // Resolusi kredensial Lensa: cek PIC 1 lalu fallback PIC 2
        let resolvedWhId = targetWhId;
        if (!resolvedWhId && headerInDb?.nama_gudang) {
            const allWhs = await inventoryRepository.getWarehouses();
            const matchedWh = findMatchingMasterWarehouse(headerInDb.nama_gudang, allWhs);
            if (matchedWh) resolvedWhId = matchedWh.id;
        }

        if (!resolvedWhId && isStaff) {
            resolvedWhId = warehouseIds[0];
        }

        let creds: { username: string; password: string } | null = null;
        if (resolvedWhId) {
            creds = await resolveWarehouseLensaCredentials(resolvedWhId);
        }

        if (!creds && !isStaff) {
            // Admin fallback ke sembarang akun Lensa aktif di sistem
            creds = await resolveAnyActiveLensaCredentials();
        }

        if (!creds) {
            if (resolvedWhId) {
                const wh = await db
                    .selectFrom('inventory.mas_wh')
                    .select(['name'])
                    .where('id', '=', resolvedWhId)
                    .executeTakeFirst();
                return {
                    success: false,
                    error: `Akun Lensa untuk gudang "${wh?.name || resolvedWhId}" belum terhubung. Silakan hubungkan akun Lensa pada profil PIC 1 atau PIC 2 gudang tersebut.`,
                };
            }
            return {
                success: false,
                error: 'Data reservasi belum ada di database. Silakan pilih "Dari Gudang" terlebih dahulu untuk mengambil data langsung dari Lensa.',
            };
        }

        // Live scrape ke sistem Lensa
        const scrapeResult = await scrapeReservation(
            cleanRequestId,
            creds.username,
            creds.password
        );
        if ('error' in scrapeResult && scrapeResult.error) {
            return {
                success: false,
                error:
                    typeof scrapeResult.error === 'string'
                        ? scrapeResult.error
                        : 'Gagal scraping data Lensa',
            };
        }

        const successData = scrapeResult as Record<string, unknown>;
        const scrapedListData = (successData.listData as Record<string, unknown[]>)?.data?.[0] as
            | Record<string, unknown>
            | undefined;
        const scrapedDetail = successData.detailContent as Record<string, unknown> | undefined;

        if (!scrapedListData || !scrapedDetail) {
            return {
                success: false,
                error: 'Data reservasi tidak ditemukan di Lensa atau format tidak sesuai.',
            };
        }

        const resIdSap = (scrapedListData.reservation_id_sap as string) || '';
        const giNumber = (scrapedListData.gi_number as string) || '';
        const headerInfo = scrapedDetail.headerInfo as Record<string, string> | undefined;
        const nik = (headerInfo?.nikPemakai || '').replace(/[\s\u00A0]+/g, '');
        const namaGudang = (scrapedListData.nama_gudang as string) || '';

        const allWhs = await inventoryRepository.getWarehouses();
        const matchedWh = findMatchingMasterWarehouse(namaGudang, allWhs);

        if (isStaff && matchedWh && !warehouseIds.includes(matchedWh.id)) {
            return {
                success: false,
                error: `Request ID ${cleanRequestId} terdaftar untuk gudang "${namaGudang}", tidak sesuai dengan gudang penugasan Anda.`,
            };
        }

        let techInfo = null;
        if (nik) {
            techInfo = await hrRepository.getTechnicianByNik(nik);
        }

        const allMaterials = await inventoryRepository.listMaterials();
        const mappedItems: OutSapScrapedItem[] = [];
        const scrapedMaterials = scrapedDetail.materials as Record<string, string>[] | undefined;

        scrapedMaterials?.forEach((scrapedMat: Record<string, string>) => {
            const code = (scrapedMat['ID MATERIAL'] || '').trim();
            const qty = parseInt(scrapedMat['QTY ACCEPTED'], 10) || 0;
            if (code && qty > 0) {
                const matchedMat = allMaterials.find((m) => (m.code || '').trim() === code);
                if (matchedMat) {
                    mappedItems.push({
                        id: crypto.randomUUID(),
                        designator_id: String(matchedMat.id),
                        qty_req: qty,
                    });
                }
            }
        });

        return {
            success: true,
            data: {
                request_id: cleanRequestId,
                id_reservasi: resIdSap,
                sap_number: giNumber,
                warehouse_id: matchedWh
                    ? String(matchedWh.id)
                    : resolvedWhId
                      ? String(resolvedWhId)
                      : '',
                nama_gudang: namaGudang || matchedWh?.name || '',
                nik_pemakai: nik,
                name_sa: techInfo?.sa || '',
                nik_teknisi: techInfo?.nik || nik,
                items: mappedItems,
                source: 'lensa',
            },
        };
    } catch (err) {
        actionLogger.error(
            'getOutSapReservationData error:',
            err instanceof Error ? err : new Error(String(err))
        );
        return {
            success: false,
            error:
                err instanceof Error
                    ? err.message
                    : 'Terjadi kesalahan sistem saat mengambil data Lensa',
        };
    }
}

export interface OutLensaAdminReservationOption {
    value: string;
    label: string;
    gi_number: string | null;
    nama_gudang: string | null;
    is_processed: boolean;
}

/**
 * Menyediakan opsi daftar ID Reservasi untuk Admin dari database out_lensa_ref_header.
 */
export async function getOutLensaReservationOptionsForAdmin(): Promise<{
    success: boolean;
    data: OutLensaAdminReservationOption[];
}> {
    try {
        const user = await getSessionUser();
        if (user.isStaff) {
            return { success: true, data: [] };
        }

        const rows = await db
            .selectFrom('inventory.out_lensa_ref_header as h')
            .select([
                'h.id',
                'h.reservation_id',
                'h.gi_number',
                'h.nama_gudang',
                'h.sap_out_check',
                'h.created_at',
            ])
            .where('h.reservation_id', 'is not', null)
            .orderBy('h.created_at', 'desc')
            .limit(100)
            .execute();

        const options: OutLensaAdminReservationOption[] = rows.map((r) => {
            const resId = String(r.reservation_id);
            const gi = r.gi_number ? `GI: ${r.gi_number}` : 'Tanpa GI';
            const gd = r.nama_gudang ? ` (${r.nama_gudang})` : '';
            const status = r.sap_out_check ? ' [Sudah Out SAP]' : '';
            return {
                value: resId,
                label: `${resId} — ${gi}${gd}${status}`,
                gi_number: r.gi_number,
                nama_gudang: r.nama_gudang,
                is_processed: Boolean(r.sap_out_check),
            };
        });

        return { success: true, data: options };
    } catch (error) {
        actionLogger.error(
            'getOutLensaReservationOptionsForAdmin error:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}
