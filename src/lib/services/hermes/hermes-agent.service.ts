import { actionLogger } from '@/lib/logger';
import { HERMES_CONFIG } from './hermes.config';
import type {
    HermesChatCompletionRequest,
    HermesChatCompletionResponse,
    HermesChatMessage,
} from './types';

/**
 * Membersihkan tag dan konten reasoning (seperti `<think>...</think>`)
 * agar teks penalaran internal model tidak diteruskan ke antarmuka pengguna.
 */
export function stripReasoningContent(text: string): string {
    if (!text) return '';
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```thinking[\s\S]*?```/gi, '')
        .trim();
}

/**
 * Mengirim pesan ke agent Hermes dan mengembalikan pesan balasan yang telah disanitasi.
 */
export async function sendChatMessageToHermes(
    userMessage: string,
    history: HermesChatMessage[] = []
): Promise<HermesChatMessage> {
    const cleanUserText = userMessage.trim();
    if (!cleanUserText) {
        throw new Error('Pesan tidak boleh kosong.');
    }

    // Bangun daftar pesan OpenAI-compatible: System Prompt -> Riwayat Percakapan -> Pesan Baru
    const outboundMessages: Array<{ role: string; content: string }> = [
        {
            role: 'system',
            content: HERMES_CONFIG.systemPrompt,
        },
    ];

    for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            outboundMessages.push({
                role: msg.role,
                content: msg.content,
            });
        }
    }

    outboundMessages.push({
        role: 'user',
        content: cleanUserText,
    });

    const payload: HermesChatCompletionRequest = {
        model: HERMES_CONFIG.model,
        messages: outboundMessages,
        stream: false,
    };

    const endpointUrl = `${HERMES_CONFIG.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (HERMES_CONFIG.apiKey) {
        headers.Authorization = `Bearer ${HERMES_CONFIG.apiKey}`;
    }

    let response: Response;
    try {
        response = await fetch(endpointUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(HERMES_CONFIG.requestTimeoutMs),
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        actionLogger.error(
            '[HermesAgent] Koneksi HTTP ke Hermes gagal:',
            err instanceof Error ? err : new Error(String(err)),
            { endpoint: endpointUrl }
        );

        if (errMsg.toLowerCase().includes('aborted') || errMsg.toLowerCase().includes('timeout')) {
            throw new Error(
                'Hermes Agent membutuhkan waktu terlalu lama untuk merespons (timeout). Silakan coba ajukan pertanyaan kembali.'
            );
        }

        if (
            errMsg.toLowerCase().includes('econnrefused') ||
            errMsg.toLowerCase().includes('fetch failed')
        ) {
            throw new Error(
                'Layanan Hermes Agent di server sedang tidak aktif atau tidak dapat dijangkau. Pastikan service agent pada server telah dijalankan.'
            );
        }

        throw new Error(`Gagal menghubungi Hermes Agent: ${errMsg}`);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        actionLogger.error(
            `[HermesAgent] Server merespons dengan status HTTP ${response.status}:`,
            new Error(errorText.slice(0, 500) || `HTTP ${response.status}`),
            { status: response.status }
        );
        throw new Error(
            `Hermes Agent mengembalikan error (HTTP ${response.status}). Silakan coba beberapa saat lagi.`
        );
    }

    const data = (await response.json()) as HermesChatCompletionResponse;

    if (data.error?.message) {
        throw new Error(`Hermes Agent Error: ${data.error.message}`);
    }

    const firstChoice = data.choices?.[0];
    if (!firstChoice?.message) {
        throw new Error('Hermes Agent tidak memberikan balasan pesan.');
    }

    // Ambil konten, abaikan reasoning_content, lalu bersihkan tag <think>
    const rawContent = firstChoice.message.content || '';
    const sanitizedContent = stripReasoningContent(rawContent);

    if (!sanitizedContent) {
        throw new Error(
            'Balasan dari Hermes Agent kosong setelah penyaringan reasoning. Silakan ulangi pertanyaan.'
        );
    }

    return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: sanitizedContent,
        createdAt: new Date().toISOString(),
    };
}

