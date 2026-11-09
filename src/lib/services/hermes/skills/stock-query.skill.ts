import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { sendChatMessageToHermes } from '../hermes-agent.service';
import type { HermesChatMessage } from '../types';

export interface WarehouseEntity {
    id: number;
    name: string;
    aliases: string[];
}

export const MTMS_WAREHOUSES: WarehouseEntity[] = [
    { id: 1, name: 'SO Karangpilang', aliases: ['karangpilang', 'karang pilang', 'kp'] },
    { id: 2, name: 'SO Gresik', aliases: ['gresik', 'grs'] },
    { id: 3, name: 'SO Lamongan', aliases: ['lamongan', 'lmg'] },
    { id: 4, name: 'SO Bojonegoro', aliases: ['bojonegoro', 'bjn'] },
    { id: 5, name: 'SO Tuban', aliases: ['tuban', 'tbn'] },
    { id: 6, name: 'Sby Kebalen', aliases: ['kebalen', 'sby', 'surabaya'] },
];

const STOCK_INTENT_KEYWORDS = [
    'stok',
    'stock',
    'sisa',
    'tersisa',
    'ketersediaan',
    'ada berapa',
    'berapa ada',
    'kuantitas',
    'jumlah',
    'cek barang',
];

const STOP_WORDS = new Set([
    'bagaimana',
    'berapa',
    'berapakah',
    'gimana',
    'cek',
    'lihat',
    'tampilkan',
    'tolong',
    'bisa',
    'apakah',
    'ada',
    'gak',
    'nggak',
    'tidak',
    'stock',
    'stok',
    'sisa',
    'tersisa',
    'ketersediaan',
    'material',
    'barang',
    'di',
    'pada',
    'ke',
    'gudang',
    'so',
    'wh',
    'warehouse',
    'saat',
    'ini',
    'sekarang',
    'dong',
    'nih',
    'ya',
    'min',
    'gan',
    'terkini',
    'semua',
    'mana',
    'yg',
    'yang',
    'untuk',
    'mau',
    'tahu',
    'tau',
    'info',
    'informasi',
    'punya',
    'kami',
    'kita',
    'saya',
    'kamu',
    'anda',
    'kah',
]);

/**
 * Mendeteksi apakah teks mengandung maksud/intent pengecekan stok.
 */
