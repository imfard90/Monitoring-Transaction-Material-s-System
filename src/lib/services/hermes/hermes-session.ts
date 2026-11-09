import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { HERMES_CONFIG } from './hermes.config';
import type { HermesChatMessage } from './types';

const HERMES_SESSION_PREFIX = 'hermes:chat:';
const MAX_SAVED_MESSAGES = 40;

function getSessionKey(userNik: string): string {
    return `${HERMES_SESSION_PREFIX}${userNik}`;
}

/**
 * Mengambil riwayat percakapan dari Redis untuk user tertentu.
 * Jika sudah tidak ada aktivitas selama 10 menit (TTL habis), akan mengembalikan array kosong.
 */
export async function getHermesChatHistory(userNik: string): Promise<HermesChatMessage[]> {
    try {
        const raw = await redis.get(getSessionKey(userNik));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return [];
    } catch (err) {
        actionLogger.warn(`[HermesSession] Gagal membaca riwayat sesi untuk user ${userNik}:`, {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Menyimpan riwayat percakapan ke Redis dan memperbarui masa aktif (TTL) 10 menit (600 detik).
 * Setiap ada percakapan baru, jendela 10 menit inaktivitas diperpanjang secara otomatis.
 */
export async function saveHermesChatHistory(
    userNik: string,
    messages: HermesChatMessage[]
): Promise<void> {
    try {
        // Simpan maksimal MAX_SAVED_MESSAGES pesan terakhir untuk menjaga ukuran payload tetap hemat
        const trimmed = messages.slice(-MAX_SAVED_MESSAGES);
        const key = getSessionKey(userNik);
        await redis.set(key, JSON.stringify(trimmed), 'EX', HERMES_CONFIG.sessionTtlSeconds);
    } catch (err) {
        actionLogger.error(
            `[HermesSession] Gagal menyimpan riwayat sesi ke Redis untuk user ${userNik}:`,
            err instanceof Error ? err : new Error(String(err))
        );
    }
}

/**
 * Menghapus sesi percakapan secara eksplisit (misal user logout atau klik tombol 'Bersihkan Chat').
 */
export async function clearHermesChatHistory(userNik: string): Promise<void> {
    try {
        await redis.del(getSessionKey(userNik));
    } catch (err) {
        actionLogger.warn(`[HermesSession] Gagal menghapus sesi untuk user ${userNik}:`, {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

