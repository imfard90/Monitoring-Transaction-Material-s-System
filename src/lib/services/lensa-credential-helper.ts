import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { decryptLensaPassword } from './lensa-crypto';

export interface LensaCredentialCandidate {
    username: string;
    password: string;
    picNik?: string;
    source: 'pic1' | 'pic2' | 'user' | 'system';
}

export interface WarehouseLensaTask {
    warehouseId: number;
    warehouseName: string;
    pic1Nik: string | null;
    pic2Nik: string | null;
    candidates: LensaCredentialCandidate[];
}

export interface ResolveLensaCandidatesParams {
    warehouseId?: number | null;
    warehouseName?: string | null;
    sessionNik?: string | null;
    userId?: string | null;
    includeSystemFallback?: boolean;
}

/**
 * Mengambil seluruh gudang operasional beserta kandidat akun Lensa (PIC 1 lalu PIC 2).
 * Digunakan secara terpadu oleh seluruh batch scraping / cronjob:
 * - Out Lensa Header & Detail
 * - WO Lensa Header & Detail
 * - WO Lensa Nightly Scrape
 * - Bulk Stock Scraper
 */
export async function getActiveWarehousesWithLensaCandidates(options?: {
    warehouseIds?: number[];
}): Promise<WarehouseLensaTask[]> {
    let whQuery = db
        .selectFrom('inventory.mas_wh')
        .select(['id', 'name', 'pic_1', 'pic_2'])
        .orderBy('id', 'asc');

    if (options?.warehouseIds && options.warehouseIds.length > 0) {
        whQuery = whQuery.where('id', 'in', options.warehouseIds);
    } else {
        whQuery = whQuery.where((eb) =>
            eb.or([eb('pic_1', 'is not', null), eb('pic_2', 'is not', null)])
        );
    }

    const whs = await whQuery.execute();
    if (whs.length === 0) return [];

    const usersWithLensa = await db
        .selectFrom('auth.user as u')
        .where('u.lensa_acount', 'is not', null)
        .select(['u.id', 'u.nik', 'u.lensa_acount'])
        .execute();

    const userByNik = new Map<string, (typeof usersWithLensa)[number]>();
    for (const u of usersWithLensa) {
        if (u.nik) userByNik.set(u.nik.trim(), u);
    }

    const tasks: WarehouseLensaTask[] = [];

    for (const w of whs) {
        const pic1Nik = w.pic_1 ? String(w.pic_1).trim() : null;
        const pic2Nik = w.pic_2 ? String(w.pic_2).trim() : null;

        const candidates: LensaCredentialCandidate[] = [];
        const seenUsernames = new Set<string>();

        const addCandidate = (
            userObj: (typeof usersWithLensa)[number] | undefined,
            source: 'pic1' | 'pic2',
            nik: string | null
        ) => {
            if (!userObj?.lensa_acount?.username || !userObj.lensa_acount.password) return;
            const u = userObj.lensa_acount.username.trim();
            if (!u || seenUsernames.has(u)) return;

            try {
                const pass = decryptLensaPassword(userObj.lensa_acount.password);
                if (pass) {
                    candidates.push({
                        username: u,
                        password: pass,
                        picNik: nik || undefined,
                        source,
                    });
                    seenUsernames.add(u);
                }
            } catch (err) {
                actionLogger.warn(
                    `[LensaCredentials] Gagal mendekripsi password Lensa untuk gudang ${w.name} (${source} - NIK: ${nik}):`,
                    { error: err instanceof Error ? err.message : String(err) }
                );
            }
        };

        if (pic1Nik) {
            addCandidate(userByNik.get(pic1Nik), 'pic1', pic1Nik);
        }
        if (pic2Nik) {
            addCandidate(userByNik.get(pic2Nik), 'pic2', pic2Nik);
        }

        if (candidates.length > 0) {
            tasks.push({
                warehouseId: w.id,
                warehouseName: w.name,
                pic1Nik,
                pic2Nik,
                candidates,
            });
        } else {
            actionLogger.warn(
                `[LensaCredentials] Gudang "${w.name}" (id=${w.id}) dilewati: Tidak ada akun Lensa valid pada PIC 1 maupun PIC 2.`
            );
        }
    }

    return tasks;
}

