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

        if (matchedKey === null) {
            rows.set(it.y, [it]);
        } else {
            rows.get(matchedKey)?.push(it);
        }
    }

    for (const row of rows.values()) {
        row.sort((a, b) => a.x - b.x);
    }

    return rows;
}

/**
 * Extracts numeric quantity from line items in a single row.
 * In SAP BA SO documents, the Volume SO column is located around x: 400..480.
 * Looks for Indonesian number format: e.g. 1.234,00 or standard integers.
 */
function extractQuantity(items: TextItem[]): number | null {
    const qtyItem = items.find(
        (it) => it.x >= 400 && it.x <= 480 && /^[\d.,]+$/.test(it.text.trim())
    );
    if (!qtyItem) return null;

    const raw = qtyItem.text.trim().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) || parsed < 0 ? null : Math.round(parsed);
}

/**
 * Parses BA Stock Opname PDF document.
 * Dynamically loads pdfjs-dist on client or server.
 * Operates page-by-page to prevent cross-page coordinate collision.
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
    const materials: ParsedMaterial[] = [];

    // Temporary storage for row positions to support multiline names within a page
    interface WorkingMaterial extends ParsedMaterial {
        _y: number;
    }

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        options?.onProgress?.(pageNum, numPages);

        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageItems: TextItem[] = [];

        for (const item of content.items) {
            const t = item as { str: string; transform?: number[] };
            if (!t.str || !t.transform) continue;

            const text = t.str.trim();
            if (!text) continue;

            const x = Math.round(t.transform[4]);
            const y = Math.round(t.transform[5]);

            // Detect warehouse on page 1
            if (pageNum === 1 && !detectedWarehouse) {
                // Check coordinate anchor (near y=717, x=196) or pattern
                if (Math.abs(y - 717) <= 15 && x >= 180 && x <= 220) {
                    detectedWarehouse = text;
                } else if (/^(?:WH\s+SO|SO\s+)/i.test(text)) {
                    detectedWarehouse = text;
                }
            }

            pageItems.push({ x, y, text });
        }

        // Group rows per page with tolerance
        const rowsMap = groupByRowWithTolerance(pageItems, 3.0);
        const sortedYs = [...rowsMap.keys()].sort((a, b) => b - a);

        let lastMaterial: WorkingMaterial | null = null;

        for (const y of sortedYs) {
            const items = rowsMap.get(y) as TextItem[];

            // Detect and stop at signatures, document header, or table headers
            if (
                items.some(
                    (it) =>
                        it.text.toLowerCase().includes('penanda tangan') ||
                        it.text.toLowerCase().includes('berita acara') ||
                        it.text === 'Nama Gudang' ||
                        it.text === 'Tanggal Stock Opname' ||
                        it.text === 'ID Barang' ||
                        it.text === 'Volume SO'
                )
            ) {
                lastMaterial = null;
                continue;
            }

            // Exclude page footer (e.g. cetakan ke... page x of y)
            if (y < 60) {
                lastMaterial = null;
                continue;
            }

            // Material code: usually around x=65, matches SAP pattern including slashes
            const codeItem = items.find(
                (it) =>
                    it.x >= 55 &&
                    it.x <= 85 &&
                    /^[A-Z0-9][\w./-]{2,30}$/.test(it.text) &&
                    /[A-Z]/.test(it.text)
            );

            // Row number (No): usually around x=35..55
            const noItem = items.find((it) => it.x >= 35 && it.x <= 55 && /^\d+$/.test(it.text));
            // Unit (Satuan): usually around x=505..535 (PC, M, BTG, etc.)
            const unitItem = items.find((it) => it.x >= 505 && it.x <= 535);

            const qty = extractQuantity(items);

            // A row is a valid material line if it has codeItem and (quantity OR row number OR unit)
            // If Volume SO cell is blank in SAP PDF, quantity defaults to 0
            if (codeItem && (qty !== null || noItem !== undefined || unitItem !== undefined)) {
                // Try to find material description in the row (between code and qty)
                const nameItems = items.filter((it) => it.x > 85 && it.x < 400);
                const materialName = nameItems
                    .map((n) => n.text)
                    .join(' ')
                    .trim();

                const itemData: WorkingMaterial = {
                    warehouse_id: 0, // Assigned after warehouse detection check
                    warehouse: detectedWarehouse,
                    material_code: codeItem.text.trim().toUpperCase(),
                    material_name: materialName,
                    saldo_sap: qty ?? 0,
                    _y: y,
                };
                materials.push(itemData);
                lastMaterial = itemData;
            } else if (lastMaterial && items.length > 0) {
                // Support multiline description continuation within the same page
                const isDirectlyBelow = lastMaterial._y - y > 0 && lastMaterial._y - y <= 16;
                const onlyInNameColumn = items.every((it) => it.x >= 85 && it.x < 400);

                if (isDirectlyBelow && onlyInNameColumn) {
                    const extraName = items
                        .map((n) => n.text)
                        .join(' ')
                        .trim();
                    if (extraName) {
                        lastMaterial.material_name =
                            `${lastMaterial.material_name} ${extraName}`.trim();
                    }
                } else {
                    lastMaterial = null;
                }
            } else {
                lastMaterial = null;
            }
        }
    }

    if (!detectedWarehouse) {
        throw new Error(
            'Tidak dapat mendeteksi nama gudang di PDF. Pastikan dokumen adalah format resmi BA SO SAP.'
        );
    }

    const warehouseId = resolveWarehouseId(detectedWarehouse, options?.masterWarehouses);
    if (warehouseId === 0) {
        throw new Error(
            `Gudang "${detectedWarehouse}" belum terdaftar atau tidak dikenali di sistem MTMS. Hubungi administrator.`
        );
    }

    // Set correct warehouse_id and clean up internal fields
    const sanitizedMaterials: ParsedMaterial[] = materials.map((m) => ({
        warehouse_id: warehouseId,
        warehouse: detectedWarehouse,
        material_code: m.material_code,
        material_name: m.material_name,
        saldo_sap: m.saldo_sap,
    }));

    return {
        materials: sanitizedMaterials,
        warehouse: detectedWarehouse,
        warehouse_id: warehouseId,
        totalPages: numPages,
        totalRows: sanitizedMaterials.length,
    };
}
