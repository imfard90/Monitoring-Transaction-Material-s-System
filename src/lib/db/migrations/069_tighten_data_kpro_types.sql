-- Migration 069: Tighten Column Types on public.data_kpro & Add Safe Cast Helper for Smallint
-- 1. regional_baru: VARCHAR(10) -> SMALLINT
-- 2. wonum: VARCHAR(20) -> VARCHAR(15)
-- 3. sto: VARCHAR(20) -> VARCHAR(5)
-- 4. crmordertype: VARCHAR(20) -> VARCHAR(10)
-- 5. measurement: VARCHAR(100) -> VARCHAR(10)

CREATE SCHEMA IF NOT EXISTS etl;

-- 1. Fungsi Pembantu: Safe Cast ke Smallint (INT2)
CREATE OR REPLACE FUNCTION etl.fn_safe_cast_smallint(val TEXT)
RETURNS INT2
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    IF val IS NULL THEN
        RETURN NULL;
    END IF;
    v_clean := TRIM(val);
    IF v_clean IN ('', '-', 'null', 'NULL', 'None') THEN
        RETURN NULL;
    END IF;
    IF v_clean ~ '^[0-9]+$' THEN
        RETURN v_clean::INT2;
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 2. Pengetatan Tipe Kolom pada public.data_kpro
ALTER TABLE public.data_kpro
    ALTER COLUMN regional_baru TYPE SMALLINT USING NULLIF(TRIM(regional_baru), '')::SMALLINT,
    ALTER COLUMN wonum TYPE VARCHAR(15),
    ALTER COLUMN sto TYPE VARCHAR(5),
    ALTER COLUMN crmordertype TYPE VARCHAR(10),
    ALTER COLUMN measurement TYPE VARCHAR(10);

-- 3. Update Stored Procedure Utama etl.sp_process_kpro_staging agar menggunakan safe cast smallint
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

END;
$$;
