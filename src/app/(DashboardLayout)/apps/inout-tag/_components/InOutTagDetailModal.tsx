'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { ModalDialog } from '@/components/ui/modal-dialog';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';
import { getInOutTagItems, getReturnMaterialItemsByHeaderId } from '../_actions/tag-actions';

interface InOutTagDetailModalProps {
    row: InOutTagRow | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function InOutTagDetailModal({ row, isOpen, onClose }: InOutTagDetailModalProps) {
    const headerId = row?.id || null;
    const status = row?.end_status || '';

    const isReturn = row?.type === 'return';
    const { data, isLoading } = useQuery({
        queryKey: ['inoutTagItems', row?.type, headerId],
        queryFn: async () => {
            if (headerId === null) return { success: false, data: [] };
            const res = isReturn
                ? await getReturnMaterialItemsByHeaderId(Number(headerId))
                : await getInOutTagItems(Number(headerId));
            if (!res.success) throw new Error('Failed to fetch items');
            return res;
        },
        enabled: headerId !== null,
    });

    let items: InOutTagItem[] = data?.data || [];

    // Return items do not have request/send/accept actions; show all of them.
    if (!isReturn && status === 'requested') {
        items = items.filter((item: InOutTagItem) => item.action === 'request');
    } else if (!isReturn && status === 'in_transit') {
        items = items.filter((item: InOutTagItem) => item.action === 'send');
    } else if (!isReturn && status === 'closed') {
        items = items.filter((item: InOutTagItem) => item.action === 'accept');
    }

    return (
        <ModalDialog
            isOpen={isOpen}
            onClose={onClose}
            title={`Detail Item Tag (ID Trx: ${row?.id_trx})`}
            className="sm:max-w-[700px]"
        >
            <div className="py-4">
                {/* Audit Information Section */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4 p-3 bg-muted/20 border border-border rounded-lg text-xs">
                    <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">
                            Dibuat Oleh:
                        </span>
                        <span className="font-mono font-medium text-foreground">
                            {row?.created_by || '-'}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">
                            Pengirim (Send):
                        </span>
                        <span className="font-mono font-medium text-foreground">
                            {row?.send_id || '-'}
                            {row?.nik_send ? ` (${row.nik_send})` : ''}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">
                            Penerima (Accept):
                        </span>
                        <span className="font-mono font-medium text-foreground">
                            {row?.accept_id || '-'}
                            {row?.nik_accept ? ` (${row.nik_accept})` : ''}
                        </span>
                    </div>
                </div>

                {/* Notes / Reason Alert */}
                {row?.notes && (
                    <div
                        className={cn(
                            'mb-4 p-3 rounded-lg border text-xs leading-relaxed',
                            row.end_status === 'cancel'
                                ? 'bg-destructive/10 border-destructive/20 text-destructive'
                                : 'bg-muted/50 border-border text-foreground'
                        )}
                    >
                        <div className="font-semibold flex items-center gap-1.5 mb-1">
                            <AlertCircle size={14} />
                            {row.end_status === 'cancel'
                                ? 'Alasan Pembatalan Transaksi:'
                                : 'Catatan Transaksi:'}
                        </div>
                        <p className="whitespace-pre-wrap">{row.notes}</p>
                    </div>
                )}
                {isLoading ? (
                    <p className="text-center text-muted-foreground py-4" role="status">
                        Memuat data, mohon tunggu...
                    </p>
                ) : items.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4" role="status">
                        Tidak ada item untuk status tag ini.
                    </p>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm text-left text-muted-foreground">
                            <thead className="text-sm text-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-4 py-3">No</th>
                                    <th className="px-4 py-3">Designator / Kode</th>
                                    <th className="px-4 py-3">Deskripsi</th>
                                    <th className="px-4 py-3 text-right">Jumlah</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item: InOutTagItem, idx: number) => (
                                    <tr
                                        key={item.id}
                                        className="bg-background border-b hover:bg-muted/50"
                                    >
                                        <td className="px-4 py-3">{idx + 1}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {item.designator_code || item.material_code || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.material_description || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {item.qty}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </ModalDialog>
    );
}
