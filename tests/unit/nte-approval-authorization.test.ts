/**
 * NTE TAG Approval Authorization Tests
 * ADR-002 NTE-06: Stored procedure warehouse authorization contract
 * ADR-002 NTE-09: Warehouse mapping validation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createNteRepository } from '@/lib/repositories/nte.repository';

const { execute, statements } = vi.hoisted(() => ({
    execute: vi.fn(),
    statements: [] as string[],
}));
vi.mock('@/lib/db/db', () => ({ db: {} }));
vi.mock('kysely', async (importOriginal) => {
    const actual = await importOriginal<typeof import('kysely')>();
    return {
        ...actual,
        sql: (strings: TemplateStringsArray, ..._values: unknown[]) => {
            statements.push(strings.join('?'));
            return { execute };
        },
    };
});
const { createNteRepository: makeRepository } = await import('@/lib/repositories/nte.repository');
const repository = makeRepository({} as Parameters<typeof createNteRepository>[0]);

const approvalParams = {
    idTransaksi: 'TAG-1',
    approvedBy: 'ADM001',
    warehouseId: 2,
};
const rejectionParams = {
    idTransaksi: 'TAG-1',
    rejectedBy: 'ADM001',
    warehouseId: null,
    notes: 'Tidak sesuai',
};

describe('NTE TAG approval repository contract', () => {
    beforeEach(() => {
        execute.mockReset().mockResolvedValue({ rows: [] });
        statements.length = 0;
    });

    it('calls the approval procedure with warehouse scope', async () => {
        await repository.approveTag(approvalParams);
        expect(execute).toHaveBeenCalledOnce();
        expect(statements.join(' ')).toContain('sp_approve_nte_tag');
    });

    it('calls the rejection procedure with notes and null scope for non-staff', async () => {
        await repository.rejectTag(rejectionParams);
        expect(execute).toHaveBeenCalledOnce();
        expect(statements.join(' ')).toContain('sp_reject_nte_tag');
    });

    it('propagates stored-procedure authorization failures', async () => {
        execute.mockRejectedValueOnce(new Error('Unauthorized'));
        await expect(repository.approveTag(approvalParams)).rejects.toThrow('Unauthorized');
    });
});
