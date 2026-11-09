import { format, parse } from 'date-fns';
import { actionLogger } from '@/lib/logger';

/**
 * Mem-parse string tanggal format Lensa (dd/MM/yyyy) ke Date objek.
 * Pure utility function tanpa dependency browser atau redis.
 */
export function parseLensaDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    try {
        const parsed = parse(dateStr.split(' ')[0], 'dd/MM/yyyy', new Date());
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    } catch (_e) {
        return null;
    }
}

// Cutoff: CUTOFF_MONTH env (YYYY-MM) atau default bulan berjalan.
export const CUTOFF_MONTH_RAW = process.env.CUTOFF_MONTH || format(new Date(), 'yyyy-MM');
const CUTOFF_MONTH_MATCH = /^(\d{4})-(\d{2})$/.exec(CUTOFF_MONTH_RAW);
if (!CUTOFF_MONTH_MATCH) {
    throw new Error(
        `CUTOFF_MONTH="${CUTOFF_MONTH_RAW}" invalid. Expected format: YYYY-MM (e.g. 2026-10)`
    );
}
export const CUTOFF_YEAR = parseInt(CUTOFF_MONTH_MATCH[1], 10);
export const CUTOFF_MONTH = parseInt(CUTOFF_MONTH_MATCH[2], 10);
export const CUTOFF_DATE = new Date(CUTOFF_YEAR, CUTOFF_MONTH - 1, 1);

/**
 * Mengecek apakah tanggal Lensa berada pada atau setelah CUTOFF_DATE.
 * Cutoff berfungsi sebagai batas bawah (floor): data transaksi dari bulan cutoff
 * sampai bulan berjalan saat ini tetap di-scrape, sedangkan bulan sebelumnya diabaikan.
 */
export function isWithinCutoff(dateStr: string | null | undefined): boolean {
    const d = parseLensaDate(dateStr);
    if (!d) return false;
    return d >= CUTOFF_DATE;
}

export function isBeforeCutoff(dateStr: string | null | undefined): boolean {
    const d = parseLensaDate(dateStr);
    if (!d) return true;
    return d < CUTOFF_DATE;
}

export function allBeforeCutoff(items: Array<Record<string, unknown>>): boolean {
    if (items.length === 0) return true;
    return items.every((item) => isBeforeCutoff(item.tanggal_update?.toString() || null));
}

/**
 * Mengecek apakah nomor WO Lensa berstatus REJECTED.
 * Lensa menambahkan suffix/tag "-REJECTED-" pada nomor WO yang ditolak.
 */
export function isRejectedWONumber(woNumber?: string | null): boolean {
    if (!woNumber) return false;
    return woNumber.toUpperCase().includes('REJECTED');
}

/**
 * Menghasilkan daftar prefix WO yang dicari pada Lensa.
 * - Mengembalikan prefix statis umum ('INC', 'SC', 'PDA')
 * - Membentuk daftar bulan dinamis dari cutoffDate hingga bulan berjalan (atau referenceDate)
 *   misal '2610', 'DGPS2610', 'FMC2610', 'AOi42610', 'AOk42610', '2611', dst.
 */
export function getWOPrefixes(
    cutoffDate: Date = CUTOFF_DATE,
    referenceDate?: Date
): string[] {
    const prefixes = new Set<string>();

    // 1. Prefiks tiket statis umum
    prefixes.add('INC');
    prefixes.add('SC');
    prefixes.add('PDA');

    // 2. Daftar bulan dinamis dari cutoffDate hingga bulan berjalan
    const start = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    const endRef = referenceDate ?? new Date();
    const end = start > endRef
        ? start
        : new Date(endRef.getFullYear(), endRef.getMonth(), 1);

    const current = new Date(start);
    while (current <= end) {
        const ym = format(current, 'yyMM');
        prefixes.add(ym); // Pencarian broad: menjaring seluruh jenis tiket (DGPS, FMC, AOi, AOk, PDAk, dll)
        prefixes.add(`DGPS${ym}`);
        prefixes.add(`FMC${ym}`);
        prefixes.add(`AOi4${ym}`);
        prefixes.add(`AOk4${ym}`);
        current.setMonth(current.getMonth() + 1);
    }

    return Array.from(prefixes);
}

/**
 * Memilih kandidat WO terbaik dari hasil array Lensa.
 *
 * Logika pemilihan bertingkat:
 * 1. Jika ada beberapa item dan terdapat campuran item valid & REJECTED,
 *    prioritaskan item yang TIDAK REJECTED (karena Lensa sering menempatkan
 *    rejection baru di urutan teratas walaupun WO aslinya valid).
 * 2. Cocokkan exact match (pemakaian_id atau wo_number).
 * 3. Jika tidak ada exact match, cari substring/partial match.
 * 4. Jika masih tidak ada, ambil item pertama dari kelompok non-rejected.
 * 5. Hanya jika SELURUH item berstatus REJECTED, kembalikan item rejected (agar downstream dapat mengenali penolakan).
 */
export function selectBestCandidateWOLensaHeader(
    items: Array<Record<string, unknown>>,
    cleanQuery: string
): Record<string, unknown> | null {
    if (!items || items.length === 0) return null;

    const normalizedQuery = cleanQuery.trim().toUpperCase();
    const baseQuery = normalizedQuery.replace(/-REJECTED-.*$/i, '').trim();

    // 1. Pisahkan item non-rejected dan rejected
    const nonRejectedItems = items.filter(
        (item) => !isRejectedWONumber(item.wo_number?.toString())
    );

    // Prioritaskan non-rejected jika tersedia
    const candidateItems = nonRejectedItems.length > 0 ? nonRejectedItems : items;

    if (nonRejectedItems.length > 0 && nonRejectedItems.length < items.length) {
        actionLogger.info(
            `[selectBestCandidateWOLensaHeader] Ditemukan ${items.length} hasil untuk '${cleanQuery}' (${nonRejectedItems.length} valid, ${items.length - nonRejectedItems.length} rejected). Memilih item yang tidak rejected.`
        );
    }

    // 2. Exact match: pemakaian_id atau wo_number
    const exactMatch = candidateItems.find((item) => {
        const pId = String(item.pemakaian_id ?? '')
            .trim()
            .toUpperCase();
        const woNo = String(item.wo_number ?? '')
            .trim()
            .toUpperCase();
        return (
            pId === normalizedQuery ||
            woNo === normalizedQuery ||
            (baseQuery !== '' && (woNo === baseQuery || pId === baseQuery))
        );
    });
    if (exactMatch) return exactMatch;

    // 3. Partial / substring match
    const partialMatch = candidateItems.find((item) => {
        const woNo = String(item.wo_number ?? '')
            .trim()
            .toUpperCase();
        const pId = String(item.pemakaian_id ?? '')
            .trim()
            .toUpperCase();
        return (
            woNo.includes(normalizedQuery) ||
            pId.includes(normalizedQuery) ||
            (baseQuery !== '' && (woNo.includes(baseQuery) || pId.includes(baseQuery)))
        );
    });
    if (partialMatch) return partialMatch;

    // 4. Default: kandidat pertama
    return candidateItems[0] ?? null;
}
