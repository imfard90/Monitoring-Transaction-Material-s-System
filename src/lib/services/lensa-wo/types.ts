/**
 * Shared types and helpers for the WO Lensa scraping services.
 *
 * Kept separate so each service module (sync / nightly / detail) can depend on
 * the contract without pulling in the others' implementation.
 */
import { format } from 'date-fns';

export interface ScrapedWODetailMaterial {
    material_id: string | null;
    material_desc: string | null;
    uom: string | null;
    qty_pemakaian: number | null;
}

export interface ScrapedWODetailResult {
    pemakaian_id: string;
    wo_number: string | null;
    nama_gudang: string | null;
    nik_pemakai?: string | null;
    type: string | null;
    materials: ScrapedWODetailMaterial[];
}

/**
 * Material row as returned by the Lensa detail endpoint (column-name keyed).
 *
 * The Lensa API returns objects whose keys are human-readable column labels
 * (e.g. `ID MATERIAL`, `QTY PEMAKAIAN`), so values are kept untyped here and
 * narrowed by the mapper that consumes them.
 */
export type LensaDetailMaterial = Record<string, unknown>;

export interface WOLensaScrapeOutcome {
    success: boolean;
    message: string;
    newCount?: number;
}

export function toISODateString(val: unknown): string | null {
    if (!val) return null;
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, 'yyyy-MM-dd');
    }
    return null;
}

