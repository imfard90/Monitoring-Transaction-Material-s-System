-- Migration 025: Fix NULL material_id untuk "Breket / Clamp Hook" di wo_lensa_list
--
-- Root cause: Lensa API mengembalikan kolom ID MATERIAL kosong untuk material
-- dengan nama gabungan "Breket / Clamp Hook". Scraper menyimpan NULL ke DB.
--
-- Fix: Update 10 entries yang teridentifikasi ke material_id 'BREKET-A' (id=52)
-- sesuai konfirmasi bisnis. Ke depan scraper akan memakai resolveMaterialAlias()
-- sebagai fallback sebelum menyimpan NULL.

UPDATE inventory.wo_lensa_list
SET material_id = 'BREKET-A'
WHERE material_id IS NULL
  AND material_desc = 'Breket / Clamp Hook';
