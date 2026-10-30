'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';

export type IntechLensaWarehouseMetric = {
    key: number;
    name: string;
    total: number;
    completed: number;
};

export type WarehouseMetricBreakdown = {
    total: number;
    completed: number;
    percentage: number;
};

export type WarehouseLeaderboardEntry = {
    key: number;
    name: string;
    score: number;
    totalTransactions: number;
    outLensa: WarehouseMetricBreakdown;
    rekonLensa: WarehouseMetricBreakdown;
    intechLensaVsMtms: WarehouseMetricBreakdown;
};

export type WarehouseChampionResponse = {
    champion: WarehouseLeaderboardEntry | null;
    leaderboard: WarehouseLeaderboardEntry[];
    updatedAt: string;
};

export async function getLensaWarehousePerformance() {
    try {
        await getSessionUser();

        const outLensaQuery = db
            .selectFrom('inventory.out_lensa_ref_header as olh')
            .innerJoin('inventory.mas_wh as wh', (join) =>
                join.on(
                    sql<string>`LOWER(REGEXP_REPLACE(wh.name, '\\s+', '', 'g'))`,
                    '=',
                    sql<string>`LOWER(REGEXP_REPLACE(olh.nama_gudang, '\\s+', '', 'g'))`
                )
            )
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(olh.id)`.as('total'),
                sql<number>`COUNT(olh.id) FILTER (WHERE olh.sap_out_check IS TRUE)`.as('completed'),
            ])
            .where('olh.formatted_date', '=', sql<Date>`CURRENT_DATE`)
            .groupBy(['wh.id', 'wh.name']);

        const rekonLensaQuery = db
            .selectFrom('inventory.wo_lensa_header as wlh')
            .innerJoin('inventory.mas_wh as wh', (join) =>
                join.on(
                    sql<string>`LOWER(REGEXP_REPLACE(wh.name, '\\s+', '', 'g'))`,
                    '=',
                    sql<string>`LOWER(REGEXP_REPLACE(wlh.nama_gudang, '\\s+', '', 'g'))`
                )
            )
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(wlh.id)`.as('total'),
                sql<number>`COUNT(wlh.id) FILTER (WHERE wlh.rekon_check IS TRUE)`.as('completed'),
            ])
            .groupBy(['wh.id', 'wh.name']);

        const [outLensa, rekonLensa] = await Promise.all([
            outLensaQuery.execute(),
            rekonLensaQuery.execute(),
        ]);

        const sortByCompletion = <
            T extends { total: number | string; completed: number | string; name: string },
        >(
            rows: T[]
        ): T[] =>
            [...rows].sort((left, right) => {
                const leftTotal = Number(left.total);
                const rightTotal = Number(right.total);
                const leftPercent = leftTotal === 0 ? 0 : Number(left.completed) / leftTotal;
                const rightPercent = rightTotal === 0 ? 0 : Number(right.completed) / rightTotal;
                return rightPercent - leftPercent || left.name.localeCompare(right.name);
            });

        const sortedOutLensa = sortByCompletion(outLensa);
        const sortedRekonLensa = sortByCompletion(rekonLensa);

        return { success: true, data: { outLensa: sortedOutLensa, rekonLensa: sortedRekonLensa } };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch Lensa warehouse performance:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}

