-- Migration 068: Drop legacy two-hop K-PRO ETL functions (replaced by etl.sp_process_kpro_staging)

DROP FUNCTION IF EXISTS etl.copy_to_data_kpro(bigint);
DROP FUNCTION IF EXISTS etl.copy_to_data_kpro(integer);
DROP FUNCTION IF EXISTS etl.copy_to_data_kpro();

DROP FUNCTION IF EXISTS etl.transform_kpro(bigint);
DROP FUNCTION IF EXISTS etl.transform_kpro(integer);
DROP FUNCTION IF EXISTS etl.transform_kpro();
