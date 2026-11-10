import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearCronRunning,
    CRON_RUNNING_KEY,
    getCronRunningStatus,
    isCronRunning,
    setCronRunning,
} from '@/lib/services/cron-guard';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: (...args: unknown[]) => mockRedisGet(...args),
        set: (...args: unknown[]) => mockRedisSet(...args),
        del: (...args: unknown[]) => mockRedisDel(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('cron-guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sets cron running status with TTL in Redis', async () => {
        mockRedisSet.mockResolvedValue('OK');

        await setCronRunning('out_lensa', 'Out Lensa Cron');

        expect(mockRedisSet).toHaveBeenCalledWith(
            CRON_RUNNING_KEY,
            expect.stringContaining('out_lensa'),
            'EX',
            1800
        );
    });

    it('clears cron running status in Redis', async () => {
        mockRedisDel.mockResolvedValue(1);

        await clearCronRunning();

        expect(mockRedisDel).toHaveBeenCalledWith(CRON_RUNNING_KEY);
    });

    it('returns parsed status when cron is running', async () => {
        mockRedisGet.mockResolvedValue(
            JSON.stringify({
                type: 'bulk_stock',
                label: 'Bulk Stock Teknisi',
                startedAt: 123456789,
            })
        );

        const status = await getCronRunningStatus();
        expect(status).not.toBeNull();
        expect(status?.type).toBe('bulk_stock');
        expect(status?.label).toBe('Bulk Stock Teknisi');

        const running = await isCronRunning();
        expect(running).toBe(true);
    });

    it('returns null and false when no cron is running', async () => {
        mockRedisGet.mockResolvedValue(null);

        const status = await getCronRunningStatus();
        expect(status).toBeNull();

        const running = await isCronRunning();
        expect(running).toBe(false);
    });
});

