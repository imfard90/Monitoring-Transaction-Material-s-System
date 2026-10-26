'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { StockOpnameUploadZone } from './StockOpnameUploadZone';
import { StockOpnameResultDialog, type StockResult } from './StockOpnameResultDialog';
import { StockOpnameLogTable } from './StockOpnameLogTable';
import { StockOpnameDetailPane } from './StockOpnameDetailPane';
import type { ParsePdfResult } from '../_utils/pdf-parser';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';

interface StockOpnameClientProps {
    user: {
        nik: string;
        role: string;
        warehouseIds?: number[];
    };
    masterWarehouses?: Array<{ id: number; name: string }>;
}

export function StockOpnameClient({ user, masterWarehouses }: StockOpnameClientProps) {
    const [showResultDialog, setShowResultDialog] = useState(false);
    const [warehouseId, setWarehouseId] = useState<number>(0);
    const [warehouseName, setWarehouseName] = useState<string>('');
    const [stockResults, setStockResults] = useState<StockResult[]>([]);
    const [selectedLog, setSelectedLog] = useState<StockOpnameLog | null>(null);
    const [showDetailPane, setShowDetailPane] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isMatching, setIsMatching] = useState(false);

    const isStaff = user.role.toLowerCase() === 'staff';

    const handlePdfParsed = async (result: ParsePdfResult) => {
        setIsMatching(true);
        try {
            // Call API to match extracted SAP items with MTMS stock balance
            const res = await fetch('/api/stock-opname', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materials: result.materials }),
            });

            const json = (await res.json()) as {
                success: boolean;
                data?: StockResult[];
                error?: string;
            };

            if (!res.ok || !json.success) {
                toast.error(json.error ?? 'Gagal mencocokkan data material dengan MTMS.');
                return;
            }

            const results = json.data ?? [];
            if (results.length === 0) {
                toast.error('Tidak ada data material yang cocok atau ditemukan di sistem.');
                return;
            }

            setWarehouseId(result.warehouse_id);
            setWarehouseName(result.warehouse);
            setStockResults(results);
            setShowResultDialog(true);

            toast.success(
                `Berhasil mengekstrak ${result.totalRows} baris dari dokumen BA SO "${result.warehouse}".`
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gagal menghubungi server.';
            toast.error(msg);
        } finally {
            setIsMatching(false);
        }
    };

    const handleViewDetail = (log: StockOpnameLog) => {
        setSelectedLog(log);
        setShowDetailPane(true);
    };

    const handleDataChanged = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <div className="space-y-6">
            {/* Modern Drag & Drop PDF Upload Area */}
            <StockOpnameUploadZone
                onParsed={handlePdfParsed}
                isStaff={isStaff}
                userWarehouseIds={user.warehouseIds}
                masterWarehouses={masterWarehouses}
                disabled={isMatching}
            />

            {/* Riwayat Log Table */}
            <StockOpnameLogTable
                onViewDetail={handleViewDetail}
                refreshTrigger={refreshTrigger}
            />

            {/* Dialog Hasil Parsing & Rekonsiliasi */}
            <StockOpnameResultDialog
                open={showResultDialog}
                onOpenChange={setShowResultDialog}
                warehouseId={warehouseId}
                warehouseName={warehouseName}
                results={stockResults}
                isStaff={isStaff}
                onSaved={handleDataChanged}
            />

            {/* Dialog Detail Log Rekonsiliasi */}
            <StockOpnameDetailPane
                open={showDetailPane}
                onOpenChange={setShowDetailPane}
                log={selectedLog}
                isStaff={isStaff}
                onUpdated={handleDataChanged}
            />
        </div>
    );
}