export function isStockIntent(text: string): boolean {
    const lower = text.toLowerCase();
    return STOCK_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Mengekstrak entitas gudang dari teks berdasarkan nama atau alias.
 */
export function extractWarehouse(text: string): WarehouseEntity | null {
    const lower = text.toLowerCase();
    for (const wh of MTMS_WAREHOUSES) {
        if (lower.includes(wh.name.toLowerCase())) {
            return wh;
        }
        for (const alias of wh.aliases) {
            const regex = new RegExp(`\\b${alias}\\b`, 'i');
            if (regex.test(lower)) {
                return wh;
            }
        }
    }
    return null;
}

/**
 * Mengekstrak kata kunci nama/kategori material dari teks pertanyaan pengguna.
 */
export function extractMaterialKeyword(text: string): string | null {
    const words = text
        .toLowerCase()
        .replace(/[/\\.,?!;:()[\]{}'"`~@#$%^&*+=<>_]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);

    const allWarehouseTerms = new Set(
        MTMS_WAREHOUSES.flatMap((w) => [
            w.name.toLowerCase(),
            ...w.name.toLowerCase().split(/\s+/),
            ...w.aliases,
        ])
    );

    const candidates = words.filter(
        (word) => !STOP_WORDS.has(word) && !allWarehouseTerms.has(word)
    );

    if (candidates.length === 0) {
        return null;
    }

    return candidates.join(' ');
}

/**
 * Melakukan ekspansi sinonim kata kunci material telekomunikasi / optik.
 */
export function expandMaterialKeywords(keyword: string): string[] {
    const lower = keyword.toLowerCase().trim();
    const result = new Set<string>([lower]);

    if (lower.includes('kabel') || lower.includes('cable')) {
        result.add('kabel');
        result.add('cable');
        result.add('ku fo');
        result.add('dropcore');
        result.add('adss');
    } else if (lower.includes('dropcore') || lower.includes('drop core')) {
        result.add('dropcore');
        result.add('dc fo');
        result.add('drop cable');
    } else if (lower.includes('ont')) {
        result.add('ont');
        result.add('modem');
    } else if (lower.includes('odp')) {
        result.add('odp');
    } else if (lower.includes('closure')) {
        result.add('closure');
        result.add('cl-inline');
    } else if (lower.includes('patchcord') || lower.includes('patch cord')) {
        result.add('patchcord');
        result.add('patch cord');
    }

    return Array.from(result);
}

/**
 * Format markdown tabel stok deterministik sebagai fallback andal.
 */
export function formatStockMarkdown(
    warehouseName: string,
    materialKeyword: string | null,
    rows: Array<{
        materialCode: string;
        materialName: string;
        materialUnit: string;
        qtyStock: number;
    }>
): string {
    if (rows.length === 0) {
        if (materialKeyword) {
            return `Saat ini tidak ditemukan stok material **${materialKeyword}** yang tercatat di **${warehouseName}** (stok kosong atau belum ada pergerakan material terkait).`;
        }
        return `Saat ini tidak ada data stok material yang tercatat di **${warehouseName}**.`;
    }

    const title = materialKeyword
        ? `Berikut data ketersediaan stok untuk material **${materialKeyword}** di **${warehouseName}** berdasarkan sistem MTMS terkini:`
        : `Berikut data ketersediaan stok material di **${warehouseName}** berdasarkan sistem MTMS terkini:`;

    const tableHeader = '| Kode Material | Deskripsi Material | Sisa Stok | Satuan |\n| :--- | :--- | :---: | :---: |';
    const tableRows = rows
        .map(
            (r) =>
                `| **${r.materialCode}** | ${r.materialName} | ${Number(r.qtyStock).toLocaleString('id-ID')} | ${r.materialUnit} |`
        )
        .join('\n');

    return `${title}\n\n${tableHeader}\n${tableRows}\n\nAda informasi stok atau gudang lain yang ingin dicek?`;
}

export interface StockSkillResult {
    handled: boolean;
    message?: HermesChatMessage;
}

/**
 * Handler utama untuk skill pengecekan stok MTMS Agent.
 * Mendukung deteksi intent, klarifikasi multi-turn (tanya gudang mana),
 * dan eksekusi query langsung ke database inventory.stock_balance.
 */
export async function handleStockQuerySkill(
    userMessage: string,
    history: HermesChatMessage[] = []
): Promise<StockSkillResult> {
    const isDirectIntent = isStockIntent(userMessage);
    const userWarehouse = extractWarehouse(userMessage);
    const userMaterial = extractMaterialKeyword(userMessage);

    // Cek apakah pesan pengguna ini adalah jawaban atas klarifikasi gudang sebelumnya
    const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant');
    const isClarificationFollowUp =
        Boolean(lastAssistantMsg?.content.includes('gudang mana?')) && Boolean(userWarehouse);

    if (!isDirectIntent && !isClarificationFollowUp && !userWarehouse) {
        return { handled: false };
    }

    // Resolusi Gudang
    const targetWarehouse = userWarehouse;

    // Resolusi Material (jika ini tindak lanjut dari pesan sebelumnya, cari material dari riwayat)
    let targetMaterial = userMaterial;
    if (!targetMaterial && history.length > 0) {
        // Cari di riwayat pesan user atau klarifikasi bot sebelumnya
        const recentUserMsgs = [...history].reverse().filter((m) => m.role === 'user');
        for (const prevUserMsg of recentUserMsgs) {
            const mat = extractMaterialKeyword(prevUserMsg.content);
            if (mat) {
                targetMaterial = mat;
                break;
            }
        }

        // Cek juga pola teks pada pesan klarifikasi asisten terakhir (e.g. "stok **kabel**, Anda ingin...")
        if (!targetMaterial && lastAssistantMsg) {
            const match = lastAssistantMsg.content.match(/stok\s+\*\*([^*]+)\*\*/i);
            if (match?.[1]) {
                targetMaterial = match[1].trim();
            }
        }
    }

    // KASUS 1: Gudang belum ditentukan -> Agent melakukan klarifikasi (Zero-latency direct response)
    if (!targetWarehouse) {
        const materialSpecifier = targetMaterial ? ` untuk **${targetMaterial}**` : '';
        const clarificationText = `Untuk pengecekan stok${materialSpecifier}, kamu mau tahu stok di gudang mana?\n\nPilihan gudang MTMS:\n- **SO Karangpilang**\n- **SO Gresik**\n- **SO Lamongan**\n- **SO Bojonegoro**\n- **SO Tuban**\n\nSilakan sebutkan nama gudang pilihan Anda (contoh: *"di Gresik"* atau *"SO Tuban"*).`;

        return {
            handled: true,
            message: {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: clarificationText,
                createdAt: new Date().toISOString(),
            },
        };
    }

    // KASUS 2: Gudang sudah spesifik -> Query ke database MTMS
    try {
        const keywords = targetMaterial ? expandMaterialKeywords(targetMaterial) : [];
        const rawStock = await inventoryRepository.searchWarehouseStockBalance(
            targetWarehouse.id,
            keywords,
            15
        );

        const rows = rawStock.map((r) => ({
            materialCode: r.materialCode ?? '-',
            materialName: r.materialName ?? '-',
            materialUnit: r.materialUnit ?? 'UNIT',
            qtyStock: Number(r.qtyStock ?? 0),
        }));

        // Gunakan Hermes LLM untuk merangkum secara natural, dengan fallback deterministik yang aman
        let finalContent = '';
        try {
            const promptForHermes = `Berikut adalah data resmi stok dari database MTMS:
Gudang: ${targetWarehouse.name}
Pencarian: ${targetMaterial || 'Semua Material'}
Data:
${JSON.stringify(
    rows.map((r) => ({
        kode: r.materialCode,
        deskripsi: r.materialName,
        sisa_stok: r.qtyStock,
        satuan: r.materialUnit,
    })),
    null,
    2
)}

Tolong buatkan resume stok yang rapi, informatif, dan profesional dalam Bahasa Indonesia menggunakan format markdown tabel. Sertakan salam dan tawarkan bantuan lanjutan.`;

            const hermesResponse = await sendChatMessageToHermes(promptForHermes, []);
            finalContent = hermesResponse.content;
        } catch (llmErr) {
            actionLogger.warn(
                '[StockQuerySkill] LLM summarization gagal/timeout, beralih ke fallback deterministik:',
                llmErr instanceof Error ? llmErr : new Error(String(llmErr))
            );
            finalContent = formatStockMarkdown(targetWarehouse.name, targetMaterial, rows);
        }

        return {
            handled: true,
            message: {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: finalContent,
                createdAt: new Date().toISOString(),
            },
        };
    } catch (dbErr) {
        actionLogger.error(
            '[StockQuerySkill] Terjadi kesalahan query stock balance:',
            dbErr instanceof Error ? dbErr : new Error(String(dbErr))
        );
        return {
            handled: true,
            message: {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Mohon maaf, terjadi kendala teknis saat membaca data stok untuk **${targetWarehouse.name}**. Silakan coba kembali beberapa saat lagi.`,
                createdAt: new Date().toISOString(),
            },
        };
    }
}
