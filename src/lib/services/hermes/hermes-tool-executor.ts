import { z } from 'zod';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import {
    expandMaterialKeywords,
    extractWarehouse,
} from './skills/stock-query.skill';

const getMaterialStockSchema = z.object({
    material_keyword: z
        .string({ message: 'material_keyword wajib diisi' })
        .trim()
        .min(1, 'material_keyword wajib diisi'),
    warehouse_name: z.string().trim().optional(),
    check_all_warehouses: z.boolean().optional(),
});

/**
 * Eksekutor aman untuk tool-calls yang diminta oleh Hermes LLM.
 * Menggunakan parameterized query via repository Kysely (100% aman dari SQL Injection).
 */
export async function executeHermesTool(
    toolName: string,
    rawArguments: string
): Promise<Record<string, unknown>> {
    actionLogger.info(`[HermesToolExecutor] Menjalankan tool: '${toolName}'`, {
        arguments: rawArguments,
    });

    try {
        if (toolName === 'get_material_stock') {
            const parsedArgs = JSON.parse(rawArguments || '{}');
            const validated = getMaterialStockSchema.safeParse(parsedArgs);

            if (!validated.success) {
                return {
                    status: 'error',
                    message: `Parameter tidak valid: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
                };
            }

            const { material_keyword, warehouse_name, check_all_warehouses } = validated.data;
            const keywords = expandMaterialKeywords(material_keyword);

            let resolvedWarehouseId: number | undefined;
            let resolvedWarehouseLabel = 'Seluruh Gudang MTMS';

            // Jika user/model tidak meminta cek seluruh gudang, coba cocokkan nama gudang
            if (!check_all_warehouses && warehouse_name && warehouse_name.toLowerCase() !== 'all') {
                const targetWh = extractWarehouse(warehouse_name);
                if (targetWh) {
                    resolvedWarehouseId = targetWh.id;
                    resolvedWarehouseLabel = targetWh.name;
                }
            }

            const rawStock = await inventoryRepository.searchStockBalances({
                warehouseId: resolvedWarehouseId,
                keywords,
                limit: 25,
            });

            const stockRows = rawStock.map((r) => {
                const qty = Number(r.qtyStock ?? 0);
                return {
                    gudang: r.warehouseName ?? '-',
                    cabang: r.branchName ?? '-',
                    kode_material: r.materialCode ?? '-',
                    deskripsi_material: r.materialName ?? '-',
                    sisa_stok: qty,
                    satuan: r.materialUnit ?? 'UNIT',
                    status_ketersediaan: qty > 0 ? 'Tersedia' : 'Kosong',
                };
            });

            return {
                status: 'success',
                kata_kunci_material: material_keyword,
                cakupan_gudang: resolvedWarehouseLabel,
                total_data: stockRows.length,
                stok_material: stockRows,
                catatan:
                    stockRows.length === 0
                        ? 'Tidak ada data stok yang ditemukan untuk material ini pada gudang terkait.'
                        : undefined,
            };
        }

        return {
            status: 'error',
            message: `Tool '${toolName}' tidak didukung oleh sistem MTMS.`,
        };
    } catch (err: unknown) {
        actionLogger.error(
            `[HermesToolExecutor] Gagal mengeksekusi tool '${toolName}':`,
            err instanceof Error ? err : new Error(String(err))
        );
        return {
            status: 'error',
            message: `Gagal membaca database untuk tool '${toolName}': ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