export async function getIntechLensaWarehousePerformance(): Promise<{
    success: boolean;
    data: IntechLensaWarehouseMetric[] | null;
    error?: string;
}> {
    try {
        await getSessionUser();

        // For dashboard & champions leaderboard, Intech Lensa performance represents
        // the warehouse competition across all warehouses (no PIC filter).
        const techQuery = db
            .selectFrom('hr.technicians as t')
            .innerJoin('inventory.mas_wh as wh', 'wh.id', 't.wh_id')
            .select(['t.nik', 't.wh_id', 'wh.name as warehouse_name', 't.ref_intech_lensa'])
            .where('t.wh_id', 'is not', null);

        const techRows = (await techQuery.execute()) as Array<{
            nik: string | null;
            wh_id: number | null;
            warehouse_name: string | null;
            ref_intech_lensa: unknown;
        }>;

        const niks = techRows.map((r) => r.nik).filter((nik): nik is string => Boolean(nik));
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

        const whMap = new Map<
            number,
            { key: number; name: string; total: number; completed: number }
        >();
        for (const t of techRows) {
            if (!t.wh_id || !t.warehouse_name) continue;
            let whData = whMap.get(t.wh_id);
            if (!whData) {
                whData = { key: t.wh_id, name: t.warehouse_name, total: 0, completed: 0 };
                whMap.set(t.wh_id, whData);
            }
            whData.total++;

            const cached = t.ref_intech_lensa as {
                status?: string;
                materials?: Array<{ id_material?: string; stock_teknisi?: string | number }>;
            } | null;

            if (cached?.status === 'success' && Array.isArray(cached.materials)) {
                const techNik = (t.nik ?? '').trim();
                const techMtmsMap = mtmsStockByNik.get(techNik) ?? new Map<string, number>();

                const lensMap = new Map<string, number>();
                for (const material of cached.materials) {
                    if (!material.id_material) continue;
                    const code = material.id_material.trim().toUpperCase();
                    lensMap.set(code, Number.parseInt(String(material.stock_teknisi), 10) || 0);
                }

                const allCodes = new Set([...lensMap.keys(), ...techMtmsMap.keys()]);
                let isMatch = true;
                for (const code of allCodes) {
                    const lQty = lensMap.get(code) ?? 0;
                    const mQty = techMtmsMap.get(code) ?? 0;
                    if (lQty !== mQty) {
                        isMatch = false;
                        break;
                    }
                }

                if (isMatch) {
                    whData.completed++;
                }
            }
        }

        const rows = Array.from(whMap.values());
        const sorted = [...rows].sort((left, right) => {
            const leftPercent = left.total === 0 ? 0 : left.completed / left.total;
            const rightPercent = right.total === 0 ? 0 : right.completed / right.total;
            return rightPercent - leftPercent || left.name.localeCompare(right.name);
        });

        return { success: true, data: sorted };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch Intech Lensa warehouse performance:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function getWarehouseLeaderboard(): Promise<{
    success: boolean;
    data: WarehouseChampionResponse | null;
    error?: string;
}> {
    try {
        await getSessionUser();
        const cacheKey = 'dashboard:warehouse_leaderboard_global';

        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return { success: true, data: JSON.parse(cached) };
            }
        } catch {
            // Redis error fallback
        }

        const [lensaResult, intechResult] = await Promise.all([
            getLensaWarehousePerformance(),
            getIntechLensaWarehousePerformance(),
        ]);

        const outRows =
            lensaResult.success && lensaResult.data?.outLensa ? lensaResult.data.outLensa : [];
        const rekonRows =
            lensaResult.success && lensaResult.data?.rekonLensa ? lensaResult.data.rekonLensa : [];
        const intechRows = intechResult.success && intechResult.data ? intechResult.data : [];

        const whMap = new Map<
            number,
            {
                key: number;
                name: string;
                outTotal: number;
                outCompleted: number;
                rekonTotal: number;
                rekonCompleted: number;
                intechTotal: number;
                intechCompleted: number;
            }
        >();

        const getOrCreate = (key: number, name: string) => {
            let entry = whMap.get(key);
            if (!entry) {
                entry = {
                    key,
                    name,
                    outTotal: 0,
                    outCompleted: 0,
                    rekonTotal: 0,
                    rekonCompleted: 0,
                    intechTotal: 0,
                    intechCompleted: 0,
                };
                whMap.set(key, entry);
            }
            return entry;
        };

        for (const item of outRows) {
            const entry = getOrCreate(Number(item.key), item.name);
            entry.outTotal += Number(item.total);
            entry.outCompleted += Number(item.completed);
        }

        for (const item of rekonRows) {
            const entry = getOrCreate(Number(item.key), item.name);
            entry.rekonTotal += Number(item.total);
            entry.rekonCompleted += Number(item.completed);
        }

        for (const item of intechRows) {
            const entry = getOrCreate(Number(item.key), item.name);
            entry.intechTotal += Number(item.total);
            entry.intechCompleted += Number(item.completed);
        }

        const calcPercentage = (completed: number, total: number) =>
            total === 0 ? 0 : Math.round((completed / total) * 100);

        const leaderboard: WarehouseLeaderboardEntry[] = Array.from(whMap.values()).map((wh) => {
            const pctOut = calcPercentage(wh.outCompleted, wh.outTotal);
            const pctRekon = calcPercentage(wh.rekonCompleted, wh.rekonTotal);
            const pctIntech = calcPercentage(wh.intechCompleted, wh.intechTotal);

            const score = Math.round(((pctOut + pctRekon + pctIntech) / 3) * 10) / 10;
            const totalTransactions = wh.outTotal + wh.rekonTotal + wh.intechTotal;

            return {
                key: wh.key,
                name: wh.name,
                score,
                totalTransactions,
                outLensa: { total: wh.outTotal, completed: wh.outCompleted, percentage: pctOut },
                rekonLensa: {
                    total: wh.rekonTotal,
                    completed: wh.rekonCompleted,
                    percentage: pctRekon,
                },
                intechLensaVsMtms: {
                    total: wh.intechTotal,
                    completed: wh.intechCompleted,
                    percentage: pctIntech,
                },
            };
        });

        leaderboard.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.totalTransactions !== a.totalTransactions)
                return b.totalTransactions - a.totalTransactions;
            return a.name.localeCompare(b.name);
        });

        const champion =
            leaderboard.find((w) => w.totalTransactions > 0) ||
            (leaderboard.length > 0 ? leaderboard[0] : null);

        const responseData: WarehouseChampionResponse = {
            champion,
            leaderboard,
            updatedAt: new Date().toISOString(),
        };

        try {
            await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60);
        } catch {
            // Ignore Redis cache errors
        }

        return { success: true, data: responseData };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouse leaderboard:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
