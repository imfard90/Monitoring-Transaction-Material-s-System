-- Migration 030: Add check_sn column to mas_address_nte
-- Purpose: Control SN validation per address for TAG WH-WH transactions
-- - check_sn = true: Validate SN must exist in source WH (UPDATE address)
-- - check_sn = false: No validation, INSERT new SN (requires item_description)

ALTER TABLE nte_inventory.mas_address_nte
ADD COLUMN IF NOT EXISTS check_sn BOOLEAN DEFAULT true;

COMMENT ON COLUMN nte_inventory.mas_address_nte.check_sn IS
'true = validasi SN wajib (harus exist di WH asal), false = INSERT new SN (butuh item_description di payload)';

-- Data migration: Set check_sn based on owner and address_name prefix
-- SO address (owner=telkom, prefix ta_so_* OR ta_witel_ccan_*) → check_sn = true
UPDATE nte_inventory.mas_address_nte
SET check_sn = true
WHERE owner = 'telkom'
  AND (address_name LIKE 'ta_so_%' OR address_name LIKE 'ta_witel_ccan_%');

-- NONSO address (owner=tif/tsel, prefix tif_* OR ta_witel_inv_*) → check_sn = false
UPDATE nte_inventory.mas_address_nte
SET check_sn = false
WHERE owner IN ('tif', 'tsel')
  AND (address_name LIKE 'tif_%' OR address_name LIKE 'ta_witel_inv_%');

-- Note: Addresses not matching above patterns keep default check_sn = true
-- Admin can manually adjust via SQL or future UI management feature
