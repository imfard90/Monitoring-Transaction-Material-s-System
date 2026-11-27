-- Migration 070: K-PRO Improvements (Retention & Lock-Safe MView Refresh) and Lensa Normalization & Alias Tables

CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS etl;

-- ==============================================================================
-- 1. K-PRO IMPROVEMENT 2: Retensi & Pembersihan Otomatis Log di Stored Procedure
-- ==============================================================================

CREATE OR REPLACE PROCEDURE etl.sp_process_kpro_staging(
    IN p_job_id BIGINT,
    OUT p_total_staging INT,
    OUT p_compwork_upserted INT,
    OUT p_error_count INT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    p_error_count := 0;

    -- 1. Hitung total baris mentah di staging untuk job ini
    SELECT COUNT(*) INTO p_total_staging
    FROM etl.staging_data_kpro_raw
    WHERE job_id = p_job_id;

    IF p_total_staging = 0 THEN
        p_compwork_upserted := 0;
        RETURN;
    END IF;

    -- 2. Transformasi, filter COMPWORK, dan atomic UPSERT langsung ke public.data_kpro
    WITH filtered_raw AS (
        SELECT raw_data
        FROM etl.staging_data_kpro_raw
        WHERE job_id = p_job_id
          AND raw_data IS NOT NULL
          AND UPPER(TRIM(COALESCE(raw_data ->> 'STATUS', ''))) = 'COMPWORK'
    ),
    sanitized AS (
        SELECT 
            -- Primary Identifier (Strict bounded types)
            UPPER(TRIM(raw_data ->> 'WONUM'))::VARCHAR(15) AS wonum,
            NULLIF(TRIM(raw_data ->> 'CRMORDERTYPE'), '')::VARCHAR(10) AS crmordertype,
            NULLIF(TRIM(raw_data ->> 'SCORDERNO'), '') AS scorderno,
            NULLIF(TRIM(raw_data ->> 'SERVICENUM'), '') AS servicenum,
            NULLIF(TRIM(raw_data ->> 'NCLI'), '') AS ncli,
            NULLIF(TRIM(raw_data ->> 'FLAG_ORDER'), '') AS flag_order,
            etl.fn_safe_cast_smallint(raw_data ->> 'REGIONAL_BARU') AS regional_baru,
            NULLIF(TRIM(raw_data ->> 'DISTRICT_BARU'), '') AS district_baru,
            NULLIF(TRIM(raw_data ->> 'DATEL_BARU'), '') AS datel_baru,
            UPPER(NULLIF(TRIM(raw_data ->> 'STO'), ''))::VARCHAR(5) AS sto,
            NULLIF(TRIM(raw_data ->> 'REGIONAL_LAMA'), '') AS regional_lama,
            NULLIF(TRIM(raw_data ->> 'DISTRICT_LAMA'), '') AS district_lama,
            NULLIF(TRIM(raw_data ->> 'DATEL_LAMA'), '') AS datel_lama,
            NULLIF(TRIM(raw_data ->> 'PACKAGE_NAME'), '') AS package_name,
            NULLIF(TRIM(raw_data ->> 'PRODUCT'), '') AS product,
            NULLIF(TRIM(raw_data ->> 'JENIS_PRODUCT'), '') AS jenis_product,
            NULLIF(TRIM(raw_data ->> 'CUSTOMER_NAME'), '') AS customer_name,
            NULLIF(TRIM(raw_data ->> 'CUSTOMER_ADDRESS'), '') AS customer_address,
            NULLIF(TRIM(raw_data ->> 'NO_HP'), '') AS no_hp,

            -- Safe Float Coordinates
            etl.fn_safe_cast_float(raw_data ->> 'LATITUDE_INS') AS latitude_ins,
            etl.fn_safe_cast_float(raw_data ->> 'LONGITUDE_INS') AS longitude_ins,

            -- Safe Timestamps (with WIB +07:00 Offset)
            etl.fn_safe_cast_timestamptz(raw_data ->> 'DATECREATED') AS datecreated,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'TGL_MANJA') AS tgl_manja,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'ACTSTART') AS actstart,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'SCHEDULE_LABOR') AS schedule_labor,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'STATUSDATE') AS statusdate,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'TANGGAL_APPROVAL') AS tanggal_approval,

            NULLIF(TRIM(raw_data ->> 'STATUS_SURVEY'), '') AS status_survey,
            NULLIF(TRIM(raw_data ->> 'STATUS_TASK'), '') AS status_task,
            'COMPWORK'::VARCHAR(50) AS status,
            NULLIF(TRIM(raw_data ->> 'STATUS_APPROVAL'), '') AS status_approval,
            NULLIF(TRIM(raw_data ->> 'STATUS_ODP'), '') AS status_odp,
            NULLIF(TRIM(raw_data ->> 'DESC_TASK'), '') AS desc_task,
            NULLIF(TRIM(raw_data ->> 'ENGINEERMEMO'), '') AS engineermemo,
            NULLIF(TRIM(raw_data ->> 'CATATAN_TEKNISI'), '') AS catatan_teknisi,
            NULLIF(TRIM(raw_data ->> 'KETERANGAN_PI'), '') AS keterangan_pi,
            NULLIF(TRIM(raw_data ->> 'ENGINEERMEMO_AKHIR'), '') AS engineermemo_akhir,

            NULLIF(TRIM(raw_data ->> 'AMCREW'), '') AS amcrew,
            NULLIF(TRIM(raw_data ->> 'LABORCODE'), '') AS laborcode,
            NULLIF(TRIM(raw_data ->> 'LABORNAME'), '') AS laborname,
            NULLIF(TRIM(raw_data ->> 'CHIEF_CODE'), '') AS chief_code,
            NULLIF(TRIM(raw_data ->> 'CHIEF_NAME'), '') AS chief_name,
            NULLIF(TRIM(raw_data ->> 'OWNERGROUP'), '') AS ownergroup,
            NULLIF(TRIM(raw_data ->> 'ERRORCODE'), '') AS errorcode,
            NULLIF(TRIM(raw_data ->> 'SUBERRORCODE'), '') AS suberrorcode,
            NULLIF(TRIM(raw_data ->> 'ERRORCODE_AKHIR'), '') AS errorcode_akhir,
            NULLIF(TRIM(raw_data ->> 'SUBERRORCODE_AKHIR'), '') AS suberrorcode_akhir,
            NULLIF(TRIM(raw_data ->> 'MEASUREMENT'), '')::VARCHAR(10) AS measurement,
            NULLIF(TRIM(raw_data ->> 'ODP_NAME'), '') AS odp_name,
            NULLIF(TRIM(raw_data ->> 'ODP_NAME_UT'), '') AS odp_name_ut,
            NULLIF(TRIM(raw_data ->> 'NEW_RESERVATIONID'), '') AS new_reservationid,
            NULLIF(TRIM(raw_data ->> 'TIKET_ID'), '') AS tiket_id,
            NULLIF(TRIM(raw_data ->> 'FLAG_WSA'), '') AS flag_wsa,
            NULLIF(TRIM(raw_data ->> 'FLAG_PDA'), '') AS flag_pda,
            NULLIF(TRIM(raw_data ->> 'HOMEPASSID'), '') AS homepassid,

            etl.fn_safe_cast_timestamptz(raw_data ->> 'TGL_PI_AWAL') AS tgl_pi_awal,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'TGL_PI_AKHIR') AS tgl_pi_akhir,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'TGL_FALLOUT_AWAL') AS tgl_fallout_awal,
            etl.fn_safe_cast_timestamptz(raw_data ->> 'TGL_FALLOUT_AKHIR') AS tgl_fallout_akhir,
            NULLIF(TRIM(raw_data ->> 'TERRITORY_TIF'), '') AS territory_tif,
            NULLIF(TRIM(raw_data ->> 'DISTRICT_TIF'), '') AS district_tif,

            -- Safe UT Coordinates
            etl.fn_safe_cast_float(raw_data ->> 'LONG_INST_UT') AS long_inst_ut,
            etl.fn_safe_cast_float(raw_data ->> 'LAT_INST_UT') AS lat_inst_ut,
            etl.fn_safe_cast_float(raw_data ->> 'LONG_RETAG_UT') AS long_retag_ut,
            etl.fn_safe_cast_float(raw_data ->> 'LAT_RETAG_UT') AS lat_retag_ut
        FROM filtered_raw
        WHERE raw_data ->> 'WONUM' IS NOT NULL
          AND TRIM(raw_data ->> 'WONUM') != ''
    )
    INSERT INTO public.data_kpro (
        wonum, crmordertype, scorderno, servicenum, ncli, flag_order,
        regional_baru, district_baru, datel_baru, sto,
        regional_lama, district_lama, datel_lama,
        package_name, product, jenis_product, customer_name, customer_address, no_hp,
        latitude_ins, longitude_ins, datecreated, tgl_manja, actstart, schedule_labor,
        statusdate, tanggal_approval, status_survey, status_task, status,
        status_approval, status_odp, desc_task, engineermemo, catatan_teknisi,
        keterangan_pi, engineermemo_akhir,
        amcrew, laborcode, laborname, chief_code, chief_name, ownergroup,
        errorcode, suberrorcode, errorcode_akhir, suberrorcode_akhir,
        measurement, odp_name, odp_name_ut, new_reservationid, tiket_id,
        flag_wsa, flag_pda, homepassid,
        tgl_pi_awal, tgl_pi_akhir, tgl_fallout_awal, tgl_fallout_akhir,
        territory_tif, district_tif, long_inst_ut, lat_inst_ut, long_retag_ut, lat_retag_ut,
        created_at, updated_at
    )
    SELECT 
        s.wonum, s.crmordertype, s.scorderno, s.servicenum, s.ncli, s.flag_order,
        s.regional_baru, s.district_baru, s.datel_baru, s.sto,
        s.regional_lama, s.district_lama, s.datel_lama,
        s.package_name, s.product, s.jenis_product, s.customer_name, s.customer_address, s.no_hp,
        s.latitude_ins, s.longitude_ins, s.datecreated, s.tgl_manja, s.actstart, s.schedule_labor,
        s.statusdate, s.tanggal_approval, s.status_survey, s.status_task, s.status,
        s.status_approval, s.status_odp, s.desc_task, s.engineermemo, s.catatan_teknisi,
        s.keterangan_pi, s.engineermemo_akhir,
        s.amcrew, s.laborcode, s.laborname, s.chief_code, s.chief_name, s.ownergroup,
        s.errorcode, s.suberrorcode, s.errorcode_akhir, s.suberrorcode_akhir,
        s.measurement, s.odp_name, s.odp_name_ut, s.new_reservationid, s.tiket_id,
        s.flag_wsa, s.flag_pda, s.homepassid,
        s.tgl_pi_awal, s.tgl_pi_akhir, s.tgl_fallout_awal, s.tgl_fallout_akhir,
        s.territory_tif, s.district_tif, s.long_inst_ut, s.lat_inst_ut, s.long_retag_ut, s.lat_retag_ut,
        NOW(), NOW()
    FROM sanitized s
    ON CONFLICT (wonum) DO UPDATE SET
        crmordertype = EXCLUDED.crmordertype,
        scorderno = EXCLUDED.scorderno,
        servicenum = EXCLUDED.servicenum,
        ncli = EXCLUDED.ncli,
        flag_order = EXCLUDED.flag_order,
        regional_baru = EXCLUDED.regional_baru,
        district_baru = EXCLUDED.district_baru,
        datel_baru = EXCLUDED.datel_baru,
        sto = EXCLUDED.sto,
        regional_lama = EXCLUDED.regional_lama,
        district_lama = EXCLUDED.district_lama,
        datel_lama = EXCLUDED.datel_lama,
        package_name = EXCLUDED.package_name,
        product = EXCLUDED.product,
        jenis_product = EXCLUDED.jenis_product,
        customer_name = EXCLUDED.customer_name,
        customer_address = EXCLUDED.customer_address,
        no_hp = EXCLUDED.no_hp,
        latitude_ins = EXCLUDED.latitude_ins,
        longitude_ins = EXCLUDED.longitude_ins,
        datecreated = EXCLUDED.datecreated,
        tgl_manja = EXCLUDED.tgl_manja,
        actstart = EXCLUDED.actstart,
        schedule_labor = EXCLUDED.schedule_labor,
        statusdate = EXCLUDED.statusdate,
        tanggal_approval = EXCLUDED.tanggal_approval,
        status_survey = EXCLUDED.status_survey,
        status_task = EXCLUDED.status_task,
        status = EXCLUDED.status,
        status_approval = EXCLUDED.status_approval,
        status_odp = EXCLUDED.status_odp,
        desc_task = EXCLUDED.desc_task,
        engineermemo = EXCLUDED.engineermemo,
        catatan_teknisi = EXCLUDED.catatan_teknisi,
        keterangan_pi = EXCLUDED.keterangan_pi,
        engineermemo_akhir = EXCLUDED.engineermemo_akhir,
        amcrew = EXCLUDED.amcrew,
        laborcode = EXCLUDED.laborcode,
        laborname = EXCLUDED.laborname,
        chief_code = EXCLUDED.chief_code,
        chief_name = EXCLUDED.chief_name,
        ownergroup = EXCLUDED.ownergroup,
        errorcode = EXCLUDED.errorcode,
        suberrorcode = EXCLUDED.suberrorcode,
        errorcode_akhir = EXCLUDED.errorcode_akhir,
        suberrorcode_akhir = EXCLUDED.suberrorcode_akhir,
        measurement = EXCLUDED.measurement,
        odp_name = EXCLUDED.odp_name,
        odp_name_ut = EXCLUDED.odp_name_ut,
        new_reservationid = EXCLUDED.new_reservationid,
        tiket_id = EXCLUDED.tiket_id,
        flag_wsa = EXCLUDED.flag_wsa,
        flag_pda = EXCLUDED.flag_pda,
        homepassid = EXCLUDED.homepassid,
        tgl_pi_awal = EXCLUDED.tgl_pi_awal,
        tgl_pi_akhir = EXCLUDED.tgl_pi_akhir,
        tgl_fallout_awal = EXCLUDED.tgl_fallout_awal,
        tgl_fallout_akhir = EXCLUDED.tgl_fallout_akhir,
        territory_tif = EXCLUDED.territory_tif,
        district_tif = EXCLUDED.district_tif,
        long_inst_ut = EXCLUDED.long_inst_ut,
        lat_inst_ut = EXCLUDED.lat_inst_ut,
        long_retag_ut = EXCLUDED.long_retag_ut,
        lat_retag_ut = EXCLUDED.lat_retag_ut,
        updated_at = NOW();

    GET DIAGNOSTICS p_compwork_upserted = ROW_COUNT;

    -- 3. Hapus langsung data staging untuk job ini (Kebijakan: Langsung dihapus per job untuk hemat disk)
    DELETE FROM etl.staging_data_kpro_raw
    WHERE job_id = p_job_id;

    -- 4. Update status dan ringkasan metrik pada etl.import_jobs
    UPDATE etl.import_jobs
    SET 
        status = 'COMPLETED',
        total_rows = p_total_staging,
        processed_rows = p_total_staging,
        success_rows = p_compwork_upserted,
        error_rows = p_error_count,
        finished_at = clock_timestamp()
    WHERE id = p_job_id;

    -- 5. Catat riwayat upload ke etl.upload_logs
    INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
    VALUES ('data_kpro', NOW(), 1, NOW());

    -- 6. IMPROVEMENT 2: Retensi Otomatis (Hapus log riwayat yang lebih lama dari 90 hari)
    DELETE FROM etl.import_jobs WHERE finished_at < NOW() - INTERVAL '90 days';
    DELETE FROM etl.upload_logs WHERE created_at < NOW() - INTERVAL '90 days';

