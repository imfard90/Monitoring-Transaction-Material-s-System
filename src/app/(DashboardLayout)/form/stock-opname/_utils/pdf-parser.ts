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
    // Karangpilang (ID: 1)
    whsokarangpilang: 1,
    sokarangpilang: 1,
    whkarangpilang: 1,
    karangpilang: 1,
    sokarang_pilang: 1,
    'sokarang-pilang': 1,
    // Gresik (ID: 2)
    whsogresik: 2,
    sogresik: 2,
    whgresik: 2,
    gresik: 2,
    // Lamongan (ID: 3)
    whsolamongan: 3,
    solamongan: 3,
    whlamongan: 3,
    lamongan: 3,
    // Bojonegoro (ID: 4)
    whsobojonegoro: 4,
    sobojonegoro: 4,
    whbojonegoro: 4,
    bojonegoro: 4,
    // Tuban (ID: 5)
    whsotuban: 5,
    sotuban: 5,
    whtuban: 5,
    tuban: 5,
    // Surabaya (ID: 6)
    whsosurabaya: 6,
    sosurabaya: 6,
    whsurabaya: 6,
    surabaya: 6,
};

/**
 * Strips common warehouse prefixes ("whso", "wh", "so", "gudang")
 * and separators to aid flexible matching.
 */
function cleanWarehouseKey(key: string): string {
    return key.replace(/^(?:whso|wh|so|gudang)/g, '').replace(/[-_]/g, '');
}

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

    const cleanKey = cleanWarehouseKey(key);

    if (masterWarehouses && masterWarehouses.length > 0) {
        // 1. Direct or substring match on normalized key
        const found = masterWarehouses.find((mw) => {
            const mwKey = normalizeWarehouseKey(mw.name);
            return mwKey === key || key.includes(mwKey) || mwKey.includes(key);
        });
        if (found) return found.id;

        // 2. Match on stripped key
        if (cleanKey.length >= 3) {
            const foundClean = masterWarehouses.find((mw) => {
                const mwClean = cleanWarehouseKey(normalizeWarehouseKey(mw.name));
                return (
                    mwClean === cleanKey || cleanKey.includes(mwClean) || mwClean.includes(cleanKey)
                );
            });
            if (foundClean) return foundClean.id;
        }
    }

    // Direct lookup in default map
    if (DEFAULT_WH_MAP[key]) {
        return DEFAULT_WH_MAP[key];
    }

    // Direct lookup by clean key
    if (cleanKey && DEFAULT_WH_MAP[cleanKey]) {
        return DEFAULT_WH_MAP[cleanKey];
    }

    // Fuzzy matching against default keys
    for (const [mapKey, id] of Object.entries(DEFAULT_WH_MAP)) {
        if (key.includes(mapKey) || mapKey.includes(key)) {
            return id;
        }
        if (cleanKey.length >= 3) {
            const mapClean = cleanWarehouseKey(mapKey);
            if (
                mapClean === cleanKey ||
                cleanKey.includes(mapClean) ||
                mapClean.includes(cleanKey)
            ) {
                return id;
            }
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
 * Detects warehouse name from Page 1 text items with multiple fallback strategies:
 * 1. Contextual anchor: Look for "Nama Gudang" label, and extract the text on the same row to the right.
 * 2. Prefix pattern: Match items starting with "WH SO", "WH ", "SO ", or "Gudang ".
 * 3. Master warehouse dictionary matching: Match any header item against master or default warehouse keys.
 * 4. Coordinate fallback: Match items in the header region (y ~ 717) excluding punctuation.
 */
export function extractWarehouseFromPage1(
    items: TextItem[],
    masterWarehouses?: Array<{ id: number; name: string }>
): string {
    // 1. Contextual search: look for "Nama Gudang" or similar label
    const labelItem = items.find((it) =>
        /(?:nama\s*gudang|nama\s*wh|^gudang$|^gudang\s*[:])/i.test(it.text)
    );
    if (labelItem) {
        // If label itself contains the colon and value, e.g. "Nama Gudang : WH SO Bojonegoro"
        const inlineMatch = labelItem.text.match(
            /(?:nama\s*gudang|nama\s*wh|^gudang)\s*[:]\s*(.+)/i
        );
        if (inlineMatch?.[1]?.trim()) {
            const candidate = inlineMatch[1].trim().replace(/^[:\s-]+|[:\s-]+$/g, '');
            if (candidate && candidate !== ':') {
                return candidate;
            }
        }

        // Search items on the same horizontal row to the right of the label
        const sameRow = items
            .filter((it) => Math.abs(it.y - labelItem.y) <= 6 && it.x > labelItem.x)
            .sort((a, b) => a.x - b.x);

        const rowCandidates = sameRow
            .map((it) => it.text.replace(/^[:\s-]+|[:\s-]+$/g, '').trim())
            .filter((txt) => txt.length > 0 && txt !== ':');

        if (rowCandidates.length > 0) {
            const combined = rowCandidates.join(' ').trim();
            if (combined) {
                return combined;
            }
        }
    }

    // 2. Pattern search: items with warehouse prefixes in header area (y > 550)
    const patternCandidates = items
        .filter((it) => it.y > 550 && /^(?:WH\s+SO|WH\s+|SO\s+|Gudang\s+)/i.test(it.text))
        .map((it) => it.text.replace(/^[:\s-]+|[:\s-]+$/g, '').trim())
        .filter((txt) => txt.length > 3 && txt !== ':');

    if (patternCandidates.length > 0) {
        return patternCandidates[0];
    }

    // 3. Master warehouse match in header region (y > 550)
    for (const it of items) {
        if (it.y > 550) {
            const cleaned = it.text.replace(/^[:\s-]+|[:\s-]+$/g, '').trim();
            if (cleaned.length >= 3 && resolveWarehouseId(cleaned, masterWarehouses) > 0) {
                return cleaned;
            }
        }
    }

    // 4. Coordinate fallback near y=717, x>=180
    const coordCandidates = items
        .filter((it) => Math.abs(it.y - 717) <= 25 && it.x >= 180)
        .map((it) => it.text.replace(/^[:\s-]+|[:\s-]+$/g, '').trim())
        .filter((txt) => txt.length > 1 && txt !== ':');

    if (coordCandidates.length > 0) {
        return coordCandidates[0];
    }

    return '';
}

/**
 * Parses BA Stock Opname PDF document.
 * Dynamically loads pdfjs-dist on client or server.
 * Operates page-by-page to prevent cross-page coordinate collision.
 */
export async function parseStockOpnamePdf(
    fileData: ArrayBuffer | Uint8Array,
    options?: {
        onProgress?: ParsePdfProgressCallback;
        masterWarehouses?: Array<{ id: number; name: string }>;
    }
): Promise<ParsePdfResult> {
    const pdfjsLib = await import('pdfjs-dist');

    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        const workerVersion = pdfjsLib.version || '6.5.438';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${workerVersion}`;
    }

    const data = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
    const loadingTask = pdfjsLib.getDocument({ data });
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

            pageItems.push({ x, y, text });
        }

        // Detect warehouse on page 1 (or page 2 fallback)
        if (!detectedWarehouse && (pageNum === 1 || pageNum === 2)) {
            detectedWarehouse = extractWarehouseFromPage1(pageItems, options?.masterWarehouses);
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
