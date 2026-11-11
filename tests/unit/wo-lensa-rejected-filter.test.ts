import { describe, expect, it } from 'vitest';
import {
    isRejectedWONumber,
    selectBestCandidateWOLensaHeader,
} from '@/lib/lensa-scraper/lensa-wo-helpers';

/** Simulates the REJECTED filter logic using isRejectedWONumber */
function filterRejectedWOLHeaders(
    headers: Array<{ pemakaian_id: string; wo_number: string | null }>
) {
    return headers.filter((h) => !isRejectedWONumber(h.wo_number));
}

describe('WO Lensa Ref — REJECTED header filtering', () => {
    it('isRejectedWONumber identifies rejected wo numbers in any case', () => {
        expect(isRejectedWONumber('DGPS123-REJECTED-20261106')).toBe(true);
        expect(isRejectedWONumber('WO-rejected-123')).toBe(true);
        expect(isRejectedWONumber('Rejected WO 2026')).toBe(true);
        expect(isRejectedWONumber('WO-NORMAL-123')).toBe(false);
        expect(isRejectedWONumber(null)).toBe(false);
        expect(isRejectedWONumber(undefined)).toBe(false);
        expect(isRejectedWONumber('')).toBe(false);
    });
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

describe('WO Lensa Ref — selectBestCandidateWOLensaHeader (Reject Avoidance)', () => {
    it('prioritizes valid non-rejected WO over rejected WO even if rejected appears first', () => {
        const items = [
            {
                pemakaian_id: 100340964,
                wo_number: 'DGPS261105130255330310657-AOi4261105010255738277820-REJECTED-20261106152519',
                tanggal_update: '06/11/2026',
            },
            {
                pemakaian_id: 100340971,
                wo_number: 'DGPS261105130255330310657-AOi4261105010255738277820',
                tanggal_update: '06/11/2026',
            },
        ];

        // Pencarian dengan nomor insiden / WO
        const candidate = selectBestCandidateWOLensaHeader(items, 'AOi4261105010255738277820');
        expect(candidate).not.toBeNull();
        expect(candidate?.pemakaian_id).toBe(100340971);
        expect(isRejectedWONumber(String(candidate?.wo_number))).toBe(false);
    });

    it('correctly picks the sole non-rejected WO when multiple prior submissions were rejected (Tuban case: 5 reject, 1 valid)', () => {
        const items = [
            { pemakaian_id: 100359739, wo_number: 'DGPS261107...-AOi4261107095410087f06590-REJECTED-20261108094714' },
            { pemakaian_id: 100359740, wo_number: 'DGPS261107...-AOi4261107095410087f06590-REJECTED-20261108094720' },
            { pemakaian_id: 100359741, wo_number: 'DGPS261107...-AOi4261107095410087f06590-REJECTED-20261108094726' },
            { pemakaian_id: 100359742, wo_number: 'DGPS261107...-AOi4261107095410087f06590-REJECTED-20261108094735' },
            { pemakaian_id: 100359743, wo_number: 'DGPS261107...-AOi4261107095410087f06590-REJECTED-20261108094752' },
            { pemakaian_id: 100359744, wo_number: 'DGPS261107...-AOi4261107095410087f06590' },
        ];

        const candidate = selectBestCandidateWOLensaHeader(items, 'AOi4261107095410087f06590');
        expect(candidate).not.toBeNull();
        expect(candidate?.pemakaian_id).toBe(100359744);
        expect(isRejectedWONumber(String(candidate?.wo_number))).toBe(false);
    });

    it('returns the rejected candidate when all results are rejected so downstream can identify rejection', () => {
        const items = [
            { pemakaian_id: 100359739, wo_number: 'WO-1-REJECTED' },
            { pemakaian_id: 100359740, wo_number: 'WO-2-REJECTED' },
        ];

        const candidate = selectBestCandidateWOLensaHeader(items, 'WO-1-REJECTED');
        expect(candidate).not.toBeNull();
        expect(isRejectedWONumber(String(candidate?.wo_number))).toBe(true);
    });

    it('returns the exact candidate matching targetPemakaianId even if rejected so downstream can roll it back', () => {
        const items = [
            {
                pemakaian_id: 100369772,
                wo_number: 'DGPS2611...-AOi4...-REJECTED-20261110135239',
            },
            {
                pemakaian_id: 100383876,
                wo_number: 'DGPS2611...-AOi4...',
            },
        ];

        const candidate = selectBestCandidateWOLensaHeader(
            items,
            'AOi4...',
            '100369772'
        );
        expect(candidate).not.toBeNull();
        expect(candidate?.pemakaian_id).toBe(100369772);
        expect(isRejectedWONumber(String(candidate?.wo_number))).toBe(true);
    });

    it('returns the exact candidate when cleanQuery is a numeric pemakaian_id even if rejected', () => {
        const items = [
            {
                pemakaian_id: 100369772,
                wo_number: 'DGPS2611...-AOi4...-REJECTED-20261110135239',
            },
            {
                pemakaian_id: 100383876,
                wo_number: 'DGPS2611...-AOi4...',
            },
        ];

        const candidate = selectBestCandidateWOLensaHeader(items, '100369772');
        expect(candidate).not.toBeNull();
        expect(candidate?.pemakaian_id).toBe(100369772);
        expect(isRejectedWONumber(String(candidate?.wo_number))).toBe(true);
    });

    it('returns null on empty items list', () => {
        expect(selectBestCandidateWOLensaHeader([], '12345')).toBeNull();
    });
});
