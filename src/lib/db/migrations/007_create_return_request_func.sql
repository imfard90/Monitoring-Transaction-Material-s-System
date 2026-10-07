CREATE OR REPLACE FUNCTION inventory.sp_create_return_request(
    p_sap_out_id BIGINT,
    p_nik_teknisi VARCHAR,
    p_warehouse_id BIGINT,
    p_notes TEXT,
    p_items JSONB,
    p_created_by VARCHAR
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_id BIGINT;
    v_id_trx VARCHAR;
    v_item JSONB;
BEGIN
    -- Generate ID Trx
    v_id_trx := 'RET-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text;

    -- Insert Header
    INSERT INTO inventory.return_material_header (
        id_trx, sap_out_id, nik_teknisi, warehouse_id, notes, created_by
    ) VALUES (
        v_id_trx, p_sap_out_id, p_nik_teknisi, p_warehouse_id, p_notes, p_created_by
    ) RETURNING id INTO v_header_id;

    -- Loop through items and call the procedure
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        CALL inventory.sp_create_return_request(
            v_header_id,
            (v_item->>'sap_out_item_id')::BIGINT,
            (v_item->>'designator_id')::BIGINT,
            (v_item->>'qty')::NUMERIC
        );
    END LOOP;

    RETURN v_id_trx;
END;
$$;