END;
$$;

-- ==============================================================================
-- 2. K-PRO IMPROVEMENT 3: Lock-Safe Materialized View Refresh (Anti-Bentrok)
-- ==============================================================================

CREATE OR REPLACE PROCEDURE analytics.sp_refresh_kpro_mview_safe(OUT p_refreshed BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_lock_acquired BOOLEAN;
BEGIN
    p_refreshed := FALSE;
    -- Menggunakan PostgreSQL Advisory Transaction Lock berbasis hash
    -- Menjamin jika cron 30-menitan sedang refresh mview ini, pemanggilan dari scraper akan skip anggun (tidak bentrok/deadlock)
    SELECT pg_try_advisory_xact_lock(hashtext('analytics.mv_kpro_rekon_summary')) INTO v_lock_acquired;

    IF NOT v_lock_acquired THEN
        RAISE NOTICE '[ANALYTICS] Refresh for mv_kpro_rekon_summary already in progress by concurrent process. Skipping gracefully.';
        RETURN;
    END IF;

    -- Eksekusi REFRESH CONCURRENTLY
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpro_rekon_summary;

    INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
    VALUES ('analytics.mv_kpro_rekon_summary', NOW(), 1, NOW());

    p_refreshed := TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ANALYTICS] Lock-safe refresh mv_kpro_rekon_summary warning: %', SQLERRM;
    p_refreshed := FALSE;
