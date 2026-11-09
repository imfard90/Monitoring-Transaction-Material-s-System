import { actionLogger } from '@/lib/logger';
import { HERMES_CONFIG } from './hermes.config';
import { executeHermesTool } from './hermes-tool-executor';
import { HERMES_TOOLS } from './hermes-tools';
import type {
    HermesChatCompletionRequest,
    HermesChatCompletionResponse,
    HermesChatMessage,
    HermesMessagePayload,
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

/** Maksimal putaran pemanggilan tool agar terhindar dari infinite loop */
const MAX_TOOL_ITERATIONS = 2;

/**
 * Mengirim pesan ke agent Hermes dengan dukungan native OpenAI-compatible Tool Calling.
 * Jika model meminta eksekusi tool, backend akan mengeksekusi query database aman dan
 * mengembalikan hasilnya ke model agar model dapat membuat resume yang akurat.
 */
export async function sendChatMessageToHermes(
    userMessage: string,
    history: HermesChatMessage[] = []
): Promise<HermesChatMessage> {
    const cleanUserText = userMessage.trim();
    if (!cleanUserText) {
        throw new Error('Pesan tidak boleh kosong.');
    }

    // Bangun daftar pesan: System Prompt -> Riwayat Percakapan -> Pesan Baru
    const outboundMessages: HermesMessagePayload[] = [
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

    const endpointUrl = `${HERMES_CONFIG.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (HERMES_CONFIG.apiKey) {
        headers.Authorization = `Bearer ${HERMES_CONFIG.apiKey}`;
    }

    let iterations = 0;

    while (iterations <= MAX_TOOL_ITERATIONS) {
        iterations++;

        const payload: HermesChatCompletionRequest = {
            model: HERMES_CONFIG.model,
            messages: outboundMessages,
            tools: HERMES_TOOLS,
            tool_choice: 'auto',
            stream: false,
        };

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

            if (
                errMsg.toLowerCase().includes('aborted') ||
                errMsg.toLowerCase().includes('timeout')
            ) {
                throw new Error(
                    'MTMS Agent membutuhkan waktu terlalu lama untuk merespons (timeout). Silakan coba ajukan pertanyaan kembali.'
                );
            }

            if (
                errMsg.toLowerCase().includes('econnrefused') ||
                errMsg.toLowerCase().includes('fetch failed')
            ) {
                throw new Error(
                    'Layanan MTMS Agent di server sedang tidak aktif atau tidak dapat dijangkau. Pastikan service agent pada server telah dijalankan.'
                );
            }

            throw new Error(`Gagal menghubungi MTMS Agent: ${errMsg}`);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            actionLogger.error(
                `[HermesAgent] Server merespons dengan status HTTP ${response.status}:`,
                new Error(errorText.slice(0, 500) || `HTTP ${response.status}`),
                { status: response.status }
            );
            throw new Error(
                `MTMS Agent mengembalikan error (HTTP ${response.status}). Silakan coba beberapa saat lagi.`
            );
        }

        const data = (await response.json()) as HermesChatCompletionResponse;

        if (data.error?.message) {
            throw new Error(`MTMS Agent Error: ${data.error.message}`);
        }

        const firstChoice = data.choices?.[0];
        if (!firstChoice?.message) {
            throw new Error('MTMS Agent tidak memberikan balasan pesan.');
        }

        const choiceMessage = firstChoice.message;

        // Jika model meminta pemanggilan Tool (Function Calling)
        if (choiceMessage.tool_calls && choiceMessage.tool_calls.length > 0) {
            actionLogger.info(
                `[HermesAgent] Model meminta ${choiceMessage.tool_calls.length} tool call(s) pada iterasi ${iterations}`,
                { tool_calls: choiceMessage.tool_calls }
            );

            // 1. Simpan pesan asisten yang berisi tool_calls ke dalam payload riwayat
            outboundMessages.push({
                role: 'assistant',
                content: choiceMessage.content || null,
                tool_calls: choiceMessage.tool_calls,
            });

            // 2. Eksekusi setiap tool yang diminta oleh model
            for (const toolCall of choiceMessage.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = toolCall.function.arguments;
                const toolResult = await executeHermesTool(toolName, toolArgs);

                outboundMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify(toolResult),
                });
            }

            // Lanjutkan loop iterasi agar Hermes merangkum jawaban akhir berdasarkan hasil tool
            continue;
        }

        // Jika tidak ada tool_calls lagi, berarti Hermes sudah memberikan jawaban final
        const rawContent = choiceMessage.content || '';
        const sanitizedContent = stripReasoningContent(rawContent);

        if (!sanitizedContent) {
            throw new Error(
                'Balasan dari MTMS Agent kosong setelah penyaringan reasoning. Silakan ulangi pertanyaan.'
            );
        }

        return {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: sanitizedContent,
            createdAt: new Date().toISOString(),
        };
    }

    throw new Error('MTMS Agent melebihi batas iterasi pemanggilan tool.');
}
