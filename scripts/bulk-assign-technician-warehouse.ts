/**
 * Bulk assign teknisi ke warehouse berdasarkan service area
 *
 * Mapping:
 * - BAMBE → SO Karangpilang (wh_id=1)
 * - CERME, GRESIK → SO Gresik (wh_id=2)
 * - LAMONGAN → SO Lamongan (wh_id=3)
 * - BOJONEGORO → SO Bojonegoro (wh_id=4)
 * - TUBAN, BANCAR → SO Tuban (wh_id=5)
 */

import 'dotenv/config';
import { createPool, executeWrite } from '@/lib/db/execute';

const MAPPINGS = [
    { branchIds: [5], whId: 1, whName: 'SO Karangpilang', serviceAreas: ['BAMBE'] }, // BAMBE -> Karangpilang
    { branchIds: [14, 44], whId: 2, whName: 'SO Gresik', serviceAreas: ['CERME', 'GRESIK'] }, // CERME, GRESIK -> Gresik
    { branchIds: [26], whId: 3, whName: 'SO Lamongan', serviceAreas: ['LAMONGAN'] }, // LAMONGAN -> Lamongan
    { branchIds: [47], whId: 4, whName: 'SO Bojonegoro', serviceAreas: ['BOJONEGORO'] }, // BOJONEGORO -> Bojonegoro
    { branchIds: [22, 10], whId: 5, whName: 'SO Tuban', serviceAreas: ['TUBAN', 'BANCAR'] }, // TUBAN, BANCAR -> Tuban
];

async function main() {
    const pool = await createPool();

    try {
        console.log('🚀 Starting bulk assign teknisi to warehouse...\n');

        for (const mapping of MAPPINGS) {
            console.log(
                `📍 Assigning ${mapping.serviceAreas.join(', ')} → ${mapping.whName} (wh_id=${mapping.whId})`
            );

            const result = await pool.query(
                `UPDATE hr.technicians
                 SET wh_id = $1
                 WHERE branch_id = ANY($2::int[])
                   AND wh_id IS NULL
                 RETURNING nik, name`,
                [mapping.whId, mapping.branchIds]
            );

            console.log(`   ✅ Assigned ${result.rowCount} teknisi`);
            if (result.rows.length > 0) {
                console.log(
                    `   Sample: ${result.rows
                        .slice(0, 3)
                        .map((r) => `${r.nik} - ${r.name}`)
                        .join(', ')}`
                );
            }
            console.log('');
        }

        // Summary
        const summary = await pool.query(`
            SELECT 
                wh.id,
                wh.name,
                COUNT(t.id) as teknisi_count
            FROM inventory.mas_wh wh
            LEFT JOIN hr.technicians t ON t.wh_id = wh.id
            WHERE wh.check_stock = true
            GROUP BY wh.id, wh.name
            ORDER BY wh.name
        `);

        console.log('📊 Summary:');
        for (const row of summary.rows) {
            console.log(`   ${row.name}: ${row.teknisi_count} teknisi`);
        }

        const unassigned = await pool.query(`
            SELECT COUNT(*) as count 
            FROM hr.technicians 
            WHERE wh_id IS NULL AND is_active = true
        `);
        console.log(`\n⚠️  Unassigned: ${unassigned.rows[0].count} teknisi (tidak bisa scrape)`);

        console.log('\n✅ Bulk assign completed.');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
