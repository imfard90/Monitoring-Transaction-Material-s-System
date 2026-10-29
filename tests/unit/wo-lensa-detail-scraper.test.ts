import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockScrapeWOLensaDetails = vi.fn();
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
    scrapeWOLensaDetails: (...args: unknown[]) => mockScrapeWOLensaDetails(...args),
    scrapeWOLensaHeaders: vi.fn(),
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
        transaction: vi.fn(() => ({
            execute: mockTransactionExecute,
        })),
    },
}));

const { scrapeSingleWODetail } = await import(
    '@/app/(DashboardLayout)/reference/wo-lensa-ref/_actions/wo-lensa-scraper'
);

describe('scrapeSingleWODetail Unit Tests', () => {
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

    it('returns error when pemakaian_id is empty or invalid', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '1',
            nik: 'ADM01',
            role: 'Admin',
            isStaff: false,
        });

        const res = await scrapeSingleWODetail('');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Pemakaian ID');
    });

    it('returns error when user is unauthenticated', async () => {
        mockGetSessionUser.mockResolvedValue(null);

        const res = await scrapeSingleWODetail('123456');
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

        const res = await scrapeSingleWODetail('123456');
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
                id: '10',
                pemakaian_id: '123456',
                wo_number: 'WO-123456',
                nama_gudang: 'SO Gresik',
                type: 'assurance',
            });

            // Scraper returns detail items
            mockScrapeWOLensaDetails.mockResolvedValueOnce([
                {
                    id: 10,
                    pemakaian_id: '123456',
                    materials: [
                        {
                            'ID MATERIAL': 'MAT-001',
                            'NAMA MATERIAL': 'Kabel Dropcore 1 Core',
                            SATUAN: 'MTR',
                            'QTY PEMAKAIAN': 150,
                        },
                    ],
                },
            ]);

            const res = await scrapeSingleWODetail('123456');

            expect(res.error).toBeUndefined();
            expect(res.success).toBe(true);
            expect(res.data?.pemakaian_id).toBe('123456');
            expect(res.data?.wo_number).toBe('WO-123456');
            expect(res.data?.materials).toHaveLength(1);
            expect(res.data?.materials[0].material_id).toBe('MAT-001');
            expect(res.data?.materials[0].qty_pemakaian).toBe(150);

            // Log was saved
            expect(mockInsertLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    scraper_type: 'wo_lensa',
                    action: 'manual',
                })
            );
        } finally {
            process.env.LENSA_USERNAME = originalUser;
            process.env.LENSA_PASSWORD = originalPass;
        }
    });
});
