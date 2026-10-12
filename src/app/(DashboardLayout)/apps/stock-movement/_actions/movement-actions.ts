'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

export interface GetStockMovementsOptions {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouse?: string;
    material?: string;
    types?: string[];
    startDate?: string;
    endDate?: string;
}

export interface StockMovementPaginationData {
    movements: Array<{
        id: number;
        created_at: Date | string;
        movement_type: string;
        qty_delta: number;
        qty_after: number;
        reference_trx: string | null;
        notes: string | null;
        created_by: string | null;
        warehouse_name: string | null;
        material_code: string | null;
        material_name: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getStockMovements(offsetMonths = 0, limitMonths = 5) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let query = db
            .selectFrom('inventory.stock_movement as sm')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'sm.warehouse_id')
            .leftJoin('inventory.materials as m', 'm.id', 'sm.designator_id')
            .select([
                'sm.id',
                'sm.created_at',
                'sm.movement_type',
                'sm.qty_delta',
                'sm.qty_after',
                'sm.reference_trx',
                'sm.notes',
                'sm.created_by',
                'w.name as warehouse_name',
                'm.code as material_code',
                'm.description as material_name',
            ])
            .where('sm.created_at', '<=', endDate)
            .where('sm.created_at', '>', startDate)
            .orderBy('sm.created_at', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('sm.warehouse_id', 'in', warehouseIds as number[]);
        }

        const movements = await query.execute();
        return movements;
    } catch (error) {
        actionLogger.error(
            'Error fetching stock movements:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function getStockMovementsPaginated(options: GetStockMovementsOptions = {}) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
        const offset = (page - 1) * pageSize;

        let baseQuery = db
            .selectFrom('inventory.stock_movement as sm')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'sm.warehouse_id')
            .leftJoin('inventory.materials as m', 'm.id', 'sm.designator_id');

        if (isStaff && warehouseIds.length > 0) {
            baseQuery = baseQuery.where('sm.warehouse_id', 'in', warehouseIds as number[]);
        }

        if (options.warehouse && options.warehouse !== 'all') {
            baseQuery = baseQuery.where('w.name', '=', options.warehouse);
        }

        if (options.material && options.material !== 'all') {
            baseQuery = baseQuery.where('m.code', '=', options.material);
        }

        if (options.types && options.types.length > 0) {
            baseQuery = baseQuery.where(
                sql<boolean>`sm.movement_type::text = ANY(${options.types})`
            );
        }

        if (options.startDate) {
            const start = new Date(options.startDate);
            start.setHours(0, 0, 0, 0);
            baseQuery = baseQuery.where('sm.created_at', '>=', start);
        }

        if (options.endDate) {
            const end = new Date(options.endDate);
            end.setHours(23, 59, 59, 999);
            baseQuery = baseQuery.where('sm.created_at', '<=', end);
        }

        if (options.search?.trim()) {
            const searchVal = `%${options.search.trim()}%`;
            baseQuery = baseQuery.where((eb) =>
                eb.or([
                    eb('m.code', 'ilike', searchVal),
                    eb('m.description', 'ilike', searchVal),
                    eb('sm.reference_trx', 'ilike', searchVal),
                    eb('w.name', 'ilike', searchVal),
                    sql<boolean>`sm.movement_type::text ILIKE ${searchVal}`,
                ])
            );
        }

        const countRes = await baseQuery
            .select((eb) => eb.fn.count('sm.id').as('total'))
            .executeTakeFirst();
        const total = Number(countRes?.total ?? 0);

        const rows = await baseQuery
            .select([
                'sm.id',
                'sm.created_at',
                'sm.movement_type',
                'sm.qty_delta',
                'sm.qty_after',
                'sm.reference_trx',
                'sm.notes',
                'sm.created_by',
                'w.name as warehouse_name',
                'm.code as material_code',
                'm.description as material_name',
            ])
            .orderBy('sm.created_at', 'desc')
            .limit(pageSize)
            .offset(offset)
            .execute();

        return {
            success: true,
            data: {
                movements: rows,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching paginated stock movements:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Failed to fetch stock movements',
            data: {
                movements: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
            },
        };
    }
}

export async function getStockMovementFilterOptions() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whQuery = db.selectFrom('inventory.mas_wh').select('name').orderBy('name', 'asc');
        if (isStaff && warehouseIds.length > 0) {
            whQuery = whQuery.where('id', 'in', warehouseIds as number[]);
        }
        const whs = await whQuery.execute();

        const mats = await db
            .selectFrom('inventory.materials')
            .select('code')
            .orderBy('code', 'asc')
            .execute();

        const types = await db
            .selectFrom('inventory.stock_movement')
            .select('movement_type')
            .distinct()
            .orderBy('movement_type', 'asc')
            .execute();

        return {
            warehouses: whs.map((w: any) => w.name).filter(Boolean) as string[],
            materials: mats.map((m: any) => m.code).filter(Boolean) as string[],
            types: types.map((t: any) => t.movement_type).filter(Boolean) as string[],
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching stock movement filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            warehouses: [],
            materials: [],
            types: [],
        };
    }
}
