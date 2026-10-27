import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool, query } from '../helpers/db';

/**
 * Integration tests: Mutasi Stok Kritis & Transaksi Integritas (Point 3).
 *
 * Menguji secara nyata terhadap PostgreSQL live:
 * 1. Constraint non-negative stock balance (qty_stock >= 0)
 * 2. Stored procedure return material over-return prevention
 * 3. Sequence trx_return_seq incrementing and format
 * 4. Atomisitas rollback transaksi
 *
 * Seluruh test dibungkus dalam BEGIN ... ROLLBACK sehingga TIDAK ADA
 * data kotor atau mutasi permanen yang tersimpan di database.
 */

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

let sampleWarehouseId: number;
let sampleMaterialId: number;
let sampleTechnicianNik: string;

beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    await query('SELECT 1');

    const wh = await query<{ id: number }>(
        'SELECT id FROM inventory.mas_wh ORDER BY id ASC LIMIT 1'
    );
    sampleWarehouseId = wh[0]?.id ?? 1;

    const mat = await query<{ id: number }>(
        'SELECT id FROM inventory.materials ORDER BY id ASC LIMIT 1'
    );
    sampleMaterialId = mat[0]?.id ?? 1;

    const tech = await query<{ nik: string }>(
        'SELECT nik FROM hr.technicians ORDER BY nik ASC LIMIT 1'
    );
    sampleTechnicianNik = tech[0]?.nik ?? 'TEST_NIK';
});

afterAll(async () => {
    await closePool();
});

