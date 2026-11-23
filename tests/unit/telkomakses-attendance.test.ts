import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redis } from '@/lib/redis';
import {
    getAttendanceToday,
    getSecondsUntilEndOfDayWib,
    getTodayWibDateString,
} from '@/lib/services/telkomakses-attendance.service';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Telkom Akses Attendance Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe('getTodayWibDateString', () => {
        it('formats date to YYYY-MM-DD in Asia/Jakarta', () => {
            // 2026-11-23 04:00:00 UTC = 11:00:00 WIB
            const date = new Date('2026-11-23T04:00:00Z');
            const result = getTodayWibDateString(date);
            expect(result).toBe('2026-11-23');
        });
    });

    describe('getSecondsUntilEndOfDayWib', () => {
        it('calculates remaining seconds until 23:59:59 WIB', () => {
            // 2026-11-23 15:00:00 UTC = 22:00:00 WIB (remaining: 2 hours = 7200s)
            const date = new Date('2026-11-23T15:00:00Z');
            const remaining = getSecondsUntilEndOfDayWib(date);
            expect(remaining).toBeGreaterThanOrEqual(7100);
            expect(remaining).toBeLessThanOrEqual(7200);
        });

        it('guarantees at least 60 seconds near midnight', () => {
            // 2026-11-23 16:59:58 UTC = 23:59:58 WIB
            const date = new Date('2026-11-23T16:59:58Z');
            const remaining = getSecondsUntilEndOfDayWib(date);
            expect(remaining).toBeGreaterThanOrEqual(60);
        });
    });

    describe('getAttendanceToday', () => {
        it('returns not checked in if NIK is empty or missing', async () => {
            const result = await getAttendanceToday('');
            expect(result.hasCheckedIn).toBe(false);
            expect(result.source).toBe('error');
            expect(result.message).toBe('Hari ini anda belum absen masuk');
        });

        it('returns cached attendance data from Redis if available', async () => {
            const mockCached = {
                hasCheckedIn: true,
                checkInTime: '07:27',
                rawTime: '07:27:45',
                presentDate: '23/11/2026',
                outTime: null,
                message: 'Anda sudah absen masuk pukul 07:27',
                source: 'api',
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockCached));

            const result = await getAttendanceToday('906627');

            expect(result.hasCheckedIn).toBe(true);
            expect(result.checkInTime).toBe('07:27');
            expect(result.source).toBe('cache');
            expect(result.message).toBe('Anda sudah absen masuk pukul 07:27');
            expect(redis.get).toHaveBeenCalledWith(
                expect.stringContaining('telkomakses:absen:906627:')
            );
        });

        it('fetches from internal API, extracts clock-in time, and caches until 23:59 WIB', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(redis.set).mockResolvedValue('OK');

            const mockApiResponse = {
                status: true,
                message: 'Akses Diperbolekan',
                data: [
                    {
                        present_date: '23/11/2026',
                        in_dtm: '08:15:30',
                        out_dtm: null,
                        keterangan: 'm',
                    },
                ],
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockApiResponse),
            } as any);

            const result = await getAttendanceToday('906627');

            expect(result.hasCheckedIn).toBe(true);
            expect(result.checkInTime).toBe('08:15');
            expect(result.rawTime).toBe('08:15:30');
            expect(result.message).toBe('Anda sudah absen masuk pukul 08:15');
            expect(result.source).toBe('api');

            // Caching call verification
            expect(redis.set).toHaveBeenCalledWith(
                expect.stringContaining('telkomakses:absen:906627:'),
                expect.stringContaining('"checkInTime":"08:15"'),
                'EX',
                expect.any(Number)
            );
        });

        it('returns not checked in if API reports no attendance, and caches with short TTL', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(redis.set).mockResolvedValue('OK');

            const mockApiResponse = {
                status: true,
                message: 'Akses Diperbolekan',
                data: [],
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockApiResponse),
            } as any);

            const result = await getAttendanceToday('906627');

            expect(result.hasCheckedIn).toBe(false);
            expect(result.message).toBe('Hari ini anda belum absen masuk');
            expect(result.source).toBe('api');

            // Cached with short TTL (300 seconds)
            expect(redis.set).toHaveBeenCalledWith(
                expect.stringContaining('telkomakses:absen:906627:'),
                expect.stringContaining('"hasCheckedIn":false'),
                'EX',
                300
            );
        });

        it('handles network failure gracefully without throwing', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            global.fetch = vi.fn().mockRejectedValue(new Error('Connection timeout'));

            const result = await getAttendanceToday('906627');

            expect(result.hasCheckedIn).toBe(false);
            expect(result.message).toBe('Hari ini anda belum absen masuk');
            expect(result.source).toBe('error');
        });
    });
});
