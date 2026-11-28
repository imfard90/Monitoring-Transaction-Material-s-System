-- Migration 080: Drop legacy unused ETL clean tables and their obsolete transform/copy functions
-- Reason: Tables etl.data_kpro_clean, etl.data_rfc_material_clean, and etl.data_sap_finance_tree_clean
--         are no longer used by the MTMS application (replaced by direct staging -> inventory/analytics ELT).
-- Rollback: Restore from pg_dump backup if legacy ETL clean tables are ever needed again.

DROP FUNCTION IF EXISTS etl.copy_to_finance_sap_finance_tree(BIGINT);
DROP FUNCTION IF EXISTS etl.copy_to_inventory(BIGINT);
DROP FUNCTION IF EXISTS etl.transform_rfc_material(BIGINT);
DROP FUNCTION IF EXISTS etl.transform_sap_finance_tree(BIGINT);

DROP TABLE IF EXISTS etl.data_kpro_clean;
DROP TABLE IF EXISTS etl.data_rfc_material_clean;
DROP TABLE IF EXISTS etl.data_sap_finance_tree_clean;
