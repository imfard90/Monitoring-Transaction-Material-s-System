-- Migration: add pic_1 and pic_2 to inventory.mas_wh
-- pic_1 and pic_2 store NIK (FK to hr.employees.nik)

ALTER TABLE inventory.mas_wh
    ADD COLUMN IF NOT EXISTS pic_1 VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS pic_2 VARCHAR(20) NULL;

COMMENT ON COLUMN inventory.mas_wh.pic_1 IS 'NIK staff PIC utama yang bertanggung jawab atas gudang ini (FK to hr.employees.nik)';
COMMENT ON COLUMN inventory.mas_wh.pic_2 IS 'NIK staff PIC kedua untuk gudang ini (FK to hr.employees.nik)';
