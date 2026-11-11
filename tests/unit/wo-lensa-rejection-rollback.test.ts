import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRollback = vi.fn().mockResolvedValue(undefined);
const mockSelectFrom = vi.fn();

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (...args: unknown[]) => mockSelectFrom(...args),
    },
}));

vi.mock('@/lib/repositories', () => ({
    createInventoryRepository: () => ({
        rollbackReconciledWOLensa: mockRollback,
    }),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    handleRejectedWOPemakaian,
    processRejectedWOLensaItems,
} from '@/lib/services/lensa-wo/rollback-service';

describe('WO Lensa Rejection Rollback Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns rolledBack: false when pemakaianId is blank', async () => {
        const result = await handleRejectedWOPemakaian({ pemakaianId: '   ' });
        expect(result.rolledBack).toBe(false);
        expect(result.reason).toBe('Pemakaian ID kosong');
        expect(mockRollback).not.toHaveBeenCalled();
    });

    it('returns rolledBack: false when pemakaian is not in database', async () => {
        // Return undefined for both wo_lensa_header and rekon_used_header
        mockSelectFrom.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        });

        const result = await handleRejectedWOPemakaian({ pemakaianId: '100999999' });
        expect(result.rolledBack).toBe(false);
        expect(result.reason).toBe('Data tidak ditemukan di database MTMS');
        expect(mockRollback).not.toHaveBeenCalled();
    });

    it('invokes rollbackReconciledWOLensa when pemakaian exists in wo_lensa_header or rekon_used_header', async () => {
        // First call: wo_lensa_header found
        // Second call: rekon_used_header found
        let callCount = 0;
        mockSelectFrom.mockImplementation(() => {
            callCount++;
            return {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(
                    callCount === 1
                        ? { id: '3436', wo_number: 'WO-12345', nama_gudang: 'SO Tuban' }
                        : { id: '3225', wo_number: 'WO-12345', nik_teknisi: '16031689', name_gudang: 'SO Tuban' }
                ),
            };
        });

        const result = await handleRejectedWOPemakaian({
            pemakaianId: '100369772',
            woNumber: 'WO-12345-REJECTED-20261110',
            actor: 'test-user',
        });

        expect(result.rolledBack).toBe(true);
        expect(result.pemakaianId).toBe('100369772');
        expect(mockRollback).toHaveBeenCalledWith(
            '100369772',
            expect.stringContaining('WO berstatus REJECTED di Lensa'),
            'test-user'
        );
    });

    it('processRejectedWOLensaItems handles batch of rejected items cleanly', async () => {
        mockSelectFrom.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: '1', wo_number: 'WO-REJECT' }),
        });

        const items = [
            { pemakaian_id: '1001', wo_number: 'WO-1-REJECTED' },
            { pemakaian_id: '1002', wo_number: 'WO-2-REJECTED' },
            { pemakaian_id: '', wo_number: 'WO-EMPTY' },
        ];

        const results = await processRejectedWOLensaItems(items, 'cron');
        expect(results).toHaveLength(2);
        expect(results[0].rolledBack).toBe(true);
        expect(results[1].rolledBack).toBe(true);
        expect(mockRollback).toHaveBeenCalledTimes(2);
    });
});

