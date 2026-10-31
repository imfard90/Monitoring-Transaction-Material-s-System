import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsertLog = vi.fn();
const mockScrapeWOLensaHeadersByNik = vi.fn();
const mockScrapeWOLensaDetails = vi.fn();
const mockTransactionExecute = vi.fn();
const mockDbExecute = vi.fn();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/repositories/scraper-log.repository', () => ({
    scraperLogRepository: {
        insertLog: (...args: unknown[]) => mockInsertLog(...args),
    },
}));

vi.mock('@/lib/services/lensa-crypto', () => ({
    asyncPool: async <T, R>(_limit: number, array: T[], iteratorFn: (item: T) => Promise<R>) => {
        const ret: R[] = [];
        for (const item of array) {
            ret.push(await iteratorFn(item));
        }
        return ret;
    },
    decryptLensaPassword: (pass: string) => `decrypted_${pass}`,
}));

vi.mock('@/lib/lensa-scraper/lensa-scraper', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        scrapeWOLensaHeadersByNik: (...args: unknown[]) => mockScrapeWOLensaHeadersByNik(...args),
        scrapeWOLensaDetails: (...args: unknown[]) => mockScrapeWOLensaDetails(...args),
    };
});

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn((table: string) => ({
            select: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: (...args: unknown[]) => mockDbExecute(table, ...args),
        })),
        transaction: vi.fn(() => ({
            execute: mockTransactionExecute,
        })),
    },
}));

describe('scrapeWOLensaHeadersByNik Unit Tests', () => {
    it('returns empty array when clean niks list is empty', async () => {
        const { scrapeWOLensaHeadersByNik } = await import('@/lib/lensa-scraper/lensa-wo-scraper');
        const result = await scrapeWOLensaHeadersByNik([], [], 'test_user', 'test_pass');
        expect(result).toEqual([]);
    });

    it('throws error when credentials are not provided and env is empty', async () => {
        const originalUser = process.env.LENSA_USERNAME;
        const originalPass = process.env.LENSA_PASSWORD;
        delete process.env.LENSA_USERNAME;
        delete process.env.LENSA_PASSWORD;

        const { scrapeWOLensaHeadersByNik } = await import('@/lib/lensa-scraper/lensa-wo-scraper');
        await expect(scrapeWOLensaHeadersByNik(['25000123'], [], '', '')).rejects.toThrow(
            'LENSA_USERNAME or LENSA_PASSWORD is not set'
        );

        if (originalUser) process.env.LENSA_USERNAME = originalUser;
        if (originalPass) process.env.LENSA_PASSWORD = originalPass;
    });
});

describe('executeNightlyWOLensaScrapingByNik Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInsertLog.mockResolvedValue({ id: '1' });
        mockTransactionExecute.mockImplementation(async (cb) => {
            const trx = {
                insertInto: vi.fn(() => ({
                    values: vi.fn(() => ({
                        onConflict: vi.fn(() => ({
                            execute: vi.fn().mockResolvedValue({}),
                        })),
                        execute: vi.fn().mockResolvedValue({}),
                    })),
                })),
            };
            return cb(trx);
        });
    });

    it('returns failure outcome when no warehouses have valid PIC Lensa accounts', async () => {
        mockDbExecute.mockImplementation(async (table: string) => {
            if (table === 'inventory.mas_wh') {
                return [{ id: 1, name: 'SO Karangpilang', pic_1: '99999999', pic_2: null }];
            }
            if (table.startsWith('auth.user')) {
                return []; // No user with Lensa account
            }
            if (table === 'hr.technicians') {
                return [{ nik: '25000123', wh_id: 1 }];
            }
            return [];
        });

        const { executeNightlyWOLensaScrapingByNik } = await import(
            '@/lib/services/lensa-wo-service'
        );

        const outcome = await executeNightlyWOLensaScrapingByNik('system');
        expect(outcome.success).toBe(false);
        expect(outcome.message).toContain('Tidak ada gudang dengan PIC Lensa');
    });

    it('successfully scrapes, filters rejected, inserts new headers, and logs execution', async () => {
        mockScrapeWOLensaHeadersByNik.mockResolvedValue([
            {
                pemakaian_id: '990011',
                wo_number: '1-95602227495',
                nama_gudang: 'SO Karangpilang',
                nik_pemakai: '25000123',
                tanggal_update: '2026-10-30 10:00:00',
                formatted_date: '2026-10-30',
                type: 'provisioning',
                wbs: 'WBS-01',
                gi_number: 'GI-12345',
            },
            {
                pemakaian_id: '990012',
                wo_number: 'REJECTED-WO-01',
                nama_gudang: 'SO Karangpilang',
                nik_pemakai: '25000123',
                tanggal_update: '2026-10-30 10:00:00',
                formatted_date: '2026-10-30',
                type: 'assurance',
                wbs: null,
                gi_number: null,
            },
        ]);

        mockDbExecute.mockImplementation(async (table: string) => {
            if (table === 'inventory.mas_wh') {
                return [
                    {
                        id: 1,
                        name: 'SO Karangpilang',
                        pic_1: '21980128',
                        pic_2: null,
                    },
                ];
            }
            if (table.startsWith('auth.user')) {
                return [
                    {
                        id: 'u1',
                        nik: '21980128',
                        lensa_acount: {
                            username: 'karangpilang_pic',
                            password: 'secret_password',
                        },
                    },
                ];
            }
            if (table === 'hr.technicians') {
                return [{ nik: '25000123', wh_id: 1 }];
            }
            if (table === 'inventory.wo_lensa_header') {
                return [];
            }
            if (table.startsWith('inventory.wo_lensa_header as h')) {
                return []; // No missing details
            }
            if (table === 'inventory.rekon_used_header') {
                return [];
            }
            return [];
        });

        const { executeNightlyWOLensaScrapingByNik } = await import(
            '@/lib/services/lensa-wo-service'
        );

        const outcome = await executeNightlyWOLensaScrapingByNik('system');

        expect(outcome.success).toBe(true);
        expect(outcome.newCount).toBe(1); // 1 valid header (REJECTED was filtered out)
        expect(mockInsertLog).toHaveBeenCalledWith(
            expect.objectContaining({
                scraper_type: 'wo_lensa',
                action: 'system',
                resume_result: expect.stringContaining('Sukses 1 data WO baru (Sweep Malam NIK)'),
            })
        );
    });
});
