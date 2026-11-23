import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export interface AttendanceTodayResult {
    hasCheckedIn: boolean;
    checkInTime?: string; // Format: "hh:mm" (e.g. "07:27")
    rawTime?: string; // Format: "hh:mm:ss" (e.g. "07:27:45")
    presentDate?: string; // Format: "DD/MM/YYYY"
    outTime?: string | null;
    message: string;
    source: 'cache' | 'api' | 'error';
}

/**
 * Mendapatkan string tanggal hari ini dalam format YYYY-MM-DD
 * menggunakan zona waktu Indonesia Barat (Asia/Jakarta).
 */
export function getTodayWibDateString(now = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(now); // "YYYY-MM-DD"
}

/**
 * Menghitung sisa detik hingga pukul 23:59:59 WIB pada hari berjalan.
 * Digunakan untuk TTL cache Redis absensi sampai akhir hari.
 */
export function getSecondsUntilEndOfDayWib(now = new Date()): number {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) =>
        Number.parseInt(parts.find((p) => p.type === type)?.value || '0', 10);

    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    const secondsElapsedToday = hour * 3600 + minute * 60 + second;
    const totalSecondsInDay = 24 * 3600;
    const remainingSeconds = totalSecondsInDay - secondsElapsedToday;

    // Minimum 60 detik jika mendekati tengah malam
    return Math.max(60, remainingSeconds);
}

const TELKOMAKSES_ABSEN_BASE_URL =
    process.env.TELKOMAKSES_ABSEN_URL || 'http://203.130.242.238:3004';

/**
 * Mengambil informasi absensi masuk hari ini untuk NIK karyawan tertentu.
 * Memanfaatkan Redis cache dengan TTL hingga 23:59:59 WIB (jika sudah absen)
 * atau TTL 5 menit (jika belum absen, agar update saat karyawan baru clock-in).
 */
export async function getAttendanceToday(nik?: string | null): Promise<AttendanceTodayResult> {
    if (!nik || !nik.trim()) {
        return {
            hasCheckedIn: false,
            message: 'Hari ini anda belum absen masuk',
            source: 'error',
        };
    }

    const cleanNik = nik.trim();
    const todayStr = getTodayWibDateString();
    const cacheKey = `telkomakses:absen:${cleanNik}:${todayStr}`;

    // 1. Cek Redis Cache
    try {
        const cachedRaw = await redis.get(cacheKey);
        if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw) as AttendanceTodayResult;
            return {
                ...parsed,
                source: 'cache',
            };
        }
    } catch (cacheErr) {
        actionLogger.warn(
            `[AttendanceService] Redis read failed for ${cleanNik}: ${
                cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
            }`
        );
    }

    // 2. Fetch ke API Internal Telkom Akses (Port 3004)
    const targetUrl = `${TELKOMAKSES_ABSEN_BASE_URL}/report_absen/${cleanNik}/${todayStr}/${todayStr}/Mobile`;

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: AbortSignal.timeout(4000), // Timeout 4 detik agar dashboard tetap cepat
        });

        if (!response.ok) {
            actionLogger.warn(
                `[AttendanceService] HTTP ${response.status} from ${targetUrl} for NIK ${cleanNik}`
            );
            return {
                hasCheckedIn: false,
                message: 'Hari ini anda belum absen masuk',
                source: 'error',
            };
        }

        const data = (await response.json()) as {
            status?: boolean;
            data?: Array<{
                present_date?: string;
                in_dtm?: string;
                out_dtm?: string | null;
                keterangan?: string;
            }>;
        };

        const records = Array.isArray(data?.data) ? data.data : [];
        // Keterangan 'm' menandakan kehadiran Masuk
        const masukRecord = records.find(
            (r) =>
                r.keterangan?.toLowerCase() === 'm' ||
                (typeof r.in_dtm === 'string' && r.in_dtm.length > 0)
        );

        if (masukRecord && masukRecord.in_dtm) {
            // Potong detik: "07:27:45" -> "07:27"
            const rawTime = masukRecord.in_dtm.trim();
            const checkInTime = rawTime.slice(0, 5);
            const result: AttendanceTodayResult = {
                hasCheckedIn: true,
                checkInTime,
                rawTime,
                presentDate: masukRecord.present_date,
                outTime: masukRecord.out_dtm,
                message: `Anda sudah absen masuk pukul ${checkInTime}`,
                source: 'api',
            };

            // Simpan sementara sampai pukul 23:59:59 WIB hari ini
            try {
                const ttlSeconds = getSecondsUntilEndOfDayWib();
                await redis.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
            } catch (setErr) {
                actionLogger.warn(
                    `[AttendanceService] Redis write failed for ${cleanNik}: ${
                        setErr instanceof Error ? setErr.message : String(setErr)
                    }`
                );
            }

            return result;
        }

        // Belum absen masuk
        const notCheckedInResult: AttendanceTodayResult = {
            hasCheckedIn: false,
            message: 'Hari ini anda belum absen masuk',
            source: 'api',
        };

        // Cache sementara 300 detik (5 menit) agar saat karyawan baru absen, status lekas terupdate
        try {
            await redis.set(cacheKey, JSON.stringify(notCheckedInResult), 'EX', 300);
        } catch {
            // Ignore redis set error
        }

        return notCheckedInResult;
    } catch (err) {
        actionLogger.warn(
            `[AttendanceService] Request failed for NIK ${cleanNik}: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
        return {
            hasCheckedIn: false,
            message: 'Hari ini anda belum absen masuk',
            source: 'error',
        };
    }
}
