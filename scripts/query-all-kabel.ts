/**
 * Script untuk mengecek seluruh stok material kabel di semua gudang MTMS.
 *
 * Menggunakan inventoryRepository.searchStockBalances dengan mapping properti schema MTMS:
 * - qtyStock (bukan remainingQuantity)
 * - materialUnit (bukan uomName)
 */

import 'dotenv/config';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';

async function main() {
    console.log('🔍 Mencari seluruh stok material kabel di semua gudang MTMS...\n');

    const stock = await inventoryRepository.searchStockBalances({
        keywords: ['kabel', 'dropcore', 'precon'],
        limit: 500,
    });

    if (stock.length === 0) {
        console.log('Tidak ada stok kabel yang ditemukan.');
        return;
    }

    // Kelompokkan per gudang
    const grouped = new Map<string, typeof stock>();
    for (const item of stock) {
        const key = `${item.branchName} - ${item.warehouseName}`;
        const existing = grouped.get(key) || [];
        existing.push(item);
        grouped.set(key, existing);
    }

    for (const [wh, items] of grouped.entries()) {
        console.log(`\n🏢 Gudang: ${wh}`);
        for (const s of items) {
            console.log(`  ${s.materialName || s.materialCode}: ${s.qtyStock} ${s.materialUnit}`);
        }
    }

    console.log(`\n✅ Total item kabel ditemukan: ${stock.length}`);
}

main().catch((err) => {
    console.error('Gagal menjalankan query kabel:', err);
    process.exit(1);
});