/**
 * Mengambil seluruh kandidat kredensial Lensa yang tersedia secara berurutan:
 * 1. PIC 1 gudang (prioritas utama)
 * 2. PIC 2 gudang (fallback jika PIC 1 gagal / belum terhubung)
 * 3. User login (jika ada session/user)
 * 4. Akun Lensa aktif lainnya di sistem
 */
export async function getWarehouseLensaCandidates(
    params: ResolveLensaCandidatesParams = {}
): Promise<LensaCredentialCandidate[]> {
    const candidates: LensaCredentialCandidate[] = [];
    const seenUsernames = new Set<string>();

    const addCandidate = (
        username: string | null | undefined,
        encryptedPassword: string | null | undefined,
        source: LensaCredentialCandidate['source'],
        picNik?: string
    ) => {
        const u = (username || '').trim();
        if (!u || !encryptedPassword) return;
        if (seenUsernames.has(u)) return;

        try {
            const password = decryptLensaPassword(encryptedPassword);
            if (password) {
                candidates.push({
                    username: u,
                    password,
                    picNik: picNik ? picNik.trim() : undefined,
                    source,
                });
                seenUsernames.add(u);
            }
        } catch (err) {
            actionLogger.warn(
                `[LensaCredentials] Gagal mendekripsi password Lensa untuk ${source} (${u}${picNik ? ` - NIK: ${picNik}` : ''}):`,
                { error: err instanceof Error ? err.message : String(err) }
            );
        }
    };

    // 1 & 2: Cari master warehouse
    let targetWh: { id: number; name: string; pic_1: string | null; pic_2: string | null } | null =
        null;

    if (params.warehouseId) {
        targetWh =
            (await db
                .selectFrom('inventory.mas_wh')
                .select(['id', 'name', 'pic_1', 'pic_2'])
                .where('id', '=', params.warehouseId)
                .executeTakeFirst()) || null;
    }

    if (!targetWh && params.warehouseName) {
        const allWhs = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'pic_1', 'pic_2'])
            .execute();
        targetWh = findMatchingMasterWarehouse(params.warehouseName, allWhs) || null;
    }

    if (!targetWh && params.sessionNik) {
        const sessionNik = params.sessionNik;
        targetWh =
            (await db
                .selectFrom('inventory.mas_wh')
                .select(['id', 'name', 'pic_1', 'pic_2'])
                .where((eb) =>
                    eb.or([
                        eb('pic_1', '=', sessionNik),
                        eb('pic_2', '=', sessionNik),
                    ])
                )
                .executeTakeFirst()) || null;
    }

    if (targetWh) {
        // PIC 1 first
        if (targetWh.pic_1) {
            const pic1User = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('nik', '=', targetWh.pic_1)
                .executeTakeFirst();
            if (pic1User) {
                addCandidate(
                    pic1User.lensa_username,
                    pic1User.lensa_password,
                    'pic1',
                    targetWh.pic_1
                );
            }
        }

        // PIC 2 fallback
        if (targetWh.pic_2) {
            const pic2User = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('nik', '=', targetWh.pic_2)
                .executeTakeFirst();
            if (pic2User) {
                addCandidate(
                    pic2User.lensa_username,
                    pic2User.lensa_password,
                    'pic2',
                    targetWh.pic_2
                );
            }
        }
    }

    // 3: User login fallback
    if (params.userId) {
        const userObj = await db
            .selectFrom('auth.user')
            .select([
                sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                'nik',
            ])
            .where('id', '=', params.userId)
            .executeTakeFirst();
        if (userObj) {
            addCandidate(
                userObj.lensa_username,
                userObj.lensa_password,
                'user',
                userObj.nik || undefined
            );
        }
    }

    if (params.sessionNik) {
        const userObj = await db
            .selectFrom('auth.user')
            .select([
                sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
            ])
            .where('nik', '=', params.sessionNik)
            .executeTakeFirst();
        if (userObj) {
            addCandidate(userObj.lensa_username, userObj.lensa_password, 'user', params.sessionNik);
        }
    }

    // 4: System active users fallback
    if (params.includeSystemFallback !== false) {
        const anyUsers = await db
            .selectFrom('auth.user')
            .select([
                sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                'nik',
            ])
            .where('lensa_acount', 'is not', null)
            .where(sql`lensa_acount->>'username'`, 'is not', null)
            .where(sql`lensa_acount->>'password'`, 'is not', null)
            .execute();

        for (const u of anyUsers) {
            addCandidate(u.lensa_username, u.lensa_password, 'system', u.nik || undefined);
        }
    }

    // 5: Environment variable fallback (jika ada)
    if (candidates.length === 0 && process.env.LENSA_USERNAME && process.env.LENSA_PASSWORD) {
        const u = process.env.LENSA_USERNAME.trim();
        if (!seenUsernames.has(u)) {
            candidates.push({
                username: u,
                password: process.env.LENSA_PASSWORD,
                source: 'system',
            });
            seenUsernames.add(u);
        }
    }

    return candidates;
}

