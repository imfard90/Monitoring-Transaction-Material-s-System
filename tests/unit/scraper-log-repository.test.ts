import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScraperLogRepository } from '@/lib/repositories/scraper-log.repository';

describe('scraperLogRepository', () => {
    let mockInsertInto: ReturnType<typeof vi.fn>;
    let mockSelectFrom: ReturnType<typeof vi.fn>;
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('inserts log and returns formatted ScraperLog object', async () => {
        const mockRow = {
            id: 1,
            scraper_type: 'out_lensa',
            action: 'system',
            resume_result: 'Sukses 10 data baru',
            timestamp: new Date('2026-10-29T06:30:00Z'),
        };

        const mockExecuteTakeFirstOrThrow = vi.fn().mockResolvedValue(mockRow);
        const mockReturningAll = vi.fn().mockReturnValue({
            executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
        });
        const mockValues = vi.fn().mockReturnValue({
            returningAll: mockReturningAll,
        });
        mockInsertInto = vi.fn().mockReturnValue({
            values: mockValues,
        });

        mockDb = {
            insertInto: mockInsertInto,
        };

        const repo = createScraperLogRepository(mockDb);
        const result = await repo.insertLog({
            scraper_type: 'out_lensa',
            action: 'system',
            resume_result: 'Sukses 10 data baru',
        });

        expect(mockInsertInto).toHaveBeenCalledWith('inventory.scraper_cronjob_log');
        expect(mockValues).toHaveBeenCalledWith(
            expect.objectContaining({
                scraper_type: 'out_lensa',
                action: 'system',
                resume_result: 'Sukses 10 data baru',
            })
        );
        expect(result.id).toBe(1);
        expect(result.scraper_type).toBe('out_lensa');
        expect(result.action).toBe('system');
        expect(result.resume_result).toBe('Sukses 10 data baru');
        expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('retrieves the latest log by scraper_type', async () => {
        const mockRow = {
            id: 42,
            scraper_type: 'wo_lensa',
            action: 'manual',
            resume_result: 'Sukses 5 data WO baru',
            timestamp: new Date('2026-10-29T10:00:00Z'),
        };

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(mockRow);
        const mockLimit = vi.fn().mockReturnValue({
            executeTakeFirst: mockExecuteTakeFirst,
        });
        const mockOrderBy = vi.fn().mockReturnValue({
            limit: mockLimit,
        });
        const mockWhere = vi.fn().mockReturnValue({
            orderBy: mockOrderBy,
        });
        const mockSelectAll = vi.fn().mockReturnValue({
            where: mockWhere,
        });
        mockSelectFrom = vi.fn().mockReturnValue({
            selectAll: mockSelectAll,
        });

        mockDb = {
            selectFrom: mockSelectFrom,
        };

        const repo = createScraperLogRepository(mockDb);
        const result = await repo.getLatestLog('wo_lensa');

        expect(mockSelectFrom).toHaveBeenCalledWith('inventory.scraper_cronjob_log');
        expect(mockWhere).toHaveBeenCalledWith('scraper_type', '=', 'wo_lensa');
        expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
        expect(mockLimit).toHaveBeenCalledWith(1);
        expect(result).not.toBeNull();
        expect(result?.id).toBe(42);
        expect(result?.scraper_type).toBe('wo_lensa');
        expect(result?.action).toBe('manual');
        expect(result?.resume_result).toBe('Sukses 5 data WO baru');
    });

    it('returns null when no log exists for the given scraper_type', async () => {
        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(undefined);
        const mockLimit = vi.fn().mockReturnValue({
            executeTakeFirst: mockExecuteTakeFirst,
        });
        const mockOrderBy = vi.fn().mockReturnValue({
            limit: mockLimit,
        });
        const mockWhere = vi.fn().mockReturnValue({
            orderBy: mockOrderBy,
        });
        const mockSelectAll = vi.fn().mockReturnValue({
            where: mockWhere,
        });
        mockSelectFrom = vi.fn().mockReturnValue({
            selectAll: mockSelectAll,
        });

        mockDb = {
            selectFrom: mockSelectFrom,
        };

        const repo = createScraperLogRepository(mockDb);
        const result = await repo.getLatestLog('stock_teknisi');

        expect(result).toBeNull();
    });
});
