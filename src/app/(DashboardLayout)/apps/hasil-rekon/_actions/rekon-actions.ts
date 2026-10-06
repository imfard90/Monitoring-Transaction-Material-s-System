'use server';

import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

export interface HasilRekonData {
    header_id: number;
    item_id: number;
    sap_out_id: number;
    designator_id: number;
    created_at: string | null;
    trx_id: string | null;
    sap_number: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number | null;
}

export async function getHasilRekon(offsetMonths = 0, limitMonths = 5): Promise<HasilRekonData[]> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let query = db
            .selectFrom('inventory.transaction_used_header as tuh')
            .innerJoin('inventory.transaction_used_item as tui', 'tui.used_id', 'tuh.id')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'tuh.sap_out_id')
            .innerJoin('inventory.materials as m', 'm.id', 'tui.designator_id')
            .select([
                'tuh.id as header_id',
                'tui.id as item_id',
                'soh.id as sap_out_id',
                'tui.created_at',
                'tuh.id_trx',
                'soh.sap_number',
                'tuh.name_wh as warehouse_name',
                'tuh.nik_teknisi',
                'tuh.wo_type',
                'tuh.wo_number',
                'm.code as material_code',
                'm.description as material_name',
                'm.id as designator_id',
                'tui.qty',
            ])
            .where('tui.created_at', '<=', endDate)
            .where('tui.created_at', '>', startDate)
            .orderBy('tui.created_at', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            // Filter via sap_out_header warehouse_id
            query = query.where('soh.warehouse_id', 'in', warehouseIds as readonly number[]);
        }

        const data = await query.execute();

        // Standardize output format
        return data.map((item) => ({
            header_id: Number(item.header_id),
            item_id: Number(item.item_id),
            sap_out_id: Number(item.sap_out_id),
            designator_id: Number(item.designator_id),
            created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
            trx_id: String(item.id_trx),
            sap_number: String(item.sap_number),
            warehouse_name: String(item.warehouse_name),
            nik: String(item.nik_teknisi),
            type: String(item.wo_type),
            workorder: String(item.wo_number),
            material_code: String(item.material_code),
            material_name: String(item.material_name),
            qty: Number(item.qty),
        }));
    } catch (error) {
        actionLogger.error(
            'Error fetching hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}
