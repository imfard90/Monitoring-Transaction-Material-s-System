'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { approveStockOpname, rejectStockOpname } from '../_actions/stock-opname-actions';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    log: StockOpnameLog | null;
    isStaff: boolean;
    onUpdated?: () => void;
}

export function StockOpnameDetailPane({ open, onOpenChange, log, isStaff, onUpdated }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    if (!log) return null;

    const handleApprove = async () => {
        setIsProcessing(true);
        try {
            const res = await approveStockOpname({ id: log.id });
            if (!res.success) {
                toast.error(res.error ?? 'Gagal approve');
                return;
            }
            toast.success('Stock opname disetujui');
            onOpenChange(false);
            onUpdated?.();
        } catch (err) {
            toast.error('Terjadi kesalahan');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim() || rejectReason.length < 5) {
            toast.error('Alasan minimal 5 karakter');
            return;
        }

        setIsProcessing(true);
        try {
            const res = await rejectStockOpname({ id: log.id, reason: rejectReason });
            if (!res.success) {
                toast.error(res.error ?? 'Gagal reject');
                return;
            }
            toast.success('Stock opname ditolak');
            setShowRejectDialog(false);
            onOpenChange(false);
            onUpdated?.();
        } catch (err) {
            toast.error('Terjadi kesalahan');
        } finally {
            setIsProcessing(false);
        }
    };

    const statusBadge = (status: string) => {
        const variants = {
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        };
        return (
            <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${variants[status as keyof typeof variants]}`}
            >
                {status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Rejected'}
            </span>
        );
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-sm bg-background/70 border-border/40">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold">
                            Detail Stock Opname
                        </DialogTitle>
                    </DialogHeader>

                    {/* Info Header - Glassmorphic */}
                    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-4">
                        <div className="space-y-3">
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    ID
                                </span>
                                <p className="font-mono font-semibold">{log.id}</p>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Gudang
                                </span>
                                <p className="font-semibold">{log.warehouse_name}</p>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Total Item
                                </span>
                                <p className="font-mono font-semibold">{log.total_items}</p>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Total Selisih
                                </span>
                                <p className="font-mono font-semibold text-destructive">
                                    {log.total_difference}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Status
                                </span>
                                <div className="mt-1">{statusBadge(log.status)}</div>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Dibuat Oleh
                                </span>
                                <p className="font-mono">{log.created_by}</p>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Tanggal
                                </span>
                                <p className="text-sm">
                                    {format(log.created_at, 'dd MMMM yyyy HH:mm', {
                                        locale: localeId,
                                    })}
                                </p>
                            </div>
                            {log.approved_by && (
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                        {log.status === 'approved'
                                            ? 'Disetujui Oleh'
                                            : 'Ditolak Oleh'}
                                    </span>
                                    <p className="font-mono">{log.approved_by}</p>
                                    {log.approved_at && (
                                        <p className="text-xs text-muted-foreground">
                                            {format(log.approved_at, 'dd MMM yyyy HH:mm', {
                                                locale: localeId,
                                            })}
                                        </p>
                                    )}
                                </div>
                            )}
                            {log.approval_reason && (
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                        Alasan Penolakan
                                    </span>
                                    <p className="text-sm text-destructive">
                                        {log.approval_reason}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Material Details Table - Glassmorphic */}
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
                                {log.details.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 text-sm font-mono">
                                            {item.material_code}
                                        </td>
                                        <td className="px-4 py-3 text-sm">{item.material_name}</td>
                                        <td className="px-4 py-3 text-sm text-right font-mono">
                                            {item.qty_system}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-mono">
                                            {item.qty_opname}
                                        </td>
                                        <td
                                            className={`px-4 py-3 text-sm text-right font-mono font-semibold ${
                                                item.difference > 0
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : item.difference < 0
                                                      ? 'text-destructive'
                                                      : 'text-muted-foreground'
                                            }`}
                                        >
                                            {item.difference > 0 ? '+' : ''}
                                            {item.difference}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Actions - Only for Non-Staff and Pending */}
                    {!isStaff && log.status === 'pending' && (
                        <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
                            <Button
                                variant="outline"
                                onClick={() => setShowRejectDialog(true)}
                                disabled={isProcessing}
                                className="gap-2"
                            >
                                <XCircle className="h-4 w-4" />
                                Tolak
                            </Button>
                            <Button
                                onClick={handleApprove}
                                disabled={isProcessing}
                                className="gap-2"
                            >
                                <Check className="h-4 w-4" />
                                {isProcessing ? 'Memproses...' : 'Setujui'}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Reject Reason Dialog */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent className="backdrop-blur-sm bg-background/90 border-border/40">
                    <DialogHeader>
                        <DialogTitle>Alasan Penolakan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            placeholder="Masukkan alasan penolakan (minimal 5 karakter)"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={4}
                            className="resize-none"
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowRejectDialog(false)}
                                disabled={isProcessing}
                            >
                                Batal
                            </Button>
                            <Button
                                onClick={handleReject}
                                disabled={isProcessing}
                                variant="destructive"
                            >
                                {isProcessing ? 'Memproses...' : 'Konfirmasi Tolak'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
