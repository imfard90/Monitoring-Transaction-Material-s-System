-- Migration 061: Add indexes on inventory.rekon_used_header(wo_number) and public.data_kpro(district_tif, statusdate)

CREATE INDEX IF NOT EXISTS idx_rekon_used_header_wo_number
    ON inventory.rekon_used_header (wo_number);

CREATE INDEX IF NOT EXISTS idx_kpro_district_tif_statusdate
    ON public.data_kpro (district_tif, statusdate DESC);

CREATE INDEX IF NOT EXISTS idx_kpro_datel_baru
    ON public.data_kpro (datel_baru);
