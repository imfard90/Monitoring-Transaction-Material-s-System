-- Migration: 027_create_nte_stored_procedures.sql
-- Stored procedures NTE transactions.
-- Approved: 2026-10-19
-- Status: Ready deployment non-prod DB

BEGIN;

-- ============================================================
-- SEQUENCE: trx_nte_seq
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS nte_inventory.trx_nte_seq;

-- ============================================================
-- FUNCTION: get_next_trx_id
-- Generate transaction ID with date prefix
-- ============================================================
CREATE OR REPLACE FUNCTION nte_inventory.get_next_trx_id(p_type_prefix VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
 v_date VARCHAR;
 v_seq BIGINT;
 v_result VARCHAR;
BEGIN
 v_date := to_char(CURRENT_DATE, 'YYYYMMDD');
 v_seq := nextval('nte_inventory.trx_nte_seq');
 v_result := p_type_prefix || '_' || v_date || '_' || lpad(v_seq::text, 5, '0');
 RETURN v_result;
END;
$$;

-- ============================================================
-- FUNCTION: validate_sn_scope
-- Validates SN in user's scope (for staff PIC check)
-- Raises exception if invalid
-- ============================================================
CREATE OR REPLACE FUNCTION nte_inventory.validate_sn_scope(
 p_sn_list JSONB,
 p_asal VARCHAR,
 p_is_staff BOOLEAN,
 p_warehouse_ids BIGINT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
 v_sn VARCHAR;
 v_sn_data RECORD;
 v_wh_id BIGINT;
 v_asal_wh_id BIGINT;
BEGIN
 -- Non-staff bypass scope check
 IF NOT p_is_staff THEN
 RETURN;
 END IF;

 -- Get warehouse ID for asal address
 SELECT mapping_mas_wh INTO v_asal_wh_id
 FROM nte_inventory.mas_address_nte
 WHERE address_name = p_asal;

 IF v_asal_wh_id IS NULL THEN
 RAISE EXCEPTION 'Alamat asal "%" tidak ter mapping ke warehouse', p_asal;
 END IF;

 -- Check asal address is in user's warehouse scope
 IF v_asal_wh_id IS NOT NULL THEN
 IF NOT (v_asal_wh_id = ANY(p_warehouse_ids)) THEN
 RAISE EXCEPTION 'Alamat asal "%" tidak berada dalam cakupan warehouse Anda', p_asal;
 END IF;
 END IF;

 -- Validate each SN
 FOR v_sn IN SELECT jsonb_array_elements_text(p_sn_list)
 LOOP
 SELECT addr.mapping_mas_wh INTO v_wh_id
 FROM nte_inventory.mas_sn_nte sn
 LEFT JOIN nte_inventory.mas_address_nte addr ON sn.address = addr.address_name
 WHERE sn.serial_number = v_sn;

 IF v_wh_id IS NULL OR v_wh_id = ANY(p_warehouse_ids) THEN
 RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak berada dalam cakupan warehouse Anda', v_sn;
 END IF;
 END LOOP;
END;
$$;

-- ============================================================
-- PROCEDURE: sp_create_tag_nte
-- Create NTE tag transaction (warehouse transfer)
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_create_tag_nte(
 p_asal VARCHAR,
 p_tujuan VARCHAR,
 p_wo_number VARCHAR,
 p_sn_list JSONB,
 p_created_by VARCHAR,
 OUT p_id_trx VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
 v_id_transaksi VARCHAR;
 v_sn VARCHAR;
 v_inventory_status VARCHAR;
 v_condition_status VARCHAR;
 v_address VARCHAR;
BEGIN
 -- 1. Generate ID
 v_id_transaksi := nte_inventory.get_next_trx_id('TAG-NTE');
 p_id_trx := v_id_transaksi;

 -- 2. Process each SN
 FOR v_sn IN SELECT jsonb_array_elements_text(p_sn_list)
 LOOP
 -- Lock and update SN
 UPDATE nte_inventory.mas_sn_nte
 SET
 address = p_tujuan,
 wo_number = p_wo_number,
 updated_at = NOW()
 WHERE serial_number = v_sn
 AND inventory_status = 'available'
 AND address = p_asal
 RETURNING inventory_status, condition_status, address INTO v_inventory_status, v_condition_status, v_address;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'SN "%" tidak ditemukan atau status tidak valid (harus available di alamat asal)', v_sn;
 END IF;

 -- Log transaction
 INSERT INTO nte_inventory.log_transaction_nte (
 id_transaksi,
 serial_number,
 from_address,
 to_address,
 wo_number,
 inventory_status,
 transaction_type,
 created_by
 ) VALUES (
 v_id_transaksi,
 v_sn,
 v_address,
 p_tujuan,
 p_wo_number,
 v_inventory_status,
 'tag',
 p_created_by
 );
 END LOOP;

 RAISE NOTICE 'NTE tag transaction created: %', v_id_transaksi;
END;
$$;

-- ============================================================
-- PROCEDURE: sp_set_install_nte
-- Install NTE transaction (technician customer site)
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_set_install_nte(
 p_nik_teknisi VARCHAR,
 p_wo_number VARCHAR,
 p_sn_list JSONB,
 p_created_by VARCHAR,
 OUT p_id_trx VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
 v_item RECORD;
 v_id_transaksi VARCHAR;
 v_inventory_status VARCHAR;
 v_address VARCHAR;
BEGIN
 -- 1. Generate ID
 v_id_transaksi := nte_inventory.get_next_trx_id('INST-NTE');
 p_id_trx := v_id_transaksi;

 -- 2. Process each SN
 FOR v_item IN SELECT jsonb_array_elements(p_sn_list) AS item
 LOOP
 UPDATE nte_inventory.mas_sn_nte
 SET
 address = ' teknisi_' || p_nik_teknisi,
 wo_number = p_wo_number,
 inet_number = v_item.item->>'inet_number',
 updated_at = NOW()
 WHERE serial_number = (v_item.item->>'serial_number')
 RETURNING inventory_status, address INTO v_inventory_status, v_address;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'SN "%" tidak ditemukan atau status tidak valid (harus unavailable)', (v_item.item->>'serial_number');
 END IF;

 INSERT INTO nte_inventory.log_transaction_nte (
 id_transaksi,
 serial_number,
 from_address,
 to_address,
 wo_number,
 inventory_status,
 transaction_type,
 created_by
 ) VALUES (
 v_id_transaksi,
 (v_item.item->>'serial_number'),
 v_address,
 ' teknisi_' || p_nik_teknisi,
 p_wo_number,
 v_inventory_status,
 'install',
 p_created_by
 );
 END LOOP;

 RAISE NOTICE 'NTE install transaction created: %', v_id_transaksi;
END;
$$;

-- ============================================================
-- PROCEDURE: sp_return_nte
-- Return NTE transaction (technician to warehouse)
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_return_nte(
 p_nik_teknisi VARCHAR,
 p_tujuan VARCHAR,
 p_sn_list JSONB,
 p_created_by VARCHAR,
 OUT p_id_trx VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
 v_id_transaksi VARCHAR;
 v_sn VARCHAR;
 v_inventory_status VARCHAR;
 v_address VARCHAR;
BEGIN
 -- 1. Generate ID
 v_id_transaksi := nte_inventory.get_next_trx_id('RET-NTE');
 p_id_trx := v_id_transaksi;

 -- 2. Process each SN
 FOR v_sn IN SELECT jsonb_array_elements_text(p_sn_list)
 LOOP
 UPDATE nte_inventory.mas_sn_nte
 SET
 address = p_tujuan,
 wo_number = NULL,
 inet_number = NULL,
 updated_at = NOW()
 WHERE serial_number = v_sn
 AND inventory_status = 'unavailable'
 AND address = ' teknisi_' || p_nik_teknisi
 RETURNING inventory_status, address INTO v_inventory_status, v_address;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'SN "%" tidak ditemukan atau status tidak valid (harus unavailable)', v_sn;
 END IF;

 -- Log transaction
 INSERT INTO nte_inventory.log_transaction_nte (
 id_transaksi,
 serial_number,
 from_address,
 to_address,
 wo_number,
 inventory_status,
 transaction_type,
 created_by
 ) VALUES (
 v_id_transaksi,
 v_sn,
 v_address,
 p_tujuan,
 '',
 v_inventory_status,
 'return',
 p_created_by
 );
 END LOOP;

 RAISE NOTICE 'NTE return transaction created: %', v_id_transaksi;
END;
$$;

-- ============================================================
-- GRANT: minimum privileges
-- ============================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA nte_inventory FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA nte_inventory FROM PUBLIC;

GRANT EXECUTE ON FUNCTION nte_inventory.get_next_trx_id(VARCHAR) TO imam;
GRANT EXECUTE ON FUNCTION nte_inventory.validate_sn_scope(JSONB, VARCHAR, BOOLEAN, BIGINT[]) TO imam;
GRANT EXECUTE ON PROCEDURE nte_inventory.sp_create_tag_nte(VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR) TO imam;
GRANT EXECUTE ON PROCEDURE nte_inventory.sp_set_install_nte(VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR) TO imam;
GRANT EXECUTE ON PROCEDURE nte_inventory.sp_return_nte(VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR) TO imam;

-- ============================================================
-- SEQUENCE: GRANT usage
-- ============================================================
GRANT USAGE ON SEQUENCE nte_inventory.trx_nte_seq TO imam;

COMMIT;
