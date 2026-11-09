import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { actionLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import {
    clearHermesChatHistory,
    getHermesChatHistory,
    handleStockQuerySkill,
    type HermesChatMessage,
    saveHermesChatHistory,
    sendChatMessageToHermes,
} from '@/lib/services/hermes';

const postMessageSchema = z.object({
    message: z
        .string()
        .refine((val) => val.trim().length > 0, { message: 'Pesan tidak boleh kosong' })
        .refine((val) => val.trim().length <= 4000, {
            message: 'Pesan terlalu panjang (maksimal 4000 karakter)',
        })
        .transform((val) => val.trim()),
});

/**
 * GET /api/chat-agent
 * Mengambil riwayat percakapan pengguna yang tersimpan di Redis.
 * Otomatis kosong jika inaktif lebih dari 10 menit.
 */
export async function GET() {
    try {
        const user = await getSessionUser();
        if (!user?.nik) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const history = await getHermesChatHistory(user.nik);
        return NextResponse.json({
            success: true,
            messages: history,
        });
    } catch (err: unknown) {
        actionLogger.error(
            '[GET /api/chat-agent] Gagal mengambil riwayat obrolan:',
            err instanceof Error ? err : new Error(String(err))
        );
        return NextResponse.json(
            { success: false, error: 'Gagal mengambil riwayat obrolan' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/chat-agent
 * Mengirim pesan baru ke Hermes Agent, memperbarui riwayat obrolan di Redis,
 * dan memperpanjang masa aktif sesi (10 menit).
 */
export async function POST(request: Request) {
    try {
        const user = await getSessionUser();
        if (!user?.nik) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limiting: batasi 20 pesan per menit per user
        const { success: rateOk } = await rateLimit(`chat-agent:${user.nik}`, 20, 60);
        if (!rateOk) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Terlalu banyak permintaan pesan. Mohon tunggu beberapa detik sebelum mengirim lagi.',
                },
                { status: 429 }
            );
        }

        const body: unknown = await request.json().catch(() => null);
        const parsed = postMessageSchema.safeParse(body);
        if (!parsed.success) {
            const firstError = parsed.error.issues?.[0]?.message || 'Format pesan tidak valid';
            return NextResponse.json({ success: false, error: firstError }, { status: 400 });
        }

        const userText = parsed.data.message;

        // 1. Ambil riwayat percakapan sebelumnya
        const existingHistory = await getHermesChatHistory(user.nik);

        const newUserMessage: HermesChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: userText,
            createdAt: new Date().toISOString(),
        };

        // 2. Hubungi Hermes Agent (dengan kemampuan Tool Calling native)
        let assistantMessage: HermesChatMessage;
        try {
            assistantMessage = await sendChatMessageToHermes(userText, existingHistory);
        } catch (hermesErr) {
            actionLogger.warn(
                '[POST /api/chat-agent] Hermes agent gagal atau offline, mencoba fallback skill offline:',
                hermesErr instanceof Error ? hermesErr : new Error(String(hermesErr))
            );
            const stockSkillResult = await handleStockQuerySkill(userText, existingHistory);
            if (stockSkillResult.handled && stockSkillResult.message) {
                assistantMessage = stockSkillResult.message;
            } else {
                throw hermesErr;
            }
        }

        // 4. Simpan riwayat yang diperbarui ke Redis (otomatis perpanjang masa aktif 10 menit)
        const updatedHistory = [...existingHistory, newUserMessage, assistantMessage];
        await saveHermesChatHistory(user.nik, updatedHistory);

        return NextResponse.json({
            success: true,
            message: assistantMessage,
            messages: updatedHistory,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
        actionLogger.error(
            '[POST /api/chat-agent] Gagal memproses pesan chat:',
            err instanceof Error ? err : new Error(String(err))
        );
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/chat-agent
 * Menghapus seluruh riwayat percakapan pengguna di Redis (Reset Session).
 */
export async function DELETE() {
    try {
        const user = await getSessionUser();
        if (!user?.nik) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await clearHermesChatHistory(user.nik);
        return NextResponse.json({
            success: true,
            message: 'Riwayat percakapan berhasil dibersihkan',
        });
    } catch (err: unknown) {
        actionLogger.error(
            '[DELETE /api/chat-agent] Gagal menghapus riwayat obrolan:',
            err instanceof Error ? err : new Error(String(err))
        );
        return NextResponse.json(
            { success: false, error: 'Gagal membersihkan riwayat obrolan' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
