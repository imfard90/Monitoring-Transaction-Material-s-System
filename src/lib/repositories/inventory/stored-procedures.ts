/**
 * Inventory stored procedure wrappers.
 *
 * Priority layer: every critical inventory mutation goes through a stored
 * procedure in the `inventory` schema for atomicity and data integrity.
 * Signatures must stay in sync with the active migrations.
 */

import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@/lib/db/database.types';

export const createStoredProcedureRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    // ==================== Stored Procedure Wrappers (Priority) ====================

    /**
     * Create InOut Tag - atomic operation
     * Signature matches inventory.sp_create_inout_tag (migration 047)
     */
    createInOutTag: async (params: {
        fromWhId: number | null;
        toWhId: number | null;
        requestId?: string | null;
        vendorName?: string | null;
        cost: number;
        items: Array<{
            designator_id: number;
            qty: number;
            action?: string;
            action_id?: string;
        }>;
        createdBy?: string | null;
    }) => {
        const res = await sql<{ p_id_trx: string }>`
            CALL inventory.sp_create_inout_tag(
                ${params.fromWhId ? params.fromWhId : null}::bigint,
                ${params.toWhId ? params.toWhId : null}::bigint,
                ${params.requestId || null},
                ${params.vendorName || null},
                ${params.cost},
                ${JSON.stringify(params.items)}::jsonb,
                null,
                ${params.createdBy || null}::varchar
            )
        `.execute(dbClient);
        return res.rows[0]?.p_id_trx;
    },

    /**
     * Update InOut Tag (request/send/accept) - atomic operation
     * Signature matches inventory.sp_update_inout_tag (migration 047)
     * SP accepts 5 params: p_header_id, p_action, p_action_id, p_items_json, p_user_nik
     */
    updateInOutTag: (params: {
        headerId: number;
        actionType: 'request' | 'send' | 'accept';
        actionId: string;
        items: Array<{ designator_id: number; qty: number }>;
        userNik?: string | null;
    }) =>
        sql`CALL inventory.sp_update_inout_tag(
            ${params.headerId}::integer,
            ${params.actionType}::varchar,
            ${params.actionId}::varchar,
            ${JSON.stringify(params.items)}::jsonb,
            ${params.userNik || null}::varchar
        )`.execute(dbClient),

    /**
     * Record Material Used - atomic operation
     */
    recordMaterialUsed: (params: {
        warehouseId: number;
        materialId: number;
        qty: number;
        transactionId: string;
        notes?: string | null;
        createdBy: string;
    }) =>
        sql`CALL inventory.sp_record_material_used(
            ${params.warehouseId}::integer,
            ${params.materialId}::integer,
            ${params.qty}::numeric,
            ${params.transactionId}::varchar,
            ${params.notes ?? null}::varchar,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Edit Transaction Used - atomic operation
     * Matches inventory.sp_edit_transaction_used signature (migration 004)
     */
    editTransactionUsed: (params: {
        usedItemId: number | null;
        usedHeaderId: number;
        sapOutItemId: number;
        designatorId: number;
        newQty: number;
        oldQty: number;
        createdBy: string;
    }) =>
        sql`CALL inventory.sp_edit_transaction_used(
            ${params.usedItemId}::bigint,
            ${params.usedHeaderId}::bigint,
            ${params.sapOutItemId}::bigint,
            ${params.designatorId}::bigint,
            ${params.newQty}::numeric,
            ${params.oldQty}::numeric,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Create Out SAP - atomic operation via sp_create_out_sap (migration 021)
     */
    createOutSap: async (params: {
        warehouseId: number;
        nikTeknisi: string;
        nameSa: string;
        idReservasi: string | null;
        sapNumber: string;
        requestId: string;
        createdBy: string;
        items: Array<{
            designator_id: number;
            qty_req: number;
            unit_price?: number;
        }>;
    }) => {
        const res = await sql<{ p_header_id: string; p_id_trx: string }>`
            CALL inventory.sp_create_out_sap(
                ${params.warehouseId}::integer,
                ${params.nikTeknisi.trim()}::varchar,
                ${params.nameSa.trim()}::varchar,
                ${params.idReservasi ? params.idReservasi.trim() : null}::varchar,
                ${params.sapNumber.trim()}::varchar,
                ${params.requestId.trim()}::varchar,
                ${params.createdBy.trim()}::varchar,
                ${JSON.stringify(params.items)}::jsonb,
                null,
                null
            )
        `.execute(dbClient);

        const row = res.rows[0];
        return {
            headerId: Number(row?.p_header_id),
            idTrx: row?.p_id_trx,
        };
    },

    /**
     * Record SAP Out - atomic operation
     */
    recordSapOut: (params: { headerId: number; warehouseId: number; createdBy: string }) =>
        sql`CALL inventory.sp_sap_out(
            ${params.headerId}::bigint,
            ${params.warehouseId}::integer,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Create Return Request - atomic operation via sp_create_return_request (migration 040)
     */
    createReturnRequest: async (params: {
        sapOutId: number;
        nikTeknisi: string;
        warehouseId: number;
        notes?: string | null;
        items: Array<{
            sap_out_item_id: number;
            designator_id: number;
            qty: number;
        }>;
        createdBy: string;
    }) => {
        const res = await sql<{ id_trx: string }>`
            SELECT inventory.sp_create_return_request(
                ${params.sapOutId}::bigint,
                ${params.nikTeknisi}::varchar,
                ${params.warehouseId}::bigint,
                ${params.notes ?? null}::text,
                ${JSON.stringify(params.items)}::jsonb,
                ${params.createdBy}::varchar
            ) as id_trx
        `.execute(dbClient);
        return res.rows[0]?.id_trx;
    },

    /**
     * Record Return Material - atomic operation
     * Matches inventory.sp_return_material(p_header_id, p_accept_id, p_user_nik) (migration 047)
     */
    recordReturnMaterial: (params: {
        headerId: number;
        acceptId: string;
        userNik?: string | null;
    }) =>
        sql`CALL inventory.sp_return_material(
            ${params.headerId}::bigint,
            ${params.acceptId}::varchar,
            ${params.userNik || null}::varchar
        )`.execute(dbClient),

    /**
     * Cancel InOut Tag or Return Material - atomic operation
     * Signature matches inventory.sp_cancel_inout_tag (migration 047)
     */
    cancelInOutTag: (params: {
        headerId: number;
        type?: string;
        reason: string;
        userNik: string;
    }) =>
        sql`CALL inventory.sp_cancel_inout_tag(
            ${params.headerId}::bigint,
            ${params.type ?? 'inout'}::varchar,
            ${params.reason}::text,
            ${params.userNik}::varchar
        )`.execute(dbClient),

    /**
     * Record Rekon Lensa v2 - atomic operation
     * Signature matches inventory.sp_record_rekon_lensa_v2 (migration 006)
     */
    recordRekonLensa: (params: {
        idTrx: string;
        idPemakaian: string;
        woNumber: string;
        woType: string;
        nikTeknisi: string;
        nameGudang: string;
        nameSa: string;
        notes: string | null;
        createdBy: string;
        materials: Array<{
            out_sap: string | null;
            designator_id: string;
            qty: number;
            unit_price: number;
        }>;
    }) =>
        sql`CALL inventory.sp_record_rekon_lensa_v2(
            ${params.idTrx}::varchar,
            ${params.idPemakaian}::varchar,
            ${params.woNumber}::varchar,
            ${params.woType}::varchar,
            ${params.nikTeknisi}::varchar,
            ${params.nameGudang}::varchar,
            ${params.nameSa}::varchar,
            ${params.notes}::text,
            ${params.createdBy}::varchar,
            ${JSON.stringify(params.materials)}::json
        )`.execute(dbClient),

    /**
     * Submit Rekon Intech — atomic operation (P0-D1 fix)
     * Encapsulates header insert, item insert, sap_out_items update, audit movement, auto-close.
     */
    submitRekonIntech: (params: {
        idTrx: string;
        nik: string;
        sapOutId: string;
        woNumber: string;
        woType: string | null;
        nameSa: string;
        nameWh: string;
        createdBy: string;
        items: Array<{
            designator_id: number;
            sap_out_item_id: number;
            qty: number;
            notes: string | null;
        }>;
    }) =>
        sql`CALL inventory.sp_submit_rekon_intech(
            ${params.idTrx}::varchar,
            ${params.nik}::varchar,
            ${params.sapOutId}::varchar,
            ${params.woNumber}::varchar,
            ${params.woType}::varchar,
            ${params.nameSa}::varchar,
            ${params.nameWh}::varchar,
            ${params.createdBy}::varchar,
            ${JSON.stringify(params.items)}::jsonb
        )`.execute(dbClient),

    /**
     * Generate deterministic 4-digit sequence for Intech rekon (trx_used_seq)
     */
    generateTrxUsedSeq: async (): Promise<string> => {
        const res = await sql<{ seq: string }>`
            SELECT to_char(nextval('inventory.trx_used_seq'), 'FM0000') as seq
        `.execute(dbClient);
        return res.rows[0]?.seq ?? '0001';
    },

    /**
     * Generate deterministic 4-digit sequence for Lensa rekon (trx_used_lensa_seq)
     */
    generateTrxUsedLensaSeq: async (): Promise<string> => {
        const res = await sql<{ seq: string }>`
            SELECT to_char(nextval('inventory.trx_used_lensa_seq'), 'FM0000') as seq
        `.execute(dbClient);
        return res.rows[0]?.seq ?? '0001';
    },

    /**
     * Flag WO Lensa as reconciled (matches strictly on pemakaian_id and wo_number)
     */
    markWoLensaReconciled: async (pemakaianId: string, woNumber?: string): Promise<void> => {
        const cleanPemakaianId = pemakaianId.trim();
        const cleanWoNumber = woNumber?.trim();
        let query = dbClient.updateTable('inventory.wo_lensa_header').set({ rekon_check: true });

        if (cleanPemakaianId && cleanWoNumber) {
            query = query.where((eb) =>
                eb.and([
                    eb(sql`CAST(pemakaian_id AS VARCHAR)`, '=', cleanPemakaianId),
                    eb('wo_number', '=', cleanWoNumber),
                ])
            );
        } else if (cleanPemakaianId) {
            query = query.where(sql`CAST(pemakaian_id AS VARCHAR)`, '=', cleanPemakaianId);
        } else if (cleanWoNumber) {
            query = query.where('wo_number', '=', cleanWoNumber);
        } else {
            return;
        }

        await query.execute();
    },

    /**
     * Rollback reconciled WO Lensa (restore intech in sap_out_items, reset sap_out_header to intech,
     * insert stock_movement audit trail, and delete rekon & wo records)
     */
    rollbackReconciledWOLensa: async (
        pemakaianId: string,
        notes?: string,
        createdBy?: string
    ): Promise<void> => {
        await sql`CALL inventory.sp_rollback_rekon_lensa_by_pemakaian(
            ${pemakaianId},
            ${notes ?? null},
            ${createdBy ?? 'system'}
        )`.execute(dbClient);
    },
});

export type StoredProcedureRepository = ReturnType<typeof createStoredProcedureRepository>;
