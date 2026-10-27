'use client';

import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { format } from 'date-fns';
import { LoaderCircle } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/app/components/shared/DataTable';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type {
    StockComparisonItem,
    StockComparisonResult,
} from '../../_actions/stock-comparison.types';

const detailColumnHelper = createColumnHelper<StockComparisonItem>();

interface TechnicianOption {
    nik: string;
    name: string;
    nama?: string;
}

interface StockComparisonLiveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    technicians: TechnicianOption[];
    selectedNik: string;
    onSelectNik: (nik: string) => void;
    onRunCheck: () => void;
    busy: boolean;
    result: StockComparisonResult | null;
}

export function StockComparisonLiveDialog({
    open,
    onOpenChange,
    technicians,
    selectedNik,
    onSelectNik,
    onRunCheck,
    busy,
    result,
}: StockComparisonLiveDialogProps) {
    const technicianOptions = useMemo(() => {
        return technicians.map((t) => ({
            value: t.nik,
            label: `${t.nik} — ${t.name || t.nama || ''}`,
        }));
    }, [technicians]);

    const detailColumns = useMemo(
        () => [
            detailColumnHelper.accessor('id_material', {
                header: 'ID Material',
                size: 105,
                cell: (info) => (
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {info.getValue()}
                    </span>
                ),
            }),
            detailColumnHelper.accessor('nama_material', {
                header: () => <div className="pl-3">Nama Material</div>,
                cell: (info) => (
                    <div className="pl-3 whitespace-normal break-words text-xs font-medium text-foreground leading-snug">
                        {info.getValue()}
                    </div>
                ),
            }),
            detailColumnHelper.accessor('satuan', {
                header: () => <div className="text-center">Satuan</div>,
                size: 65,
                cell: (info) => (
                    <div className="text-center text-xs font-mono text-muted-foreground">
                        {info.getValue() || '—'}
                    </div>
                ),
            }),
            detailColumnHelper.accessor('stock_lensa', {
                header: () => <div className="text-center">Lensa</div>,
                size: 60,
                cell: (info) => (
                    <div className="text-center font-mono text-xs font-medium text-foreground">
                        {info.getValue()}
                    </div>
                ),
            }),
            detailColumnHelper.accessor('stock_mtms', {
                header: () => <div className="text-center">MTMS</div>,
                size: 60,
                cell: (info) => (
                    <div className="text-center font-mono text-xs font-medium text-foreground">
                        {info.getValue()}
                    </div>
                ),
            }),
            detailColumnHelper.accessor('selisih', {
                header: () => <div className="text-center">Selisih</div>,
                size: 65,
                cell: (info) => {
                    const val = info.getValue();
                    if (val === 0) {
                        return (
                            <div className="text-center text-muted-foreground font-mono text-xs">
                                0
                            </div>
                        );
                    }
                    return (
                        <div className="text-center text-destructive font-mono font-semibold text-xs">
                            {val > 0 ? `+${val}` : val}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('match_status', {
                header: () => <div className="text-center">Status</div>,
                size: 80,
                cell: (info) => (
                    <div className="flex justify-center">
                        <Badge
                            variant={info.getValue() === 'match' ? 'lightSuccess' : 'lightError'}
                            className="capitalize text-[11px] px-2 py-0.5 border-0 font-medium"
                        >
                            {info.getValue() === 'match' ? 'Sesuai' : 'Selisih'}
                        </Badge>
                    </div>
                ),
            }),
        ],
        []
    );

    const detailData = useMemo(() => result?.items ?? [], [result]);

    const detailTable = useReactTable({
        data: detailData,
        columns: detailColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!busy) onOpenChange(isOpen);
            }}
        >
            <DialogContent
                className="max-w-3xl max-h-[85vh] overflow-y-auto"
                onEscapeKeyDown={(event) => {
                    if (busy) event.preventDefault();
                }}
                onPointerDownOutside={(event) => {
                    if (busy) event.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Bandingkan Stok Realtime</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            Pilih Teknisi{' '}
                            {technicians.length > 0 && `(${technicians.length} tersedia)`}
                        </Label>
                        <SearchableSelect
                            options={technicianOptions}
                            value={selectedNik}
                            onValueChange={onSelectNik}
                            placeholder={
                                busy && technicians.length === 0
                                    ? 'Memuat daftar teknisi...'
                                    : 'Pilih atau cari teknisi (NIK / Nama)...'
                            }
                            emptyText="Teknisi tidak ditemukan."
                            disabled={busy || technicians.length === 0}
                            className="h-10"
                        />
                    </div>

                    <Button
                        onClick={onRunCheck}
                        disabled={busy || !selectedNik}
                        className="w-full shadow-sm"
                    >
                        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        {busy ? 'Memeriksa stok Lensa...' : 'Periksa Stok'}
                    </Button>
                </div>

                {result && (
                    <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 border border-border p-3.5">
                            <div>
                                <p className="font-semibold text-foreground text-base">
                                    {result.nama_teknisi} ({result.nik_teknisi})
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {result.warehouse_name ?? 'Tanpa gudang'} · Scraped:{' '}
                                    {result.scraped_at
                                        ? format(new Date(result.scraped_at), 'dd/MM/yyyy HH:mm:ss')
                                        : '—'}
                                </p>
                            </div>
                            <Badge
                                variant={
                                    result.items.every((i) => i.match_status === 'match')
                                        ? 'lightSuccess'
                                        : 'lightError'
                                }
                                className="capitalize text-xs font-semibold px-3 py-1"
                            >
                                {result.items.every((i) => i.match_status === 'match')
                                    ? 'Semua Sesuai'
                                    : `${result.items.filter((i) => i.match_status === 'selisih').length} Material Selisih`}
                            </Badge>
                        </div>

                        <DataTable
                            table={detailTable}
                            emptyMessage="Tidak ada detail material (atau belum pernah di-scrape)."
                            maxHeight="45vh"
                            className="rounded-md border border-border overflow-y-auto"
                            tableClassName="table-fixed whitespace-normal"
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
