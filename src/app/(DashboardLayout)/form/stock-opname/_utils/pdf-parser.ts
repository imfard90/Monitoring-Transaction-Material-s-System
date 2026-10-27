/**
 * PDF Parser utility for BA Stock Opname SAP.
 * Modular, decoupled from React components, dynamically imports pdfjs-dist.
 */

import { normalizeWarehouseKey } from '@/lib/warehouse-helper';

export interface ParsedMaterial {
    warehouse_id: number;
    warehouse: string;
    material_code: string;
    material_name: string;
    saldo_sap: number;
}

export interface ParsePdfResult {
    materials: ParsedMaterial[];
    warehouse: string;
    warehouse_id: number;
    totalPages: number;
    totalRows: number;
}

export type ParsePdfProgressCallback = (current: number, total: number) => void;

interface TextItem {
    x: number;
    y: number;
    text: string;
}

// Fallback warehouse map if dynamic master data is not yet loaded
const DEFAULT_WH_MAP: Record<string, number> = {
    whsokarangpilang: 1,
    sokarangpilang: 1,
    sokarang_pilang: 1,
    'sokarang-pilang': 1,
    whsogresik: 2,
    sogresik: 2,
    whsolamongan: 3,
    solamongan: 3,
    whsobojonegoro: 4,
    sobojonegoro: 4,
    whsotuban: 5,
    sotuban: 5,
    whsosurabaya: 6,
    sosurabaya: 6,
};

/**
 * Resolves warehouse name and ID using master warehouse list if available,
 * with normalized key comparison and alias fallbacks.
 */
export function resolveWarehouseId(
    whName: string,
    masterWarehouses?: Array<{ id: number; name: string }>
): number {
    const key = normalizeWarehouseKey(whName);
    if (!key) return 0;

    if (masterWarehouses && masterWarehouses.length > 0) {
        const found = masterWarehouses.find((mw) => {
            const mwKey = normalizeWarehouseKey(mw.name);
            return mwKey === key || key.includes(mwKey) || mwKey.includes(key);
        });
        if (found) return found.id;
    }

    // Direct lookup in default map
    if (DEFAULT_WH_MAP[key]) {
        return DEFAULT_WH_MAP[key];
    }

    // Fuzzy matching against default keys
    for (const [mapKey, id] of Object.entries(DEFAULT_WH_MAP)) {
        if (key.includes(mapKey) || mapKey.includes(key)) {
            return id;
        }
    }

    return 0;
}

/**
 * Groups text items into rows with a vertical tolerance (±2px)
 * to handle subtle rendering variations in PDF generators.
 */
function groupByRowWithTolerance(items: TextItem[], tolerance = 2.5): Map<number, TextItem[]> {
    const rows = new Map<number, TextItem[]>();

    for (const it of items) {
        let matchedKey: number | null = null;
        for (const existingY of rows.keys()) {
            if (Math.abs(existingY - it.y) <= tolerance) {
                matchedKey = existingY;
                break;
            }
        }

        if (matchedKey !== null) {
            rows.get(matchedKey)!.push(it);
        } else {
            rows.set(it.y, [it]);
        }
    }

    for (const row of rows.values()) {
        row.sort((a, b) => a.x - b.x);
    }

    return rows;
}

/**
 * Extracts numeric quantity from line items.
 * Looks for Indonesian number format: e.g. 1.234,00 or standard integers.
 */
function extractQuantity(items: TextItem[]): number | null {
    const numericCandidates = items
        .filter((it) => {
            const trimmed = it.text.trim();
            // Candidate must be in quantity column range and match numeric pattern
            return it.x >= 370 && it.x <= 530 && /^\d[\d.,]*$/.test(trimmed) && trimmed.length > 0;
        })
        .sort((a, b) => b.x - a.x);

    if (numericCandidates.length === 0) return null;

    const raw = numericCandidates[0].text.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) || parsed < 0 ? null : Math.round(parsed);
}

/**
 * Parses BA Stock Opname PDF document.
 * Dynamically loads pdfjs-dist on client.
 */
export async function parseStockOpnamePdf(
    fileData: ArrayBuffer,
    options?: {
        onProgress?: ParsePdfProgressCallback;
        masterWarehouses?: Array<{ id: number; name: string }>;
    }
): Promise<ParsePdfResult> {
    const pdfjsLib = await import('pdfjs-dist');

    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    const loadingTask = pdfjsLib.getDocument({ data: fileData });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    let detectedWarehouse = '';
    const allItems: TextItem[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        options?.onProgress?.(pageNum, numPages);

        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        for (const item of content.items) {
            const t = item as { str: string; transform?: number[] };
            if (!t.str || !t.transform) continue;

            const text = t.str.trim();
            if (!text) continue;

            const x = Math.round(t.transform[4]);
            const y = Math.round(t.transform[5]);

            // Detect warehouse on page 1
            if (pageNum === 1 && !detectedWarehouse) {
                // Check coordinate anchor (near y=717, x=196)
                if (Math.abs(y - 717) <= 10 && Math.abs(x - 196) <= 25) {
                    detectedWarehouse = text;
                } else if (/^(?:WH\s+SO|SO\s+)/i.test(text)) {
                    detectedWarehouse = text;
                }
            }

            // Collect material table body lines (typically within y=90..650)
            if (y >= 90 && y <= 660) {
                allItems.push({ x, y, text });
            }
        }
    }

    if (!detectedWarehouse) {
        // Fallback search through all collected items on top area
        const headerItem = allItems.find((it) => it.y > 600 && /WH\s+SO/i.test(it.text));
        if (headerItem) {
            detectedWarehouse = headerItem.text;
        } else {
            throw new Error(
                'Tidak dapat mendeteksi nama gudang di PDF. Pastikan dokumen adalah format resmi BA SO SAP.'
            );
        }
    }

    const warehouseId = resolveWarehouseId(detectedWarehouse, options?.masterWarehouses);
    if (warehouseId === 0) {
        throw new Error(
            `Gudang "${detectedWarehouse}" belum terdaftar atau tidak dikenali di sistem MTMS. Hubungi administrator.`
        );
    }

    const rowsMap = groupByRowWithTolerance(allItems, 3);
    const sortedYs = [...rowsMap.keys()].sort((a, b) => b - a);
    const materials: ParsedMaterial[] = [];

    for (const y of sortedYs) {
        const items = rowsMap.get(y) as TextItem[];

        // Material code: usually around x=65, matches SAP pattern
        const codeItem = items.find(
            (it) =>
                it.x >= 55 &&
                it.x <= 85 &&
                /^[A-Z0-9][\w.-]{3,24}$/.test(it.text) &&
                /[A-Z]/.test(it.text)
        );

        if (!codeItem) continue;

        const qty = extractQuantity(items);
        if (qty === null) continue;

        // Try to find material description in the row (between code and qty)
        const nameItems = items.filter((it) => it.x > 85 && it.x < 370);
        const materialName = nameItems
            .map((n) => n.text)
            .join(' ')
            .trim();

        materials.push({
            warehouse_id: warehouseId,
            warehouse: detectedWarehouse,
            material_code: codeItem.text.toUpperCase(),
            material_name: materialName,
            saldo_sap: qty,
        });
    }

    return {
        materials,
        warehouse: detectedWarehouse,
        warehouse_id: warehouseId,
        totalPages: numPages,
        totalRows: materials.length,
    };
}