/**
 * Menjalankan operasi scraping Lensa dengan mencoba kandidat kredensial satu per satu.
 * Jika kandidat pertama (misal PIC 1) gagal login / error sesi, otomatis mencoba PIC 2, dst.
 */
export async function executeWithLensaFallback<T>(
    candidates: LensaCredentialCandidate[],
    operation: (creds: LensaCredentialCandidate) => Promise<T>,
    contextLabel: string = 'Scraper'
): Promise<T> {
    if (!candidates || candidates.length === 0) {
        throw new Error(
            'Tidak ada akun Lensa yang terhubung (PIC 1 / PIC 2 gudang atau sistem belum terhubung di profil).'
        );
    }

    let lastError: Error | null = null;

    for (let i = 0; i < candidates.length; i++) {
        const creds = candidates[i];
        try {
            actionLogger.info(
                `[${contextLabel}] Mencoba Lensa via ${creds.source.toUpperCase()} (${creds.username}${creds.picNik ? ` - NIK: ${creds.picNik}` : ''})...`
            );
            const result = await operation(creds);

            // Periksa jika result mengembalikan objek dengan error auth/login
            if (
                result &&
                typeof result === 'object' &&
                'error' in result &&
                typeof (result as Record<string, unknown>).error === 'string'
            ) {
                const errMsg = (result as Record<string, unknown>).error as string;
                const lower = errMsg.toLowerCase();
                const isAuthOrLoginError =
                    lower.includes('login') ||
                    lower.includes('sesi') ||
                    lower.includes('password') ||
                    lower.includes('username') ||
                    lower.includes('tertahan') ||
                    lower.includes('terputus') ||
                    lower.includes('unauthorized');

                if (isAuthOrLoginError && i < candidates.length - 1) {
                    const next = candidates[i + 1];
                    actionLogger.warn(
                        `[${contextLabel}] Akun ${creds.username} (${creds.source}) gagal: "${errMsg}". Otomatis fallback ke ${next.source.toUpperCase()} (${next.username})...`
                    );
                    lastError = new Error(errMsg);
                    continue;
                }
            }

            return result;
        } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const isLast = i === candidates.length - 1;
            if (isLast) {
                actionLogger.error(
                    `[${contextLabel}] Seluruh kandidat akun Lensa gagal digunakan: ${lastError.message}`
                );
            } else {
                const next = candidates[i + 1];
                actionLogger.warn(
                    `[${contextLabel}] Gagal pada akun ${creds.username} (${creds.source}): ${lastError.message}. Otomatis fallback ke ${next.source.toUpperCase()} (${next.username})...`
                );
            }
        }
    }

    throw lastError || new Error(`Gagal memproses data Lensa untuk ${contextLabel}.`);
}

