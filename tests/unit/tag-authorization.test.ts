import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockDbExecuteTakeFirst = vi.fn();
const mockSqlExecute = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/security/idempotency', () => ({
    checkAndStoreIdempotency: (key: string, data: any, callback: any) =>
        mockCheckAndStoreIdempotency(key, data, callback),
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => ({
            leftJoin: () => ({
                leftJoin: () => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: mockDbExecuteTakeFirst,
                        }),
                    }),
                }),
            }),
        }),
    },
}));

vi.mock('kysely', () => {
    const fakeSql = (strings: TemplateStringsArray, ...values: any[]) => ({
        strings,
        values,
        execute: mockSqlExecute,
    });
    return {
        sql: fakeSql,
    };
});

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

const { updateTag } = await import('@/app/(DashboardLayout)/apps/inout-tag/_actions/tag-commands');

describe('updateTag authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckAndStoreIdempotency.mockImplementation((key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
        mockSqlExecute.mockResolvedValue({ rows: [] });
    });

    it('denies Staff attempting to perform request action', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: '21980128',
            role: 'Staff',
            warehouseIds: [1],
            isStaff: true,
        });

        const result = await updateTag({
            headerId: 101,
            actionType: 'request',
            actionId: 'REQ-123',
            items: [{ designator_id: 166, qty: 1 }],
            idemKey: 'idem-test-1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Staff tidak dapat melakukan Request ID');
    });

    it('denies Staff if not PIC of receiving warehouse when accepting tag', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: '99999999', // Different NIK
            role: 'Staff',
            warehouseIds: [99],
            isStaff: true,
        });

        mockDbExecuteTakeFirst.mockResolvedValue({
            from_wh_id: 6,
            to_wh_id: 1,
            from_pic_1: null,
            from_pic_2: null,
            to_pic_1: '21980128',
            to_pic_2: null,
        });

        const result = await updateTag({
            headerId: 101,
            actionType: 'accept',
            actionId: 'ACC-123',
            items: [{ designator_id: 166, qty: 1 }],
            idemKey: 'idem-test-2',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('hanya PIC gudang penerima');
    });

    it('permits Karangpilang PIC (21980128) to submit Accept ID for receiving warehouse (WH 1)', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: '21980128',
            role: 'Staff',
            warehouseIds: [1],
            isStaff: true,
        });

        mockDbExecuteTakeFirst.mockResolvedValue({
            from_wh_id: 6,
            to_wh_id: 1,
            from_pic_1: null,
            from_pic_2: null,
            to_pic_1: '21980128',
            to_pic_2: null,
        });

        const result = await updateTag({
            headerId: 101,
            actionType: 'accept',
            actionId: 'ACC-26100082-OK',
            items: [{ designator_id: 166, qty: 1 }],
            idemKey: 'idem-test-3',
        });

        expect(result.success).toBe(true);
        expect(mockSqlExecute).toHaveBeenCalled();
    });

    it('permits Admin user to update any action without restriction', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'ADM001',
            role: 'Administrator',
            warehouseIds: [],
            isStaff: false,
        });

        const result = await updateTag({
            headerId: 101,
            actionType: 'accept',
            actionId: 'ACC-ADMIN',
            items: [{ designator_id: 166, qty: 1 }],
            idemKey: 'idem-test-4',
        });

        expect(result.success).toBe(true);
    });
});
