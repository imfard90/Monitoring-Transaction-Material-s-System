'use server';

import { getSessionUser } from '@/lib/auth-server';
import { actionLogger } from '@/lib/logger';
import {
    type HasilRekonItem,
    type HasilRekonPaginatedFilter,
    inventoryRepository,
} from '@/lib/repositories/inventory.repository';

export type HasilRekonData = HasilRekonItem;

export interface NewHasilRekonData {
    header_id: number;
    item_id: number;
    created_at: string | null;
    trx_id: string | null;
    id_pemakaian: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    sap_number: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number | null;
}

export async function getNewHasilRekon(
    offsetMonths = 0,
    limitMonths = 5
): Promise<NewHasilRekonData[]> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return [];
        }

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        return await inventoryRepository.getNewHasilRekon({
            startDate,
            endDate,
            warehouseIds: isStaff ? warehouseIds : undefined,
        });
    } catch (error) {
        actionLogger.error(
            'Error fetching new hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function getHasilRekon(offsetMonths = 0, limitMonths = 5): Promise<HasilRekonData[]> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return [];
        }

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        return await inventoryRepository.getOldHasilRekon({
            startDate,
            endDate,
            warehouseIds: isStaff ? warehouseIds : undefined,
        });
    } catch (error) {
        actionLogger.error(
            'Error fetching hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export interface GetHasilRekonPaginatedOptions {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouse?: string;
    type?: string;
    material?: string;
    startDate?: string;
    endDate?: string;
}

export async function getHasilRekonPaginated(options: GetHasilRekonPaginatedOptions = {}) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));

        if (isStaff && warehouseIds.length === 0) {
            return {
                success: true,
                data: {
                    items: [],
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0,
                },
            };
        }

        const filterParams: HasilRekonPaginatedFilter = {
            ...options,
            page,
            pageSize,
            warehouseIds: isStaff ? warehouseIds : undefined,
        };

        const result = await inventoryRepository.getHasilRekonPaginated(filterParams);

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching paginated hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Failed to fetch hasil rekon',
            data: {
                items: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
            },
        };
    }
}

export async function getHasilRekonFilterOptions() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        if (isStaff && warehouseIds.length === 0) {
            return {
                warehouses: [],
                materials: [],
                types: ['psb', 'lensa', 'mt', 'ro'],
            };
        }

        return await inventoryRepository.getHasilRekonFilterOptions(
            isStaff ? warehouseIds : undefined
        );
    } catch (error) {
        actionLogger.error(
            'Error fetching hasil rekon filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            warehouses: [],
            materials: [],
            types: ['psb', 'lensa', 'mt', 'ro'],
        };
    }
}
