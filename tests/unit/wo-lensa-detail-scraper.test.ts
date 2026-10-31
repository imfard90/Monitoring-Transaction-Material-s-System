import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockScrapeWOLensaDetails = vi.fn();
const mockSearchSingleWOLensaHeader = vi.fn();
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
    searchSingleWOLensaHeader: (...args: unknown[]) => mockSearchSingleWOLensaHeader(...args),
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
                        onConflict: vi.fn(() => ({
                            returning: vi.fn(() => ({
                                executeTakeFirst: vi.fn().mockResolvedValue({ id: '99' }),
                            })),
                        })),
                        returning: vi.fn(() => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({ id: '99' }),
                        })),
                    })),
                })),
                selectFrom: vi.fn(() => ({
                    select: vi.fn().mockReturnThis(),
                    selectAll: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue(null),
                })),
                updateTable: vi.fn(() => ({
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue({}),
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

    it('falls back to searchSingleWOLensaHeader when input is a WO Number and saves both header and detail', async () => {
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

            // DB does not have the header yet
            mockExecuteTakeFirst.mockResolvedValueOnce(null);

            // Lensa header search finds the WO header
            mockSearchSingleWOLensaHeader.mockResolvedValueOnce({
                pemakaian_id: '998877',
                wo_number: 'INC13579070',
                nama_gudang: 'WH SUB KARANGPILANG',
                nik_pemakai: '18930453',
                tanggal_update: '2026-10-30 10:00:00',
                formatted_date: '2026-10-30',
                type: 'assurance',
                wbs: 'WBS-01',
                gi_number: 'GI-12345',
            });

            // Detail scraping with resolvedPemakaianId returns materials
            mockScrapeWOLensaDetails.mockResolvedValueOnce([
                {
                    id: 0,
                    pemakaian_id: '998877',
                    materials: [
                        {
                            'ID MATERIAL': '101234',
                            'NAMA MATERIAL': 'Patchcord SC-UPC',
                            SATUAN: 'PCS',
                            'QTY PEMAKAIAN': 2,
                        },
                    ],
                },
            ]);

            const res = await scrapeSingleWODetail('INC13579070');

            expect(mockSearchSingleWOLensaHeader).toHaveBeenCalledWith(
                'INC13579070',
                'test_user',
                'test_password'
            );
            expect(mockScrapeWOLensaDetails).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        pemakaian_id: '998877',
                        type: 'assurance',
                    }),
                ]),
                'test_user',
                'test_password'
            );
            expect(res.success).toBe(true);
            expect(res.data?.pemakaian_id).toBe('998877');
            expect(res.data?.wo_number).toBe('INC13579070');
            expect(res.data?.nama_gudang).toBe('WH SUB KARANGPILANG');
            expect(res.data?.materials).toHaveLength(1);
            expect(res.data?.materials[0].material_id).toBe('101234');
            expect(mockTransactionExecute).toHaveBeenCalled();
        } finally {
            process.env.LENSA_USERNAME = originalUser;
            process.env.LENSA_PASSWORD = originalPass;
        }
    });

    it('falls back to searchSingleWOLensaHeader when numeric ID direct detail returns 0 materials', async () => {
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

            // Header not in DB
            mockExecuteTakeFirst.mockResolvedValueOnce(null);

            // First direct detail scrape returns empty materials
            mockScrapeWOLensaDetails.mockResolvedValueOnce([
                {
                    id: 0,
                    pemakaian_id: '554433',
                    materials: [],
                },
            ]);

            // Fallback search finds the correct record
            mockSearchSingleWOLensaHeader.mockResolvedValueOnce({
                pemakaian_id: '554433',
                wo_number: 'SC13610307',
                nama_gudang: 'WH SUB TUBAN',
                nik_pemakai: '19001234',
                tanggal_update: '2026-10-31 09:00:00',
                formatted_date: '2026-10-31',
                type: 'provisioning',
                wbs: null,
                gi_number: null,
            });

            // Second detail scrape with fallback returns materials
            mockScrapeWOLensaDetails.mockResolvedValueOnce([
                {
                    id: 0,
                    pemakaian_id: '554433',
                    materials: [
                        {
                            'ID MATERIAL': '201999',
                            'NAMA MATERIAL': 'Roset Optik 1 Core',
                            SATUAN: 'PCS',
                            'QTY PEMAKAIAN': 1,
                        },
                    ],
                },
            ]);

            const res = await scrapeSingleWODetail('554433');

            expect(mockSearchSingleWOLensaHeader).toHaveBeenCalledWith(
                '554433',
                'test_user',
                'test_password'
            );
            expect(res.success).toBe(true);
            expect(res.data?.pemakaian_id).toBe('554433');
            expect(res.data?.wo_number).toBe('SC13610307');
            expect(res.data?.type).toBe('provisioning');
            expect(res.data?.materials).toHaveLength(1);
        } finally {
            process.env.LENSA_USERNAME = originalUser;
            process.env.LENSA_PASSWORD = originalPass;
        }
    });

    it('enriches existing header when scraping by WO Number and resolved pemakaian_id already exists in DB', async () => {
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

            // Initial lookup with WO number returns null (wo_number not yet recorded in DB)
            // But second lookup by resolvedPemakaianId returns existing header record (e.g. id: '2687')
            mockExecuteTakeFirst
                .mockResolvedValueOnce(null) // 1. Initial db lookup by '1-95602227495' -> null
                .mockResolvedValueOnce({
                    id: '2687',
                    pemakaian_id: '100257706',
                    wo_number: null,
                    nama_gudang: null,
                }); // 2. Second db lookup by resolvedPemakaianId '100257706' -> existing row!

            // Lensa search returns header metadata for '1-95602227495'
            mockSearchSingleWOLensaHeader.mockResolvedValueOnce({
                pemakaian_id: '100257706',
                wo_number: '1-95602227495',
                nama_gudang: 'WH SUB TUBAN',
                nik_pemakai: '19001234',
                tanggal_update: '2026-10-31 09:00:00',
                formatted_date: '2026-10-31',
                type: 'assurance',
                wbs: null,
                gi_number: null,
            });

            // Detail scraping with resolvedPemakaianId returns materials
            mockScrapeWOLensaDetails.mockResolvedValueOnce([
                {
                    id: 0,
                    pemakaian_id: '100257706',
                    materials: [
                        {
                            'ID MATERIAL': 'S-CLAMP',
                            'NAMA MATERIAL': 'S-Clamp-Springer',
                            SATUAN: 'Pcs',
                            'QTY PEMAKAIAN': 2,
                        },
                    ],
                },
            ]);

            const res = await scrapeSingleWODetail('1-95602227495');

            expect(mockSearchSingleWOLensaHeader).toHaveBeenCalledWith(
                '1-95602227495',
                'test_user',
                'test_password'
            );
            expect(res.success).toBe(true);
            expect(res.data?.pemakaian_id).toBe('100257706');
            expect(res.data?.wo_number).toBe('1-95602227495');
            expect(res.data?.nama_gudang).toBe('WH SUB TUBAN');
            expect(res.data?.materials).toHaveLength(1);
        } finally {
            process.env.LENSA_USERNAME = originalUser;
            process.env.LENSA_PASSWORD = originalPass;
        }
    });
});
