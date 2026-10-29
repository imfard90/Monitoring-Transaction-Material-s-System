import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockScrapeLensaDetails = vi.fn();
const mockInsertLog = vi.fn();
const mockExecuteTakeFirst = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/lensa-scraper/lensa-scraper', () => ({
    scrapeLensaDetails: (...args: unknown[]) => mockScrapeLensaDetails(...args),
    scrapeLensaHeaders: vi.fn(),
    scrapeReservation: vi.fn(),
}));

vi.mock('@/lib/repositories/scraper-log.repository', () => ({
    scraperLogRepository: {
        insertLog: (...args: unknown[]) => mockInsertLog(...args),
        getLatestLog: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const mockTransactionExecute = vi.fn();

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: mockExecuteTakeFirst,
            execute: mockExecute,
        })),
        insertInto: vi.fn(() => ({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: '99' }),
        })),
        updateTable: vi.fn(() => ({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue({}),
        })),
        transaction: vi.fn(() => ({
            execute: mockTransactionExecute,
        })),
    },
}));

const { scrapeSingleOutLensaDetail } = await import(
    '@/app/(DashboardLayout)/reference/out-lensa-ref/_actions/out-lensa-commands'
);

describe('scrapeSingleOutLensaDetail Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInsertLog.mockResolvedValue({ id: '1' });
        mockExecute.mockResolvedValue([]);
        mockExecuteTakeFirst.mockResolvedValue(null);
        mockTransactionExecute.mockImplementation(async (callback) => {
            const mockTrx = {
                deleteFrom: vi.fn(() => ({
                    where: vi.fn(() => ({
                        execute: vi.fn().mockResolvedValue({}),
                    })),
                })),
                insertInto: vi.fn(() => ({
                    values: vi.fn(() => ({
                        execute: vi.fn().mockResolvedValue({}),
                    })),
                })),
            };
            return callback(mockTrx);
        });
    });

    it('returns error when reservation_id is empty or invalid', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '1',
            nik: 'ADM01',
            role: 'Admin',
            isStaff: false,
        });

        const res = await scrapeSingleOutLensaDetail('');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Reservation ID');
    });

    it('returns error when user is unauthenticated', async () => {
        mockGetSessionUser.mockResolvedValue(null);

        const res = await scrapeSingleOutLensaDetail('202410150001');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Sesi kedaluwarsa');
    });

    it('returns error when user is Staff', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '2',
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
        });

        const res = await scrapeSingleOutLensaDetail('202410150001');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Hanya non-staff');
    });

    it('scrapes detail and records log when credentials are present', async () => {
        const originalUser = process.env.LENSA_USERNAME;
        const originalPass = process.env.LENSA_PASSWORD;
        process.env.LENSA_USERNAME = 'test_user';
        process.env.LENSA_PASSWORD = 'test_password';

        try {
            mockGetSessionUser.mockResolvedValue({
                id: '1',
                nik: 'ADM01',
                user: { id: '1', email: 'admin@mtms.local' },
                role: 'Admin',
                isStaff: false,
            });

            // Header exists
            mockExecuteTakeFirst.mockResolvedValueOnce({
                id: '88',
                reservation_id: '202410150001',
                gi_number: 'GI-998877',
                nama_gudang: 'SO Gresik',
                mitra: null,
            });

            // Scraper returns detail items
            mockScrapeLensaDetails.mockResolvedValueOnce([
                {
                    header_id: 88,
                    reservation_id: '202410150001',
                    mitra: 'PT MITRA TELEKOM',
                    materials: [
                        {
                            'ID MATERIAL': 'MAT-OUT-01',
                            'NAMA MATERIAL': 'Patchcord SC-UPC 2M',
                            'QTY ACCEPTED': '10',
                        },
                    ],
                },
            ]);

            const res = await scrapeSingleOutLensaDetail('202410150001');

            expect(res.error).toBeUndefined();
            expect(res.success).toBe(true);
            expect(res.data?.reservation_id).toBe('202410150001');
            expect(res.data?.gi_number).toBe('GI-998877');
            expect(res.data?.mitra).toBe('PT MITRA TELEKOM');
            expect(res.data?.materials).toHaveLength(1);
            expect(res.data?.materials[0].material_id).toBe('MAT-OUT-01');
            expect(res.data?.materials[0].qty_approve).toBe('10');

            // Log was saved
            expect(mockInsertLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    scraper_type: 'out_lensa',
                    action: 'manual',
                })
            );
        } finally {
            process.env.LENSA_USERNAME = originalUser;
            process.env.LENSA_PASSWORD = originalPass;
        }
    });
});

