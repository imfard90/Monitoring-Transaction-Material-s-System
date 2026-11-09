import type { HermesToolDefinition } from './types';

/**
 * Daftar tool resmi yang diekspos ke model Hermes via native OpenAI-compatible Tool Calling.
 */
export const HERMES_TOOLS: readonly HermesToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'get_material_stock',
            description:
                'Mengecek ketersediaan data stok material di database resmi MTMS. Dapat mengecek stok pada satu gudang spesifik (misal: "SO Lamongan", "SO Gresik") ATAU memeriksa ketersediaan di SEMUA gudang sekaligus (check_all_warehouses: true). Sangat dianjurkan untuk memeriksa seluruh gudang jika pengguna menanyakan alternatif sumber stok atau jika stok di gudang tertentu habis.',
            parameters: {
                type: 'object',
                properties: {
                    material_keyword: {
                        type: 'string',
                        description:
                            'Nama, kode material, atau jenis barang yang dicari (contoh: "AC-OF-SM-ADSS-96D", "kabel", "dropcore", "adss", "patchcord", "ont").',
                    },
                    warehouse_name: {
                        type: 'string',
                        description:
                            'Nama spesifik gudang jika pengguna menanyakan gudang tertentu (contoh: "SO Lamongan", "SO Gresik", "Karangpilang", "Bojonegoro", "Tuban"). Kosongkan jika ingin mencari di seluruh gudang.',
                    },
                    check_all_warehouses: {
                        type: 'boolean',
                        description:
                            'Set true jika ingin melihat ketersediaan di seluruh gudang MTMS sekaligus (misal saat mencari gudang transfer atau stok alternatif).',
                    },
                },
                required: ['material_keyword'],
            },
        },
    },
] as const;
