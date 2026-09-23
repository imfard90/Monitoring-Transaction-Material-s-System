'use server';

import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getOutMaterials() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.sap_out_header as h')
            .leftJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'h.warehouse_id')
            .selectAll('h')
            .select(['t.name as nama_teknisi', 'wh.name as nama_gudang'])
            .orderBy('h.request_time', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('h.warehouse_id', 'in', warehouseIds as any);
        }

        const headers = await query.execute();

        // Group by status for the cards
        const counts = {
            wait_approve: 0,
            request: 0,
            intech: 0,
            close: 0,
        };

        headers.forEach((h) => {
            const status = h.end_status as string;
            if (status === 'wait_approve') counts.wait_approve++;
            else if (status === 'request') counts.request++;
            else if (status === 'intech') counts.intech++;
            else if (status === 'close') counts.close++;
        });

        return { success: true, data: headers, counts };
    } catch (error) {
        console.error('Error fetching out materials:', error);
        return {
            success: false,
            data: [],
            counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
        };
    }
}

export async function getOutMaterialItems(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.sap_out_items as i')
            .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .select([
                'i.id',
                'i.qty_req',
                'i.qty_used',
                'm.code as designator_code',
                'm.description as material_description',
            ])
            .where('i.header_id', '=', String(headerId) as any)
            .execute();

        return { success: true, data: items };
    } catch (error) {
        console.error('Error fetching out material items:', error);
        return { success: false, data: [] };
    }
}
