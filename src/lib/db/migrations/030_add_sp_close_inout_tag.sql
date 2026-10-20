-- Migration: Add sp_close_inout_tag stored procedure
-- Description: Commits the existing sp_close_inout_tag from production DB to repository.
--              This SP handles stock movement when InOut Tag is accepted (closed).
--              Supports partial acceptance: stock deducted/added based on accepted qty, not sent qty.
-- Related: AGENTS.md §1.2, bispro.md §2.1

CREATE OR REPLACE PROCEDURE inventory.sp_close_inout_tag(
    IN p_header_id BIGINT,
    IN p_created_by VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_from_wh_id   INTEGER;
    v_to_wh_id     INTEGER;
    v_id_trx       VARCHAR(50);
    v_item         RECORD;
    v_qty_after    INTEGER;
    v_from_exists  BOOLEAN;
    v_from_check   BOOLEAN;
    v_to_check     BOOLEAN;
BEGIN
    -- Ambil info header
    SELECT from_wh_id, to_wh_id, id_trx
    INTO v_from_wh_id, v_to_wh_id, v_id_trx
    FROM inventory.inout_tag_header
    WHERE id = p_header_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'inout_tag_header id=% tidak ditemukan', p_header_id;
    END IF;

    -- GET CHECK STOCK FLAG FOR FROM_WH
    IF v_from_wh_id IS NOT NULL THEN
        SELECT check_stock INTO v_from_check
        FROM inventory.mas_wh
        WHERE id = v_from_wh_id;
    ELSE
        v_from_check := false;
    END IF;

    -- GET CHECK STOCK FLAG FOR TO_WH
    IF v_to_wh_id IS NOT NULL THEN
        SELECT check_stock INTO v_to_check
        FROM inventory.mas_wh
        WHERE id = v_to_wh_id;
    ELSE
        v_to_check := false;
    END IF;

    -- Loop setiap item (ambil qty dari action 'accept')
    -- CRITICAL: Qty dari 'accept' digunakan untuk KEDUA sisi (transfer_out & transfer_in)
    -- Ini mendukung partial acceptance: dikirim 10, diterima 5 → stock pengirim -5, penerima +5
    FOR v_item IN
        SELECT designator_id, qty
        FROM inventory.inout_tag_items
        WHERE header_id = p_header_id
          AND action = 'accept'
    LOOP
        -- ─── TRANSFER OUT dari from_wh (conditional) ───
        IF v_from_wh_id IS NOT NULL THEN
            IF v_from_check THEN
                -- Cek apakah from_wh punya row di stock_balance
                UPDATE inventory.stock_balance
                SET qty_stock  = qty_stock - v_item.qty,
                    updated_at = NOW()
                WHERE warehouse_id  = v_from_wh_id
                  AND designator_id = v_item.designator_id
                RETURNING qty_stock INTO v_qty_after;

                v_from_exists := FOUND;

                IF NOT v_from_exists THEN
                    RAISE EXCEPTION 'Material ID % tidak ditemukan atau stok kosong di gudang asal.', v_item.designator_id;
                END IF;

                IF v_qty_after < 0 THEN
                    RAISE EXCEPTION 'Stok material ID % tidak mencukupi di gudang asal.', v_item.designator_id;
                END IF;

                INSERT INTO inventory.stock_movement
                    (warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, created_by)
                VALUES
                    (v_from_wh_id, v_item.designator_id, 'transfer_out', -v_item.qty, v_qty_after, v_id_trx, p_created_by);
            ELSE
                -- External WH / check_stock = false: catat movement saja, qty_after = 0
                INSERT INTO inventory.stock_movement
                    (warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, notes, created_by)
                VALUES
                    (v_from_wh_id, v_item.designator_id, 'transfer_out', -v_item.qty, 0, v_id_trx,
                     'External WH - balance not tracked', p_created_by);
            END IF;
        END IF;

        -- ─── TRANSFER IN ke to_wh (conditional based on check_stock) ───
        IF v_to_wh_id IS NOT NULL THEN
            IF v_to_check THEN
                INSERT INTO inventory.stock_balance (warehouse_id, designator_id, qty_stock, updated_at)
                VALUES (v_to_wh_id, v_item.designator_id, v_item.qty, NOW())
                ON CONFLICT (warehouse_id, designator_id)
                DO UPDATE SET
                    qty_stock  = inventory.stock_balance.qty_stock + v_item.qty,
                    updated_at = NOW();

                -- Ambil saldo terbaru
                SELECT qty_stock INTO v_qty_after
                FROM inventory.stock_balance
                WHERE warehouse_id  = v_to_wh_id
                  AND designator_id = v_item.designator_id;

                INSERT INTO inventory.stock_movement
                    (warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, created_by)
                VALUES
                    (v_to_wh_id, v_item.designator_id, 'transfer_in', v_item.qty, v_qty_after, v_id_trx, p_created_by);
            ELSE
                -- to_wh check_stock = false: catat movement saja, qty_after = 0
                INSERT INTO inventory.stock_movement
                    (warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, notes, created_by)
                VALUES
                    (v_to_wh_id, v_item.designator_id, 'transfer_in', v_item.qty, 0, v_id_trx,
                     'External WH - balance not tracked', p_created_by);
            END IF;
        END IF;

    END LOOP;
END;
$procedure$;
