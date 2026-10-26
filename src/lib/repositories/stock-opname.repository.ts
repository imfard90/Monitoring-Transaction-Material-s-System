import type { ColumnType, Generated, Kysely } from 'kysely';

export interface InventoryStockOpnameLogRow {
    id: Generated<number>;
    warehouse_id: number;
    warehouse_name: string;
    details: string | unknown;
    total_items: number;
    total_difference: number;
    status: Generated<'pending' | 'approved' | 'rejected'>;
    approval_reason: string | null;
    approved_by: string | null;
    approved_at: ColumnType<Date | null, string | null, string | null>;
    created_by: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

type StockOpnameDatabase = {
    'inventory.stock_opname_log': InventoryStockOpnameLogRow;
};

export interface StockOpnameLogInsert {
    warehouse_id: number;
    warehouse_name: string;
    details: Array<{
        material_code: string;
        material_name: string;
        qty_system: number;
        qty_opname: number;
        difference: number;
    }>;
    total_items: number;
    total_difference: number;
    created_by: string; // NIK
    status?: 'pending' | 'approved' | 'rejected';
}

export interface StockOpnameLog {
    id: number;
    warehouse_id: number;
    warehouse_name: string;
    details: Array<{
        material_code: string;
        material_name: string;
        qty_system: number;
        qty_opname: number;
        difference: number;
    }>;
    total_items: number;
    total_difference: number;
    status: 'pending' | 'approved' | 'rejected';
    approval_reason: string | null;
    approved_by: string | null;
    approved_at: Date | null;
    created_by: string;
    created_at: Date;
    updated_at: Date;
}

export interface StockOpnameFilters {
    warehouseIds?: number[];
    status?: 'pending' | 'approved' | 'rejected';
    search?: string;
    limit?: number;
    offset?: number;
}

export function createStockOpnameRepository(db: Kysely<any>) {
    const typedDb = db as unknown as Kysely<StockOpnameDatabase>;

    return {
        async createLog(data: StockOpnameLogInsert): Promise<StockOpnameLog> {
            const result = await typedDb
                .insertInto('inventory.stock_opname_log')
                .values({
                    warehouse_id: data.warehouse_id,
                    warehouse_name: data.warehouse_name,
                    details: JSON.stringify(data.details),
                    total_items: data.total_items,
                    total_difference: data.total_difference,
                    created_by: data.created_by,
                    status: (data.status ?? 'pending') as any,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            return {
                ...result,
                details:
                    typeof result.details === 'string'
                        ? JSON.parse(result.details)
                        : result.details,
                created_at: new Date(result.created_at),
                updated_at: new Date(result.updated_at),
                approved_at: result.approved_at ? new Date(result.approved_at) : null,
            } as StockOpnameLog;
        },

        async getLogs(filters: StockOpnameFilters = {}): Promise<StockOpnameLog[]> {
            let query = typedDb
                .selectFrom('inventory.stock_opname_log')
                .selectAll()
                .orderBy('created_at', 'desc');

            if (filters.warehouseIds?.length) {
                query = query.where('warehouse_id', 'in', filters.warehouseIds);
            }

            if (filters.status) {
                query = query.where('status', '=', filters.status);
            }

            if (filters.search?.trim()) {
                const term = `%${filters.search.trim()}%`;
                query = query.where((eb) =>
                    eb.or([
                        eb('warehouse_name', 'ilike', term),
                        eb('created_by', 'ilike', term),
                    ])
                );
            }

            const limit = filters.limit ?? 100;
            const offset = filters.offset ?? 0;

            const results = await query.limit(limit).offset(offset).execute();

            return results.map((row) => ({
                ...row,
                details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
                created_at: new Date(row.created_at),
                updated_at: new Date(row.updated_at),
                approved_at: row.approved_at ? new Date(row.approved_at) : null,
            })) as StockOpnameLog[];
        },

        async getLogById(id: number): Promise<StockOpnameLog | null> {
            const result = await typedDb
                .selectFrom('inventory.stock_opname_log')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst();

            if (!result) return null;

            return {
                ...result,
                details:
                    typeof result.details === 'string'
                        ? JSON.parse(result.details)
                        : result.details,
                created_at: new Date(result.created_at),
                updated_at: new Date(result.updated_at),
                approved_at: result.approved_at ? new Date(result.approved_at) : null,
            } as StockOpnameLog;
        },

        async approveLog(id: number, approvedBy: string): Promise<void> {
            await typedDb
                .updateTable('inventory.stock_opname_log')
                .set({
                    status: 'approved' as any,
                    approved_by: approvedBy,
                    approved_at: new Date().toISOString() as any,
                })
                .where('id', '=', id)
                .where('status', '=', 'pending' as any)
                .execute();
        },

        async rejectLog(id: number, approvedBy: string, reason: string): Promise<void> {
            await typedDb
                .updateTable('inventory.stock_opname_log')
                .set({
                    status: 'rejected' as any,
                    approved_by: approvedBy,
                    approved_at: new Date().toISOString() as any,
                    approval_reason: reason,
                })
                .where('id', '=', id)
                .where('status', '=', 'pending' as any)
                .execute();
        },

        async countLogs(
            filters: Pick<StockOpnameFilters, 'warehouseIds' | 'status' | 'search'> = {}
        ): Promise<number> {
            let query = typedDb
                .selectFrom('inventory.stock_opname_log')
                .select((eb) => eb.fn.count<number>('id').as('count'));

            if (filters.warehouseIds?.length) {
                query = query.where('warehouse_id', 'in', filters.warehouseIds);
            }

            if (filters.status) {
                query = query.where('status', '=', filters.status);
            }

            if (filters.search?.trim()) {
                const term = `%${filters.search.trim()}%`;
                query = query.where((eb) =>
                    eb.or([
                        eb('warehouse_name', 'ilike', term),
                        eb('created_by', 'ilike', term),
                    ])
                );
            }

            const result = await query.executeTakeFirst();
            return Number(result?.count ?? 0);
        },
    };
}