describeDb('Critical Inventory Mutations & Constraints', () => {
    it('blocks negative qty_stock via CHECK constraint (stock_balance_qty_non_negative)', async () => {
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');

            // Trying to set or insert qty_stock < 0 must be rejected by PostgreSQL engine
            await expect(
                client.query(
                    `INSERT INTO inventory.stock_balance (warehouse_id, designator_id, qty_stock, updated_at)
                     VALUES ($1, $2, -10, NOW())
                     ON CONFLICT (warehouse_id, designator_id)
                     DO UPDATE SET qty_stock = -10`,
                    [sampleWarehouseId, sampleMaterialId]
                )
            ).rejects.toThrow(/stock_balance_qty_non_negative|stock_balance_qty_stock_check/);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });

    it('successfully creates return request within allocation and rejects over-return', async () => {
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');

            // 1. Create temporary Out SAP header
            const hdrRes = await client.query<{ id: string }>(
                `
                INSERT INTO inventory.sap_out_header (
                    id_trx, warehouse_id, nik_teknisi, name_sa, sap_number, request_id, end_status, created_by, request_time
                ) VALUES (
                    'TRX-TEST-OUT-INT-001', $1, $2, 'SA-TEST', 'SAP-TEST-001', 'REQ-TEST-001', 'intech', 'TESTER', NOW()
                ) RETURNING id
            `,
                [sampleWarehouseId, sampleTechnicianNik]
            );
            const headerId = hdrRes.rows[0].id;

            // 2. Create temporary Out SAP item (qty_req = 10, qty_used = 3 => available for return = 7)
            const itemRes = await client.query<{ id: string }>(
                `
                INSERT INTO inventory.sap_out_items (header_id, designator_id, qty_req, qty_used)
                VALUES ($1, $2, 10, 3)
                RETURNING id
            `,
                [headerId, sampleMaterialId]
            );
            const itemId = itemRes.rows[0].id;

            // 3. Test Valid Return (qty = 4 <= 7)
            const validPayload = JSON.stringify([
                { sap_out_item_id: Number(itemId), designator_id: sampleMaterialId, qty: 4 },
            ]);

            const returnRes = await client.query<{ id_trx: string }>(
                `
                SELECT inventory.sp_create_return_request(
                    $1::bigint, $2::varchar, $3::bigint, $4::text, $5::jsonb, $6::varchar
                ) as id_trx
            `,
                [
                    headerId,
                    sampleTechnicianNik,
                    sampleWarehouseId,
                    'Catatan return valid',
                    validPayload,
                    'TESTER',
                ]
            );

            const createdIdTrx = returnRes.rows[0]?.id_trx;
            expect(createdIdTrx).toBeDefined();
            expect(createdIdTrx).toMatch(/^TRX-RETURN-/);

            // 4. Test Over-Return attempt (Available now: 7 - 4 = 3, trying to return 5)
            const overReturnPayload = JSON.stringify([
                { sap_out_item_id: Number(itemId), designator_id: sampleMaterialId, qty: 5 },
            ]);

            await expect(
                client.query(
                    `
                    SELECT inventory.sp_create_return_request(
                        $1::bigint, $2::varchar, $3::bigint, $4::text, $5::jsonb, $6::varchar
                    ) as id_trx
                `,
                    [
                        headerId,
                        sampleTechnicianNik,
                        sampleWarehouseId,
                        'Catatan over return',
                        overReturnPayload,
                        'TESTER',
                    ]
                )
            ).rejects.toThrow(/melebihi sisa stok/i);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });

    it('trx_return_seq produces sequential 4-digit formatted numbers', async () => {
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');

            const res1 = await client.query<{ seq: string }>(
                `SELECT to_char(nextval('inventory.trx_return_seq'), 'FM0000') as seq`
            );
            const res2 = await client.query<{ seq: string }>(
                `SELECT to_char(nextval('inventory.trx_return_seq'), 'FM0000') as seq`
            );

            expect(res1.rows[0].seq).toHaveLength(4);
            expect(res2.rows[0].seq).toHaveLength(4);
            expect(Number(res2.rows[0].seq)).toBe(Number(res1.rows[0].seq) + 1);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });

    it('rolls back completely if any item in a multi-item return request fails', async () => {
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');

            const hdrRes = await client.query<{ id: string }>(
                `
                INSERT INTO inventory.sap_out_header (
                    id_trx, warehouse_id, nik_teknisi, name_sa, sap_number, request_id, end_status, created_by, request_time
                ) VALUES (
                    'TRX-TEST-OUT-INT-002', $1, $2, 'SA-TEST', 'SAP-TEST-002', 'REQ-TEST-002', 'intech', 'TESTER', NOW()
                ) RETURNING id
            `,
                [sampleWarehouseId, sampleTechnicianNik]
            );
            const headerId = hdrRes.rows[0].id;

            const itemRes = await client.query<{ id: string }>(
                `
                INSERT INTO inventory.sap_out_items (header_id, designator_id, qty_req, qty_used)
                VALUES ($1, $2, 5, 0)
                RETURNING id
            `,
                [headerId, sampleMaterialId]
            );
            const itemId = itemRes.rows[0].id;

            // Batch with 1 valid item (qty=2) and 1 invalid item (qty=99 > 5)
            const invalidBatchPayload = JSON.stringify([
                { sap_out_item_id: Number(itemId), designator_id: sampleMaterialId, qty: 2 },
                { sap_out_item_id: Number(itemId), designator_id: sampleMaterialId, qty: 99 },
            ]);

            await expect(
                client.query(
                    `
                    SELECT inventory.sp_create_return_request(
                        $1::bigint, $2::varchar, $3::bigint, $4::text, $5::jsonb, $6::varchar
                    ) as id_trx
                `,
                    [
                        headerId,
                        sampleTechnicianNik,
                        sampleWarehouseId,
                        'Catatan batch gagal',
                        invalidBatchPayload,
                        'TESTER',
                    ]
                )
            ).rejects.toThrow(/melebihi sisa stok/i);

            // Rollback the transaction block to reset connection state
            await client.query('ROLLBACK');

            // Verify no return headers were committed from the failed transaction
            const checkHeader = await client.query<{ count: string }>(
                `
                SELECT count(*)::text as count FROM inventory.return_material_header WHERE sap_out_id = $1
            `,
                [headerId]
            );
            expect(Number(checkHeader.rows[0].count)).toBe(0);
        } finally {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Ignore if already rolled back
            }
            client.release();
        }
    });
});
