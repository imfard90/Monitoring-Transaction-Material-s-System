import type { Kysely } from 'kysely';

// Temporary type alias until database.types.ts is regenerated
type Database = Record<string, any>;

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
    limit?: number;
    offset?: number;
}

export function createStockOpnameRepository(db: Kysely<Database>) {
    return {
        async createLog(data: StockOpnameLogInsert): Promise<StockOpnameLog> {
            const result = await db
                .insertInto('inventory.stock_opname_log')
                .values({
                    warehouse_id: data.warehouse_id,
                    warehouse_name: data.warehouse_name,
                    details: JSON.stringify(data.details) as any,
                    total_items: data.total_items,
                    total_difference: data.total_difference,
                    created_by: data.created_by,
                    status: data.status ?? 'pending',
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
            let query = db
                .selectFrom('inventory.stock_opname_log')
                .selectAll()
                .orderBy('created_at', 'desc');

            if (filters.warehouseIds?.length) {
                query = query.where('warehouse_id', 'in', filters.warehouseIds);
            }

            if (filters.status) {
                query = query.where('status', '=', filters.status);
            }

            const limit = filters.limit ?? 50;
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
            const result = await db
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
            await db
                .updateTable('inventory.stock_opname_log')
                .set({
                    status: 'approved',
                    approved_by: approvedBy,
                    approved_at: new Date().toISOString(),
                })
                .where('id', '=', id)
                .where('status', '=', 'pending')
                .execute();
        },

        async rejectLog(id: number, approvedBy: string, reason: string): Promise<void> {
            await db
                .updateTable('inventory.stock_opname_log')
                .set({
                    status: 'rejected',
                    approved_by: approvedBy,
                    approved_at: new Date().toISOString(),
                    approval_reason: reason,
                })
                .where('id', '=', id)
                .where('status', '=', 'pending')
                .execute();
        },

        async countLogs(
            filters: Pick<StockOpnameFilters, 'warehouseIds' | 'status'> = {}
        ): Promise<number> {
            let query = db
                .selectFrom('inventory.stock_opname_log')
                .select(db.fn.count<number>('id').as('count'));

            if (filters.warehouseIds?.length) {
                query = query.where('warehouse_id', 'in', filters.warehouseIds);
            }

            if (filters.status) {
                query = query.where('status', '=', filters.status);
            }

            const result = await query.executeTakeFirst();
            return Number(result?.count ?? 0);
        },
    };
}
