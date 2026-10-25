'use client';

import { useMemo } from 'react';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { OutSapFormItem } from '@/lib/types/inventory';
import type { OutSapFormData } from './OutSapHeaderFields';

interface OutSapConfirmModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    loading: boolean;
    formData: OutSapFormData;
    selectedTech?: Record<string, unknown>;
    selectedWh?: Record<string, unknown>;
    items: OutSapFormItem[];
    materials: Record<string, unknown>[];
}

export function OutSapConfirmModal({
    isOpen,
    onOpenChange,
    onConfirm,
    loading,
    formData,
    selectedTech,
    selectedWh,
    items,
    materials,
}: OutSapConfirmModalProps) {
    const totalQty = useMemo(
        () => items.reduce((acc, curr) => acc + (Number(curr.qty_req) || 0), 0),
        [items]
    );

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title="Konfirmasi SAP Out"
            description="Pastikan material dan teknisi sudah benar. Transaksi ini akan langsung memotong stok gudang."
            onConfirm={onConfirm}
            loading={loading}
        >
            <div className="space-y-4">
                {/* Ringkasan Header Transaksi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm bg-muted/40 p-4 rounded-xl border border-border/70">
                    <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Teknisi Penerima:
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-foreground">
                                {String(selectedTech?.name ?? '-')}
                            </span>
                            {Boolean(selectedTech?.nik) && (
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-background border border-border/60 text-muted-foreground">
                                    {String(selectedTech?.nik)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Area Layanan:
                        </span>
                        <span className="font-medium text-foreground">
                            {formData.name_sa || '-'}
                        </span>
                    </div>
                    <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Gudang Asal:
                        </span>
                        <span className="font-medium text-foreground">
                            {String(selectedWh?.name ?? '-')}
                        </span>
                    </div>
                    <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Nomor SAP:
                        </span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                            {formData.sap_number || '-'}
                        </span>
                    </div>
                    {formData.id_reservasi && (
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                ID Reservasi:
                            </span>
                            <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                {formData.id_reservasi}
                            </span>
                        </div>
                    )}
                    {formData.request_id && (
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                Request ID:
                            </span>
                            <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                {formData.request_id}
                            </span>
                        </div>
                    )}
                </div>

                {/* Daftar Material */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">
                            Daftar Material
                        </h4>
                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/40">
                            {items.length} item material
                        </span>
                    </div>

                    <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs">
                        <div className="max-h-[260px] overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-muted/80 backdrop-blur-xs sticky top-0 z-10 border-b border-border">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-12 text-center text-[11px] font-semibold uppercase tracking-wider">
                                            No
                                        </TableHead>
                                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider">
                                            Material
                                        </TableHead>
                                        <TableHead className="w-24 text-center text-[11px] font-semibold uppercase tracking-wider">
                                            Jumlah
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, idx) => {
                                        const mat = materials?.find(
                                            (m: Record<string, unknown>) =>
                                                m.id?.toString() === item.designator_id
                                        );
                                        return (
                                            <TableRow
                                                key={item.id || idx}
                                                className="hover:bg-muted/40 transition-colors"
                                            >
                                                <TableCell className="text-center text-xs font-mono text-muted-foreground">
                                                    {idx + 1}
                                                </TableCell>
                                                <TableCell className="py-2.5">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-mono text-xs font-semibold text-primary">
                                                            {String(mat?.code ?? '-')}
                                                        </span>
                                                        <span
                                                            className="text-xs text-muted-foreground line-clamp-1"
                                                            title={String(mat?.description ?? '')}
                                                        >
                                                            {String(mat?.description ?? '-')}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-sm text-foreground">
                                                    <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                        {item.qty_req}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                                <TableFooter className="bg-muted/50 border-t border-border font-medium">
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell
                                            colSpan={2}
                                            className="text-right text-xs font-semibold uppercase tracking-wider"
                                        >
                                            Total Unit Kuantitas:
                                        </TableCell>
                                        <TableCell className="text-center font-mono font-bold text-sm text-primary">
                                            {totalQty}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </ConfirmDialog>
    );
}
