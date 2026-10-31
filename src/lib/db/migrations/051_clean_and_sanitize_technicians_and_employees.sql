-- ============================================================================
-- Migration: 051_clean_and_sanitize_technicians_and_employees.sql
-- Description:
-- 1. Sanitize existing whitespace and Unicode non-breaking spaces (\u00A0) in
--    hr.technicians (nik, name) and hr.employees (nik, nama).
-- 2. Create BEFORE INSERT OR UPDATE triggers on hr.technicians and hr.employees
--    to automatically sanitize nik (strip all whitespace/NBSP) and names
--    (trim and collapse multi-whitespace/NBSP) before persisting.
-- ============================================================================

-- 1. Sanitize existing data in hr.technicians
UPDATE hr.technicians
SET nik = regexp_replace(nik, '[\s\u00a0]+', '', 'g'),
    name = trim(regexp_replace(regexp_replace(name, '[\u00a0]', ' ', 'g'), '\s+', ' ', 'g'))
WHERE nik ~ '[\s\u00a0]'
   OR name ~ '[\u00a0]'
   OR name != trim(name)
   OR name ~ '\s{2,}';

-- 2. Sanitize existing data in hr.employees
UPDATE hr.employees
SET nik = regexp_replace(nik, '[\s\u00a0]+', '', 'g'),
    nama = trim(regexp_replace(regexp_replace(nama, '[\u00a0]', ' ', 'g'), '\s+', ' ', 'g'))
WHERE nik ~ '[\s\u00a0]'
   OR nama ~ '[\u00a0]'
   OR nama != trim(nama)
   OR nama ~ '\s{2,}';

-- 3. Automatic sanitization trigger for hr.technicians
CREATE OR REPLACE FUNCTION hr.fn_sanitize_technician_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.nik IS NOT NULL THEN
        NEW.nik := regexp_replace(NEW.nik, '[\s\u00a0]+', '', 'g');
    END IF;

    IF NEW.name IS NOT NULL THEN
        NEW.name := trim(regexp_replace(regexp_replace(NEW.name, '[\u00a0]', ' ', 'g'), '\s+', ' ', 'g'));
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_technician_identity ON hr.technicians;
CREATE TRIGGER trg_sanitize_technician_identity
BEFORE INSERT OR UPDATE OF nik, name ON hr.technicians
FOR EACH ROW
EXECUTE FUNCTION hr.fn_sanitize_technician_identity();

-- 4. Automatic sanitization trigger for hr.employees
CREATE OR REPLACE FUNCTION hr.fn_sanitize_employee_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.nik IS NOT NULL THEN
        NEW.nik := regexp_replace(NEW.nik, '[\s\u00a0]+', '', 'g');
    END IF;

    IF NEW.nama IS NOT NULL THEN
        NEW.nama := trim(regexp_replace(regexp_replace(NEW.nama, '[\u00a0]', ' ', 'g'), '\s+', ' ', 'g'));
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_employee_identity ON hr.employees;
CREATE TRIGGER trg_sanitize_employee_identity
BEFORE INSERT OR UPDATE OF nik, nama ON hr.employees
FOR EACH ROW
EXECUTE FUNCTION hr.fn_sanitize_employee_identity();
