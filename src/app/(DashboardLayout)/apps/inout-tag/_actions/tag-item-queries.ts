'use server';

import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import type { InOutTagItem } from '@/lib/types/inventory';

export async function getInOutTagItems(headerId: number, type?: string) {
    try {
        let items: InOutTagItem[];
        if (type === 'return') {
            const rawReturnItems = await db
                .selectFrom('inventory.return_material_items as i')
                .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
                .select([
                    'i.id',
                    'i.qty',
                    'm.code as designator_code',
                    'm.description as material_description',
                ])
                .where('i.header_id', '=', String(headerId))
                .execute();

            // Map to match InOutTagItem structure
            items = rawReturnItems.map((item) => ({
                ...item,
                action: 'request' as const, // Return material items are considered 'request' in this context
            }));
        } else {
            const rawItems = await db
                .selectFrom('inventory.inout_tag_items as i')
                .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
                .select([
                    'i.id',
                    'i.action',
                    'i.qty',
                    'm.code as designator_code',
                    'm.description as material_description',
                ])
                .where('i.header_id', '=', String(headerId))
                .execute();

            items = rawItems.map((item) => ({
                ...item,
                action: item.action as 'request' | 'send' | 'accept',
            }));
        }

        return { success: true, data: items };
    } catch (error) {
        actionLogger.error(
            'Error fetching tag items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getWarehouses() {
    try {
        const whs = await db.selectFrom('inventory.mas_wh').selectAll().execute();
        return { success: true, data: whs };
    } catch (error) {
        actionLogger.error(
            'Error fetching warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterials() {
    try {
        const mats = await db.selectFrom('inventory.materials').selectAll().execute();
        return { success: true, data: mats };
    } catch (error) {
        actionLogger.error(
            'Error fetching materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterialsWithStock(fromWhId?: number | null) {
    try {
        // If no WH selected, or vendor, return all materials with stock ~
        let checkStock = false;

        if (fromWhId) {
            const wh = await db
                .selectFrom('inventory.mas_wh')
                .select('check_stock')
                .where('id', '=', Number(fromWhId))
                .executeTakeFirst();
            if (wh?.check_stock) {
                checkStock = true;
            }
        }

        if (checkStock) {
            // Check stock
            const mats = await db
                .selectFrom('inventory.materials as m')
                .innerJoin('inventory.stock_balance as sb', 'sb.designator_id', 'm.id')
                .selectAll('m')
                .select('sb.qty_stock')
                .where('sb.warehouse_id', '=', Number(fromWhId))
                .where('sb.qty_stock', '>', 0)
                .execute();

            return { success: true, data: mats };
        } else {
            const mats = await db.selectFrom('inventory.materials').selectAll().execute();
            const data = mats.map((m) => ({ ...m, qty_stock: '~' }));
            return { success: true, data };
        }
    } catch (error) {
        actionLogger.error(
            'Error fetching materials with stock:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getInoutTagItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.inout_tag_items as items')
            .innerJoin('inventory.materials as mat', 'items.designator_id', 'mat.id')
            .select([
                'items.id',
                'items.header_id',
                'items.action',
                'items.action_id',
                'items.designator_id',
                'items.qty',
                'mat.code as material_code',
                'mat.description as material_description',
                'mat.unit as material_unit',
            ])
            .where('items.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch tag items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getReturnMaterialItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.return_material_items as ri')
            .innerJoin('inventory.materials as m', 'm.id', 'ri.designator_id')
            .select([
                'ri.id',
                'ri.designator_id',
                'ri.qty',
                'm.code as material_code',
                'm.description as material_description',
                'm.unit as material_unit',
            ])
            .where('ri.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch return material items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function getInOutTagFilterOptions() {
    try {
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select('name')
            .orderBy('name', 'asc')
            .execute();
        return {
            toWhOptions: whs.map((w) => w.name).filter(Boolean) as string[],
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching inout tag filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { toWhOptions: [] };
    }
}
