-- Migration 062: Adjust K-PRO timestamp columns by -7 hours to correct historical naive WIB to UTC offset
-- Author: MTMS Team
-- Date: 2026-11-14

UPDATE public.data_kpro
SET 
    statusdate = statusdate - INTERVAL '7 hours',
    datecreated = CASE WHEN datecreated IS NOT NULL THEN datecreated - INTERVAL '7 hours' ELSE NULL END,
    tgl_manja = CASE WHEN tgl_manja IS NOT NULL THEN tgl_manja - INTERVAL '7 hours' ELSE NULL END,
    tgl_pi_awal = CASE WHEN tgl_pi_awal IS NOT NULL THEN tgl_pi_awal - INTERVAL '7 hours' ELSE NULL END,
    tgl_pi_akhir = CASE WHEN tgl_pi_akhir IS NOT NULL THEN tgl_pi_akhir - INTERVAL '7 hours' ELSE NULL END,
    tgl_fallout_awal = CASE WHEN tgl_fallout_awal IS NOT NULL THEN tgl_fallout_awal - INTERVAL '7 hours' ELSE NULL END,
    tgl_fallout_akhir = CASE WHEN tgl_fallout_akhir IS NOT NULL THEN tgl_fallout_akhir - INTERVAL '7 hours' ELSE NULL END
WHERE statusdate IS NOT NULL;
