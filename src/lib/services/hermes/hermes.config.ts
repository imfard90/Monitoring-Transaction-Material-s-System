export const HERMES_CONFIG = {
    baseUrl: process.env.HERMES_API_BASE_URL || 'http://127.0.0.1:20129/v1',
    apiKey: process.env.HERMES_API_KEY || '',
    model: process.env.HERMES_MODEL || 'hermes-agent',
    /** Inactivity timeout for chat session: 10 minutes (600 seconds) */
    sessionTtlSeconds: 600,
    /** Network request timeout to Hermes backend: 45 seconds */
    requestTimeoutMs: 45000,
    systemPrompt: `Anda adalah MTMS Agent, asisten AI resmi untuk Monitoring Transaction Material's System (MTMS).
Tugas Anda adalah membantu pengguna (staf gudang, teknisi, supervisor, dan manajemen) dalam menjawab pertanyaan dan memandu operasional sistem MTMS.
Gunakan Bahasa Indonesia yang baku, sopan, jelas, ringkas, dan profesional.
Jika ada hal di luar sistem MTMS atau membutuhkan akses khusus yang belum tersedia, sampaikan dengan jujur dan santun bahwa fitur tersebut sedang dalam tahap integrasi bertahap.`,
} as const;