END;
$$;

-- Perbarui juga sp_refresh_analytics_mviews agar memakai lock-safe check yang sama
CREATE OR REPLACE PROCEDURE analytics.sp_refresh_analytics_mviews()
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_duration_ms INT;
    v_kpro_lock BOOLEAN;
BEGIN
    -- 1. Refresh mv_kpro_rekon_summary secara aman dari bentrok
    SELECT pg_try_advisory_xact_lock(hashtext('analytics.mv_kpro_rekon_summary')) INTO v_kpro_lock;
    IF v_kpro_lock THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpro_rekon_summary;
        INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
        VALUES ('analytics.mv_kpro_rekon_summary', NOW(), 1, NOW());
    ELSE
        RAISE NOTICE '[ANALYTICS] Concurrent refresh already in progress for mv_kpro_rekon_summary, skipping.';
    END IF;

    -- 2. Refresh MView WO Lensa & Out Lensa
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_wo_lensa_rekon_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_out_sap_lensa_summary;

    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000);

    INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
    VALUES 
        ('analytics.mv_wo_lensa_rekon_summary', NOW(), 1, NOW()),
        ('analytics.mv_out_sap_lensa_summary', NOW(), 1, NOW());

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ANALYTICS] Failed to refresh analytics materialized views: %', SQLERRM;
    RAISE;
