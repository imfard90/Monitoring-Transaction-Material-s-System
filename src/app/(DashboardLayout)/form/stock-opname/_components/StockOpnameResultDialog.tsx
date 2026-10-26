'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckCircle2, AlertTriangle, Filter, Search } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { saveStockOpname } from '../_actions/stock-opname-actions';

export interface StockResult {
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
    const [searchQuery, setSearchQuery] = useState('');
    const [onlyDiff, setOnlyDiff] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'pending' | 'approved' | null>(null);

    // Summary statistics
    const stats = useMemo(() => {
        let matchCount = 0;
        let plusCount = 0;
        let minusCount = 0;
        let totalAbsDiff = 0;

        for (const r of results) {
            totalAbsDiff += Math.abs(r.difference);
            if (r.difference === 0) {
                matchCount++;
            } else if (r.difference > 0) {
                plusCount++;
            } else {
                minusCount++;
            }
        }

        return {
            total: results.length,
            matchCount,
            plusCount,
            minusCount,
            totalAbsDiff,
        };
    }, [results]);

    // Filtered materials
    const filteredResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return results.filter((item) => {
            if (onlyDiff && item.difference === 0) return false;
            if (!query) return true;
            return (
                item.material_code.toLowerCase().includes(query) ||
                item.material_name.toLowerCase().includes(query)
            );
        });
    }, [results, searchQuery, onlyDiff]);

    const executeSave = async (status: 'pending' | 'approved') => {
        setIsSaving(true);
        try {
            // Generate idempotency key for safe write
            const idemKey = `so_${warehouseId}_${Date.now()}`;
            const res = await saveStockOpname({
                warehouse_id: warehouseId,
                warehouse_name: warehouseName,
                details: results,
                status,
                idemKey,
            });

            if (!res.success) {
                toast.error(res.error ?? 'Gagal menyimpan data stock opname');
                return;
            }

            toast.success(
                status === 'approved'
                    ? 'Data stock opname berhasil disimpan dan disetujui.'
                    : 'Data stock opname berhasil disimpan (menunggu persetujuan supervisor).'
            );
            setConfirmAction(null);
            onOpenChange(false);
            onSaved?.();
        } catch {
            toast.error('Terjadi kesalahan saat menyimpan data');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-border">
                    <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30">
                        <DialogTitle className="text-xl font-semibold">
                            Hasil Rekonsiliasi Stock Opname
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            Perbandingan saldo sistem MTMS dengan hasil export BA SO SAP untuk gudang{' '}
                            <span className="font-semibold text-foreground">{warehouseName}</span>.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Summary Cards */}
                    <div className="p-6 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-xs text-muted-foreground uppercase font-medium">Total Item</span>
                            <p className="text-xl font-bold font-mono mt-0.5">{stats.total}</p>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-xs text-muted-foreground uppercase font-medium">Sesuai (Cocok)</span>
                            <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {stats.matchCount}
                            </p>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-xs text-muted-foreground uppercase font-medium">Selisih Fisik (+)</span>
                            <p className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                                +{stats.plusCount}
                            </p>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-xs text-muted-foreground uppercase font-medium">Selisih Fisik (-)</span>
                            <p className="text-xl font-bold font-mono text-destructive mt-0.5">
                                -{stats.minusCount}
                            </p>
                        </div>
                    </div>

                    {/* Table Filters */}
                    <div className="px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari kode atau nama material..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                        </div>

                        <Button
                            type="button"
                            variant={onlyDiff ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOnlyDiff((prev) => !prev)}
                            className="gap-2 self-start sm:self-auto h-9 text-xs"
                        >
                            <Filter className="h-3.5 w-3.5" />
                            {onlyDiff ? 'Tampilkan Semua Item' : 'Hanya Yang Berselisih'}
                            {stats.plusCount + stats.minusCount > 0 && (
                                <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] font-bold">
                                    {stats.plusCount + stats.minusCount}
                                </span>
                            )}
                        </Button>
                    </div>

                    {/* Materials Table */}
                    <div className="flex-1 overflow-auto mx-6 mb-4 rounded-lg border border-border">
                        <table className="w-full text-sm text-left">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs border-b border-border z-10 text-xs font-semibold uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Kode Material</th>
                                    <th className="px-4 py-3">Deskripsi Material</th>
                                    <th className="px-4 py-3 text-right">Saldo MTMS</th>
                                    <th className="px-4 py-3 text-right">Fisik (SAP)</th>
                                    <th className="px-4 py-3 text-right">Deviasi (Selisih)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {filteredResults.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                                            Tidak ada material yang sesuai kriteria pencarian.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredResults.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-4 py-2.5 font-mono text-xs font-medium">
                                                {item.material_code}
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-foreground/90 max-w-xs truncate" title={item.material_name}>
                                                {item.material_name || '-'}
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-right font-mono">
                                                {item.qty_system}
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-right font-mono font-medium">
                                                {item.qty_opname}
                                            </td>
                                            <td
                                                className={`px-4 py-2.5 text-xs text-right font-mono font-bold ${
                                                    item.difference > 0
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : item.difference < 0
                                                          ? 'text-destructive'
                                                          : 'text-muted-foreground'
                                                }`}
                                            >
                                                {item.difference > 0 ? `+${item.difference}` : item.difference}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Actions Footer */}
                    <DialogFooter className="p-4 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
                        <span className="text-xs text-muted-foreground">
                            Menampilkan {filteredResults.length} dari {results.length} material
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isSaving}
                            >
                                Tutup
                            </Button>
                            {isStaff ? (
                                <Button
                                    onClick={() => setConfirmAction('pending')}
                                    disabled={isSaving}
                                    className="gap-2"
                                >
                                    <Check className="h-4 w-4" />
                                    Simpan Pengajuan
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => setConfirmAction('pending')}
                                        disabled={isSaving}
                                    >
                                        Simpan Sebagai Pending
                                    </Button>
                                    <Button
                                        onClick={() => setConfirmAction('approved')}
                                        disabled={isSaving}
                                        className="gap-2"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Simpan & Setujui
                                    </Button>
                                </>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={confirmAction !== null}
                onOpenChange={(isOpen) => !isOpen && setConfirmAction(null)}
                title={
                    confirmAction === 'approved'
                        ? 'Konfirmasi Simpan & Setujui Stock Opname'
                        : 'Konfirmasi Simpan Pengajuan Stock Opname'
                }
                description={
                    confirmAction === 'approved'
                        ? `Anda akan menyimpan dan langsung menyetujui rekonsiliasi stock opname untuk gudang "${warehouseName}" (${stats.total} material). Tindakan ini akan tercatat permanen di log audit.`
                        : `Simpan data rekonsiliasi stock opname untuk gudang "${warehouseName}" sebagai pengajuan (Pending)? Supervisor atau Admin akan meninjau hasil sebelum disetujui.`
                }
                confirmText={confirmAction === 'approved' ? 'Ya, Simpan & Setujui' : 'Ya, Simpan Pengajuan'}
                cancelText="Batal & Periksa Kembali"
                icon={<Check className="h-4 w-4" />}
                loading={isSaving}
                onConfirm={() => confirmAction && executeSave(confirmAction)}
            />
        </>
    );
}
