import { describe, expect, it } from 'vitest';

/** Simulates the REJECTED filter logic extracted from internalTriggerWOScraping Phase 1. */
function filterRejectedWOLHeaders(
    headers: Array<{ pemakaian_id: string; wo_number: string | null }>
) {
    return headers.filter((h) => !h.wo_number?.toUpperCase().includes('REJECTED'));
}

describe('WO Lensa Ref — REJECTED header filtering', () => {
    it('filters out headers where wo_number contains "REJECTED" (uppercase)', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: 'WO-2025-001' },
            { pemakaian_id: 'WO-002', wo_number: 'WO-2025-002-REJECTED' },
            { pemakaian_id: 'WO-003', wo_number: 'WO-2025-003' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(2);
        expect(result.map((h) => h.pemakaian_id)).toEqual(['WO-001', 'WO-003']);
    });

    it('filters out headers where wo_number contains "rejected" (lowercase)', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: 'WO-2025-001-rejected' },
            { pemakaian_id: 'WO-002', wo_number: 'WO-2025-002' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(1);
        expect(result[0].pemakaian_id).toBe('WO-002');
    });

    it('filters out headers where wo_number contains "Rejected" (mixed case)', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: 'WO-2025-001-Rejected' },
            { pemakaian_id: 'WO-002', wo_number: 'REJECTED WO 2025' },
            { pemakaian_id: 'WO-003', wo_number: 'WO-2025-003' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(1);
        expect(result[0].pemakaian_id).toBe('WO-003');
    });

    it('keeps headers with null wo_number', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: null },
            { pemakaian_id: 'WO-002', wo_number: 'WO-2025-002' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(2);
    });

    it('keeps headers with undefined wo_number', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: undefined as unknown as string | null },
            { pemakaian_id: 'WO-002', wo_number: 'WO-2025-002' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(2);
    });

    it('returns empty array when all headers are REJECTED', () => {
        const headers = [
            { pemakaian_id: 'WO-001', wo_number: 'WO-2025-001-REJECTED' },
            { pemakaian_id: 'WO-002', wo_number: 'REJECTED-WO-002' },
        ];
        const result = filterRejectedWOLHeaders(headers);
        expect(result).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
        expect(filterRejectedWOLHeaders([])).toHaveLength(0);
    });
});
