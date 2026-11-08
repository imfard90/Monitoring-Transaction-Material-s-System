-- Migration: 028_add_nte_wh_mapping.sql
-- mapping_mas_wh column nte_inventory.mas_address_nte
-- Foreign key to inventory.mas_wh for warehouse scoping

BEGIN;

-- Add mapping_mas_wh column (nullable, FK inventory.mas_wh)
ALTER TABLE nte_inventory.mas_address_nte
ADD COLUMN IF NOT EXISTS mapping_mas_wh INTEGER
NULL REFERENCES inventory.mas_wh(id) ON DELETE SET NULL;

COMMENT ON COLUMN nte_inventory.mas_address_nte.mapping_mas_wh IS 
'FK inventory.mas_wh.id warehouse scoping in stored procedures. Null if NTE address does not map existing inventory warehouse.';

-- Populate mapping TELKOM addresses (Lamongan branch alignment)
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 1 WHERE address_name = 'ta_so_ccan_bambe_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_gresik_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_lamongan_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 4 WHERE address_name = 'ta_so_ccan_bojonegoro_wh';

-- Populate mapping TIF addresses (Surabaya region)
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_sby_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_gresik_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_lamongan_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_sby_utara_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_sby_selatan_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 3 WHERE address_name = 'ta_so_ccan_tif_sby_barat_wh';

-- Populate mapping Telkomsel addresses (Semarang region)
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_semarang_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_solo_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_yogya_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_magelang_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_pati_wh';
UPDATE nte_inventory.mas_address_nte SET mapping_mas_wh = 2 WHERE address_name = 'ta_so_ccan_telsel_kudus_wh';

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_mas_address_nte_mapping_mas_wh ON nte_inventory.mas_address_nte(mapping_mas_wh);

-- GRANT: minimum privileges
REVOKE ALL ON nte_inventory.mas_address_nte FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON nte_inventory.mas_address_nte TO imam;

COMMIT;
