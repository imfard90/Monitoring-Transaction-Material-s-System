'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireManagementAccess } from '@/lib/auth-server';
import { nteRepository } from '@/lib/repositories/nte.repository';

const mappingSchema = z.object({
    addressName: z.string().trim().min(1).max(300),
    warehouseId: z.number().int().positive().nullable(),
});

export async function getNteAddressWarehouseMappings() {
    await requireManagementAccess();
    const [mappings, warehouses] = await Promise.all([
        nteRepository.listAddressWarehouseMappings(),
        nteRepository.listInventoryWarehouses(),
    ]);

    return {
        mappings: mappings.rows,
        warehouses: warehouses.rows,
    };
}

export async function updateNteAddressWarehouseMapping(input: unknown) {
    await requireManagementAccess();
    const parsed = mappingSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false as const, error: 'Data mapping tidak valid.' };
    }

    const { addressName, warehouseId } = parsed.data;
    const address = await nteRepository.getAddressByName(addressName);
    if (address.rows.length === 0) {
        return { success: false as const, error: 'Alamat NTE tidak ditemukan.' };
    }

    if (warehouseId !== null) {
        const warehouse = await nteRepository.getInventoryWarehouse(warehouseId);
        if (warehouse.rows.length === 0) {
            return { success: false as const, error: 'Gudang tujuan tidak ditemukan.' };
        }
    }

    const current = await nteRepository.getAddressWarehouseMapping(addressName);
    if (current.rows[0]?.mapping_mas_wh === warehouseId) {
        return { success: true as const };
    }

    await nteRepository.updateAddressWarehouseMapping(addressName, warehouseId);
    revalidatePath('/management/nte-mapping');
    return { success: true as const };
}
