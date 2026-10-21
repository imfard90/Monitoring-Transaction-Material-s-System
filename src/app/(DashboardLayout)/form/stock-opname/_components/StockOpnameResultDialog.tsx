'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveStockOpname } from '../_actions/stock-opname-actions';

interface StockResult {
    material_code: string;
    material_name: string;
    qty_system: number;
    qty_opname: number;
    difference: number;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    warehouseId: number;
    warehouseName: string;
    results: StockResult[];
    isStaff: boolean;
    onSaved?: () => void;
}

export function StockOpnameResultDialog({
    open,
    onOpenChange,
    warehouseId,
    warehouseName,
    results,
    isStaff,
    onSaved,
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const totalDifference = results.reduce((sum, r) => sum + Math.abs(r.difference), 0);

    const handleSave = async (status: 'pending' | 'approved') => {
        setIsSaving(true);
        try {
            const res = await saveStockOpname({
                warehouse_id: warehouseId,
                warehouse_name: warehouseName,
                details: results,
                status,
            });

            if (!res.success) {
                toast.error(res.error ?? 'Gagal menyimpan');
                return;
            }

            toast.success(
                status === 'approved'
                    ? 'Data tersimpan dan disetujui'
                    : 'Data tersimpan sebagai pending'
            );
            onOpenChange(false);
            onSaved?.();
        } catch (err) {
            toast.error('Terjadi kesalahan');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-sm bg-background/70 border-border/40">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">
                        Hasil Parsing Stock Opname
                    </DialogTitle>
                </DialogHeader>

                {/* Summary Card - Glassmorphic */}
                <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-4 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Gudang</span>
                        <span className="font-semibold">{warehouseName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total Item</span>
                        <span className="font-semibold">{results.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total Selisih</span>
                        <span className="font-semibold text-destructive">{totalDifference}</span>
                    </div>
                </div>

                {/* Table - Glassmorphic */}
                <div className="flex-1 overflow-auto rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Kode
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Nama Material
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Qty System
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Qty Opname
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Selisih
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {results.map((row, idx) => (
                                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 text-sm font-mono">
                                        {row.material_code}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{row.material_name}</td>
                                    <td className="px-4 py-3 text-sm text-right font-mono">
                                        {row.qty_system}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-mono">
                                        {row.qty_opname}
                                    </td>
                                    <td
                                        className={`px-4 py-3 text-sm text-right font-mono font-semibold ${
                                            row.difference > 0
                                                ? 'text-green-600 dark:text-green-400'
                                                : row.difference < 0
                                                  ? 'text-destructive'
                                                  : 'text-muted-foreground'
                                        }`}
                                    >
                                        {row.difference > 0 ? '+' : ''}
                                        {row.difference}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
                    {isStaff ? (
                        <Button onClick={() => handleSave('pending')} disabled={isSaving}>
                            {isSaving ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleSave('pending')}
                                disabled={isSaving}
                            >
                                Simpan sebagai Pending
                            </Button>
                            <Button onClick={() => handleSave('approved')} disabled={isSaving}>
                                {isSaving ? 'Menyimpan...' : 'Simpan & Approve'}
                            </Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
