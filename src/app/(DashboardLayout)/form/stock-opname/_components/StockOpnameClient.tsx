'use client';

import { Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { StockOpnameResultDialog } from './StockOpnameResultDialog';
import { StockOpnameLogTable } from './StockOpnameLogTable';
import { StockOpnameDetailPane } from './StockOpnameDetailPane';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';

// PDF.js worker served from /public/ — no CDN, no dynamic import
if (typeof window !== 'undefined') {
    (
        pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }
    ).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedMaterial {
    warehouse_id: number;
    warehouse: string;
    material_code: string;
    material_name: string;
    saldo_sap: number;
}

interface StockResult {
    material_code: string;
    material_name: string;
    qty_system: number;
    qty_opname: number;
    difference: number;
}

interface StockOpnameClientProps {
    user: {
        nik: string;
        role: string;
        warehouseIds?: number[];
    };
}

// ---------------------------------------------------------------------------
// PDF Parsing Helpers
// ---------------------------------------------------------------------------

const WH_MAP: Record<string, number> = {
    'WH SO KARANG PILANG': 1,
    'WH SO LAMONGAN': 3,
    'WH SO GRESIK': 2,
    'WH SO BOJONEGORO': 4,
    'WH SO TUBAN': 5,
    'WH SO SURABAYA': 6,
};

interface TextItem {
    x: number;
    y: number;
    text: string;
}

function groupByRow(items: TextItem[]): Map<number, TextItem[]> {
    const map = new Map<number, TextItem[]>();
    for (const it of items) {
        const key = it.y;
        const existing = map.get(key);
        if (existing) {
            existing.push(it);
        } else {
            map.set(key, [it]);
        }
    }
    for (const row of map.values()) {
        row.sort((a, b) => a.x - b.x);
    }
    return map;
}

function extractQty(items: TextItem[]): number | null {
    const numericItems = items
        .filter(
            (it) => it.x >= 380 && it.x <= 515 && /^\d[\d.,]*$/.test(it.text) && it.text.length > 0
        )
        .sort((a, b) => b.x - a.x);
    if (numericItems.length === 0) return null;
    const raw = numericItems[0].text.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function resolveWarehouse(whName: string): number {
    const normalized = whName.toUpperCase().replace(/\s+/g, ' ').trim();
    const id = WH_MAP[normalized] ?? 0;
    if (id === 0) {
        throw new Error(
            `Warehouse "${whName}" tidak ditemukan di MTMS. Hubungi admin untuk mendaftarkan gudang baru.`
        );
    }
    return id;
}

async function parsePDF(
    pdf: pdfjsLib.PDFDocumentProxy
): Promise<{ materials: ParsedMaterial[]; warehouse: string }> {
    let warehouse = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        for (const item of content.items) {
            const t = item as { str: string; transform?: number[] };
            if (!t.str || !t.transform) continue;
            const x = Math.round(t.transform[4]);
            const y = Math.round(t.transform[5]);
            if (pageNum === 1 && y === 717 && x === 196) {
                warehouse = t.str.trim();
            }
        }
    }

    if (!warehouse) {
        throw new Error('Tidak dapat menemukan nama gudang di PDF.');
    }

    const whId = resolveWarehouse(warehouse);

    const allItems: TextItem[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        for (const item of content.items) {
            const t = item as { str: string; transform?: number[] };
            if (!t.str || !t.transform) continue;
            const x = Math.round(t.transform[4]);
            const y = Math.round(t.transform[5]);
            if (y >= 100 && y <= 642) {
                allItems.push({ x, y, text: t.str.trim() });
            }
        }
    }

    const rows = groupByRow(allItems);
    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    const materials: ParsedMaterial[] = [];

    for (const y of sortedYs) {
        const items = rows.get(y) as TextItem[];
        const codeItem = items.find(
            (it) => it.x === 65 && /^[A-Z0-9][\w.-]{3,17}$/.test(it.text) && /[A-Z]/.test(it.text)
        );
        if (!codeItem) continue;
        const qty = extractQty(items);
        if (qty === null) continue;
        materials.push({
            warehouse_id: whId,
            warehouse,
            material_code: codeItem.text.toUpperCase(),
            material_name: '',
            saldo_sap: qty,
        });
    }

    return { materials, warehouse };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockOpnameClient(props: StockOpnameClientProps) {
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [showResultDialog, setShowResultDialog] = useState(false);
    const [warehouseId, setWarehouseId] = useState<number>(0);
    const [warehouseName, setWarehouseName] = useState<string>('');
    const [stockResults, setStockResults] = useState<StockResult[]>([]);
    const [selectedLog, setSelectedLog] = useState<StockOpnameLog | null>(null);
    const [showDetailPane, setShowDetailPane] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isStaff = props.user.role === 'Staff';

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;
        if (selectedFile.type !== 'application/pdf') {
            toast.error('Hanya file PDF yang didukung.');
            return;
        }
        if (selectedFile.size > 10 * 1024 * 1024) {
            toast.error('Ukuran file maksimal 10 MB.');
            return;
        }

        setIsPdfLoading(true);

        try {
            const loadingTask = pdfjsLib.getDocument({ data: await selectedFile.arrayBuffer() });
            const pdf = await loadingTask.promise;
            const { materials, warehouse } = await parsePDF(pdf);

            if (materials.length === 0) {
                toast.error('Tidak ada data material yang berhasil di-parse dari PDF.');
                return;
            }

            const parsedWarehouseId = materials[0].warehouse_id;

            // Validasi akses gudang untuk Staff
            if (isStaff && props.user.warehouseIds && !props.user.warehouseIds.includes(parsedWarehouseId)) {
              toast.error(`Akses ditolak. Anda tidak memiliki akses ke gudang ${warehouse}.`);
              return;
            }

            // Call API to match with MTMS
            const res = await fetch('/api/stock-opname', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materials }),
            });

            const json = (await res.json()) as {
                success: boolean;
                data?: StockResult[];
                error?: string;
            };

            if (!res.ok || !json.success) {
                toast.error(json.error ?? 'Gagal memproses data.');
                return;
            }

            const results = json.data ?? [];
            if (results.length === 0) {
                toast.error('Tidak ada material yang cocok di MTMS.');
                return;
            }

            // Set state and show result dialog
            setWarehouseId(materials[0].warehouse_id);
            setWarehouseName(warehouse);
            setStockResults(results);
            setShowResultDialog(true);

            toast.success(`${materials.length} baris diproses, ${results.length} cocok di MTMS.`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gagal membaca PDF.';
            toast.error(msg);
        } finally {
            setIsPdfLoading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleViewDetail = (log: StockOpnameLog) => {
        setSelectedLog(log);
        setShowDetailPane(true);
    };

    const handleSaved = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    const handleUpdated = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <div className="space-y-8">
            {/* Upload Section - Glassmorphic */}
            <Card className="p-6 backdrop-blur-sm bg-card/70 border-border/40">
                <h2 className="text-lg font-semibold mb-4">Upload PDF BA SO SAP</h2>
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="pdf-upload"
                        aria-label="Upload PDF Stock Opname"
                    />
                    <label
                        htmlFor="pdf-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background text-sm font-medium cursor-pointer hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPdfLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isPdfLoading ? 'Memproses PDF...' : 'Pilih File PDF BA SO SAP'}
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Format: PDF hasil export BA SO SAP. Maksimal 10 MB.
                    </p>
                </div>
            </Card>

            {/* History Log Table */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">Riwayat Stock Opname</h2>
                <StockOpnameLogTable
                    onViewDetail={handleViewDetail}
                    refreshTrigger={refreshTrigger}
                />
            </div>

            {/* Result Dialog after parse */}
            <StockOpnameResultDialog
                open={showResultDialog}
                onOpenChange={setShowResultDialog}
                warehouseId={warehouseId}
                warehouseName={warehouseName}
                results={stockResults}
                isStaff={isStaff}
                onSaved={handleSaved}
            />

            {/* Detail Pane for log view */}
            <StockOpnameDetailPane
                open={showDetailPane}
                onOpenChange={setShowDetailPane}
                log={selectedLog}
                isStaff={isStaff}
                onUpdated={handleUpdated}
            />
        </div>
    );
}