END;
$$;

-- ==============================================================================
-- 3. ITEM 2: TABEL NORMALISASI & PEMETAAN ALIAS (LENSA & K-PRO)
-- ==============================================================================

-- 3.1 Master Pemetaan Alias Gudang / STO
CREATE TABLE IF NOT EXISTS inventory.warehouse_alias (
    id SERIAL PRIMARY KEY,
    alias_name VARCHAR(150) NOT NULL,
    source_system VARCHAR(50) NOT NULL DEFAULT 'LENSA', -- 'LENSA', 'KPRO', 'SAP'
    regional VARCHAR(50) NOT NULL DEFAULT 'REGIONAL-5',
    branch_id VARCHAR(50),                              -- Witel / District (e.g. 'GRESIK', 'LAMONGAN')
    warehouse_id INT NOT NULL REFERENCES inventory.mas_wh(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_wh_alias UNIQUE (alias_name, source_system, regional)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_alias_lookup 
    ON inventory.warehouse_alias (LOWER(TRIM(alias_name)), source_system, regional);

-- 3.2 Master Pemetaan Alias Material
CREATE TABLE IF NOT EXISTS inventory.material_alias (
    id SERIAL PRIMARY KEY,
    raw_material_name VARCHAR(200) NOT NULL,
    source_system VARCHAR(50) NOT NULL DEFAULT 'LENSA',
    material_code VARCHAR(100) NOT NULL,                -- Menghubungkan ke code di inventory.materials
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_mat_alias UNIQUE (raw_material_name, source_system)
);

CREATE INDEX IF NOT EXISTS idx_material_alias_lookup 
    ON inventory.material_alias (LOWER(TRIM(raw_material_name)), source_system);

-- 3.3 Log Alias Belum Terpetakan (Unmapped Aliases Alert)
CREATE TABLE IF NOT EXISTS inventory.unmapped_alias_log (
    id BIGSERIAL PRIMARY KEY,
    alias_type VARCHAR(50) NOT NULL,                    -- 'WAREHOUSE' atau 'MATERIAL'
    raw_value VARCHAR(255) NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    regional VARCHAR(50) DEFAULT 'REGIONAL-5',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id VARCHAR(100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unmapped_alias 
    ON inventory.unmapped_alias_log (alias_type, LOWER(TRIM(raw_value)), source_system, regional) 
    WHERE resolved = FALSE;

-- ==============================================================================
-- 4. SEED DATA AWAL TABEL ALIAS GUDANG & MATERIAL
-- ==============================================================================

-- 4.1 Seed Alias Gudang dari inventory.mas_wh & warehouse-helper.ts
INSERT INTO inventory.warehouse_alias (alias_name, source_system, regional, warehouse_id, notes)
VALUES 
    -- SO Karangpilang (ID: 1)
    ('SO Karangpilang', 'LENSA', 'REGIONAL-5', 1, 'Canonical master warehouse name'),
    ('SO Karang Pilang', 'LENSA', 'REGIONAL-5', 1, 'Known scraper variation with space'),
    ('Karangpilang', 'LENSA', 'REGIONAL-5', 1, 'Short name variant'),
    -- SO Gresik (ID: 2)
    ('SO Gresik', 'LENSA', 'REGIONAL-5', 2, 'Canonical master warehouse name'),
    ('Gresik', 'LENSA', 'REGIONAL-5', 2, 'Short name variant'),
    -- SO Lamongan (ID: 3)
    ('SO Lamongan', 'LENSA', 'REGIONAL-5', 3, 'Canonical master warehouse name'),
    ('Lamongan', 'LENSA', 'REGIONAL-5', 3, 'Short name variant'),
    -- SO Bojonegoro (ID: 4)
    ('SO Bojonegoro', 'LENSA', 'REGIONAL-5', 4, 'Canonical master warehouse name'),
    ('Bojonegoro', 'LENSA', 'REGIONAL-5', 4, 'Short name variant'),
    -- SO Tuban (ID: 5)
    ('SO Tuban', 'LENSA', 'REGIONAL-5', 5, 'Canonical master warehouse name'),
    ('Tuban', 'LENSA', 'REGIONAL-5', 5, 'Short name variant'),
    -- Sby Kebalen (ID: 6)
    ('Sby Kebalen', 'LENSA', 'REGIONAL-5', 6, 'Canonical master warehouse name'),
    ('Kebalen', 'LENSA', 'REGIONAL-5', 6, 'Short name variant'),
    -- Vendors (ID: 7)
    ('Vendors', 'LENSA', 'REGIONAL-5', 7, 'Canonical master warehouse name'),
    ('Vendor', 'LENSA', 'REGIONAL-5', 7, 'Singular variant')
ON CONFLICT (alias_name, source_system, regional) DO NOTHING;

-- 4.2 Seed Alias Material dari material-alias-helper.ts
INSERT INTO inventory.material_alias (raw_material_name, source_system, material_code, notes)
VALUES 
    ('Breket / Clamp Hook', 'LENSA', 'BREKET-A', 'Detail WO Lensa tanpa ID MATERIAL dipetakan ke BREKET-A')
ON CONFLICT (raw_material_name, source_system) DO NOTHING;

-- 4.3 Enable RLS on newly created inventory tables (L4 Compliance)
ALTER TABLE inventory.warehouse_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_alias_select_policy ON inventory.warehouse_alias;
CREATE POLICY warehouse_alias_select_policy ON inventory.warehouse_alias FOR SELECT USING (true);
DROP POLICY IF EXISTS warehouse_alias_all_policy ON inventory.warehouse_alias;
CREATE POLICY warehouse_alias_all_policy ON inventory.warehouse_alias FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inventory.material_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_alias_select_policy ON inventory.material_alias;
CREATE POLICY material_alias_select_policy ON inventory.material_alias FOR SELECT USING (true);
DROP POLICY IF EXISTS material_alias_all_policy ON inventory.material_alias;
CREATE POLICY material_alias_all_policy ON inventory.material_alias FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inventory.unmapped_alias_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unmapped_alias_log_select_policy ON inventory.unmapped_alias_log;
CREATE POLICY unmapped_alias_log_select_policy ON inventory.unmapped_alias_log FOR SELECT USING (true);
DROP POLICY IF EXISTS unmapped_alias_log_all_policy ON inventory.unmapped_alias_log;
CREATE POLICY unmapped_alias_log_all_policy ON inventory.unmapped_alias_log FOR ALL USING (true) WITH CHECK (true);
