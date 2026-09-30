'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

const getOutMaterialsSchema = z.object({
    offsetMonths: z.number().int().min(0).default(0),
    limitMonths: z.number().int().min(1).max(12).default(5),
});

export async function getOutMaterials(offsetMonths = 0, limitMonths = 5) {
    const parsed = getOutMaterialsSchema.safeParse({ offsetMonths, limitMonths });
    if (!parsed.success) {
        actionLogger.warn('Invalid parameters for getOutMaterials', {
            issues: parsed.error.issues,
        });
        return {
            success: false,
            data: [],
            counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
        };
    }
    const { offsetMonths: validOffset, limitMonths: validLimit } = parsed.data;

    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - validOffset);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (validOffset + validLimit));

        let query = db
            .selectFrom('inventory.sap_out_header as h')
            .leftJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'h.warehouse_id')
            .selectAll('h')
            .select(['t.name as nama_teknisi', 'wh.name as nama_gudang'])
            .where('h.request_time', '<=', endDate)
            .where('h.request_time', '>', startDate)
            .orderBy('h.request_time', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('h.warehouse_id', 'in', warehouseIds as number[]);
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
        actionLogger.error(
            'Error fetching out materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
        };
    }
}

const getOutMaterialItemsSchema = z.object({
    headerId: z.number().int().positive(),
});

export async function getOutMaterialItems(headerId: number) {
    const parsed = getOutMaterialItemsSchema.safeParse({ headerId });
    if (!parsed.success) {
        actionLogger.warn('Invalid headerId for getOutMaterialItems', {
            issues: parsed.error.issues,
        });
        return { success: false, data: [] };
    }

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
            .where('i.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error) {
        actionLogger.error(
            'Error fetching out material items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}
