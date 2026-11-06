/**
 * Out SAP (SAP Out) read operations.
 */
import { sql } from 'kysely';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { createStoredProcedureRepository } from './stored-procedures';

export const createOutSapRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    /**
     * Get Out SAP headers with optional warehouse scoping and aggregated counts
     */
    getOutSaps: async (params?: { warehouseIds?: readonly number[]; limit?: number }) => {
        let sapQuery = dbClient
            .selectFrom('inventory.sap_out_header as soh')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'soh.warehouse_id')
            .select([
                'soh.id',
                'soh.id_trx',
                'soh.nik_teknisi',
                't.name as nama_teknisi',
                'soh.name_sa',
                'soh.warehouse_id',
                'w.name as nama_gudang',
                'soh.id_reservasi',
                'soh.sap_number',
                'soh.request_id',
                'soh.request_time',
                'soh.end_status',
            ])
            .orderBy('soh.request_time', 'desc');

        let countQuery = dbClient.selectFrom('inventory.sap_out_header');

        if (params?.warehouseIds !== undefined) {
            if (params.warehouseIds.length === 0) {
                return {
                    data: [],
                    counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
                };
            }
            sapQuery = sapQuery.where('soh.warehouse_id', 'in', params.warehouseIds as number[]);
            countQuery = countQuery.where('warehouse_id', 'in', params.warehouseIds as number[]);
        }

        const data = await sapQuery.limit(params?.limit ?? 200).execute();

        const resultCount = await countQuery
            .select([
                sql<number>`SUM(CASE WHEN end_status = 'wait_approve' THEN 1 ELSE 0 END)`.as(
                    'wait_approve'
                ),
                sql<number>`SUM(CASE WHEN end_status = 'request' THEN 1 ELSE 0 END)`.as('request'),
                sql<number>`SUM(CASE WHEN end_status = 'intech' THEN 1 ELSE 0 END)`.as('intech'),
                sql<number>`SUM(CASE WHEN end_status = 'close' THEN 1 ELSE 0 END)`.as('close'),
            ])
            .executeTakeFirst();

        const counts = {
            wait_approve: Number(resultCount?.wait_approve || 0),
            request: Number(resultCount?.request || 0),
            intech: Number(resultCount?.intech || 0),
            close: Number(resultCount?.close || 0),
        };

        return { data, counts };
    },

    /**
     * Get Out SAP items by header ID with optional warehouse scoping
     */
    getOutSapItemsByHeaderId: async (
        headerId: number | string,
        warehouseIds?: readonly number[]
    ) => {
        let query = dbClient
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .innerJoin('inventory.sap_out_header as h', 'h.id', 'i.header_id')
            .select([
                'i.id',
                'i.header_id',
                'i.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'i.qty_req',
                'i.qty_used',
                'i.unit_price',
            ])
            .where('i.header_id', '=', String(headerId));

        if (warehouseIds !== undefined) {
            if (warehouseIds.length === 0) return [];
            query = query.where('h.warehouse_id', 'in', warehouseIds as readonly number[]);
        }

        return query.execute();
    },

    /**
     * Get Out SAP header by ID
     */
    getOutSapHeaderById: (headerId: number | string) =>
        dbClient
            .selectFrom('inventory.sap_out_header')
            .selectAll()
            .where('id', '=', String(headerId))
            .executeTakeFirst(),

    /**
     * Update Out SAP status to intech and invoke stock reduction procedure atomically
     */
    updateOutSapStatusToIntech: async (headerId: number | string, userNik: string) => {
        return dbClient.transaction().execute(async (trx) => {
            await trx
                .updateTable('inventory.sap_out_header')
                .set({ end_status: 'intech' })
                .where('id', '=', String(headerId))
                .execute();

            const header = await trx
                .selectFrom('inventory.sap_out_header')
                .select(['warehouse_id'])
                .where('id', '=', String(headerId))
                .executeTakeFirst();

            if (!header) {
                throw new Error('Data Out SAP tidak ditemukan.');
            }

            const warehouseId = Number(header.warehouse_id);
            const repo = createStoredProcedureRepository(trx);
            await repo.recordSapOut({
                headerId: Number(headerId),
                warehouseId,
                createdBy: userNik,
            });

            return { warehouseId };
        });
    },
});

export type OutSapRepository = ReturnType<typeof createOutSapRepository>;
