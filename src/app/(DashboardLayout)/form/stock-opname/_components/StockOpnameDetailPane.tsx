'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Check, XCircle, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/app/components/shared/StatusBadge';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { approveStockOpname, rejectStockOpname } from '../_actions/stock-opname-actions';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    log: StockOpnameLog | null;
    isStaff: boolean;
    onUpdated?: () => void;
}

export function StockOpnameDetailPane({ open, onOpenChange, log, isStaff, onUpdated }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showApproveConfirm, setShowApproveConfirm] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [onlyDiff, setOnlyDiff] = useState(false);

    const filteredDetails = useMemo(() => {
        if (!log?.details) return [];
        const query = searchQuery.trim().toLowerCase();
        return log.details.filter((item) => {
            if (onlyDiff && item.difference === 0) return false;
            if (!query) return true;
            return (
                item.material_code.toLowerCase().includes(query) ||
                item.material_name.toLowerCase().includes(query)
            );
        });
    }, [log?.details, searchQuery, onlyDiff]);

    if (!log) return null;

    const handleApprove = async () => {
        setIsProcessing(true);
        try {
            const res = await approveStockOpname({ id: log.id });
            if (!res.success) {
                toast.error(res.error ?? 'Gagal menyetujui stock opname');
                return;
            }
            toast.success(`Stock opname #${log.id} berhasil disetujui.`);
            setShowApproveConfirm(false);
            onOpenChange(false);
            onUpdated?.();
        } catch {
            toast.error('Terjadi kesalahan saat menyetujui');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim() || rejectReason.trim().length < 5) {
            toast.error('Alasan penolakan minimal 5 karakter');
            return;
        }

        setIsProcessing(true);
        try {
            const res = await rejectStockOpname({ id: log.id, reason: rejectReason.trim() });
            if (!res.success) {
                toast.error(res.error ?? 'Gagal menolak stock opname');
                return;
            }
            toast.success(`Stock opname #${log.id} ditolak.`);
            setShowRejectDialog(false);
            setRejectReason('');
            onOpenChange(false);
            onUpdated?.();
        } catch {
            toast.error('Terjadi kesalahan saat menolak');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-border">
                    <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <DialogTitle className="text-xl font-semibold">
                                    Detail Berita Acara Stock Opname #{log.id}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Catatan rekonsiliasi fisik vs sistem di gudang{' '}
                                    {log.warehouse_name}
                                </DialogDescription>
                            </div>
                            <div>
                                <StatusBadge status={log.status} />
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Metadata Overview Card */}
                    <div className="p-6 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-[11px] text-muted-foreground uppercase font-medium">
                                Gudang
                            </span>
                            <p className="font-semibold text-sm mt-0.5">{log.warehouse_name}</p>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-[11px] text-muted-foreground uppercase font-medium">
                                Dibuat Oleh
                            </span>
                            <p className="font-mono text-sm mt-0.5">{log.created_by}</p>
                            <span className="text-[10px] text-muted-foreground">
                                {format(log.created_at, 'dd MMM yyyy HH:mm', { locale: localeId })}
                            </span>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-[11px] text-muted-foreground uppercase font-medium">
                                Total Item
                            </span>
                            <p className="font-mono font-semibold text-sm mt-0.5">
                                {log.total_items} Material
                            </p>
                        </div>
                        <div className="rounded-lg border bg-card p-3">
                            <span className="text-[11px] text-muted-foreground uppercase font-medium">
                                Total Selisih
                            </span>
                            <p
                                className={`font-mono font-semibold text-sm mt-0.5 ${log.total_difference > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                            >
                                {log.total_difference} Unit
                            </p>
                        </div>
                    </div>

                    {/* Approver / Rejection note banner if available */}
                    {log.approved_by && (
                        <div className="mx-6 p-3 rounded-lg border bg-muted/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                                <span className="font-medium text-foreground">
                                    {log.status === 'approved'
                                        ? 'Disetujui oleh:'
                                        : 'Ditolak oleh:'}{' '}
                                </span>
                                <span className="font-mono font-semibold">{log.approved_by}</span>
                                {log.approved_at && (
                                    <span className="text-muted-foreground ml-2">
                                        pada{' '}
                                        {format(log.approved_at, 'dd MMMM yyyy HH:mm', {
                                            locale: localeId,
                                        })}
                                    </span>
                                )}
                            </div>
                            {log.approval_reason && (
                                <div className="text-destructive font-medium">
                                    Alasan: "{log.approval_reason}"
                                </div>
                            )}
                        </div>
                    )}

                    {/* Table Toolbar */}
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
                        </Button>
                    </div>

                    {/* Materials Table */}
                    <div className="flex-1 overflow-auto mx-6 mb-4 rounded-lg border border-border">
                        <table className="w-full text-sm text-left">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs border-b border-border z-10 text-xs font-semibold uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Kode Material</th>
                                    <th className="px-4 py-3">Deskripsi Material</th>
                                    <th className="px-4 py-3 text-right">Qty Sistem MTMS</th>
                                    <th className="px-4 py-3 text-right">Qty Fisik (SAP)</th>
                                    <th className="px-4 py-3 text-right">Selisih</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {filteredDetails.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="py-8 text-center text-muted-foreground text-xs"
                                        >
                                            Tidak ada material yang sesuai kriteria pencarian.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredDetails.map((item, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-muted/40 transition-colors"
                                        >
                                            <td className="px-4 py-2.5 font-mono text-xs font-medium">
                                                {item.material_code}
                                            </td>
                                            <td
                                                className="px-4 py-2.5 text-xs text-foreground/90 max-w-xs truncate"
                                                title={item.material_name}
                                            >
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
                                                {item.difference > 0
                                                    ? `+${item.difference}`
                                                    : item.difference}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Actions */}
                    <DialogFooter className="p-4 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
                        <span className="text-xs text-muted-foreground">
                            Menampilkan {filteredDetails.length} dari {log.details.length} material
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isProcessing}
                            >
                                Tutup
                            </Button>
                            {!isStaff && log.status === 'pending' && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowRejectDialog(true)}
                                        disabled={isProcessing}
                                        className="gap-2 text-destructive hover:bg-destructive/10"
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Tolak
                                    </Button>
                                    <Button
                                        onClick={() => setShowApproveConfirm(true)}
                                        disabled={isProcessing}
                                        className="gap-2"
                                    >
                                        <Check className="h-4 w-4" />
                                        Setujui
                                    </Button>
                                </>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showApproveConfirm}
                onOpenChange={setShowApproveConfirm}
                title="Konfirmasi Persetujuan Stock Opname"
                description={`Apakah Anda yakin menyetujui dokumen Stock Opname #${log.id} untuk gudang "${log.warehouse_name}"?`}
                confirmText="Ya, Setujui Dokumen"
                cancelText="Batal"
                icon={<Check className="h-4 w-4" />}
                loading={isProcessing}
                onConfirm={handleApprove}
            />

            {/* Reject Reason Dialog */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent className="sm:max-w-md border border-border">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">
                            Alasan Penolakan
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Mohon berikan alasan penolakan untuk Stock Opname #{log.id} agar staf
                            gudang dapat melakukan verifikasi ulang.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Textarea
                            placeholder="Tuliskan catatan atau alasan penolakan (minimal 5 karakter)..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={4}
                            className="resize-none text-sm"
                            autoFocus
                        />
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>{rejectReason.trim().length} / 5 karakter minimal</span>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setShowRejectDialog(false)}
                            disabled={isProcessing}
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={isProcessing || rejectReason.trim().length < 5}
                            variant="destructive"
                        >
                            {isProcessing ? 'Memproses...' : 'Konfirmasi Tolak'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
