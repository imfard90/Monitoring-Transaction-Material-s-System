'use client';

import { format } from 'date-fns';
import { LoaderCircle } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/app/components/shared/DataTable';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@/lib/table';
import { cn } from '@/lib/utils';
import type {
    StockComparisonItem,
    StockComparisonResult,
} from '../_actions/stock-comparison.types';

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
                cell: (info) => {
                    const isZero =
                        info.row.original.stock_lensa === 0 && info.row.original.stock_mtms === 0;
                    return (
                        <span
                            className={cn(
                                'font-mono text-xs whitespace-nowrap',
                                isZero
                                    ? 'text-muted-foreground/60'
                                    : 'font-semibold text-foreground'
                            )}
                        >
                            {info.getValue()}
                        </span>
                    );
                },
            }),
            detailColumnHelper.accessor('nama_material', {
                header: () => <div className="pl-3">Nama Material</div>,
                cell: (info) => {
                    const isZero =
                        info.row.original.stock_lensa === 0 && info.row.original.stock_mtms === 0;
                    return (
                        <div
                            className={cn(
                                'pl-3 whitespace-normal wrap-break-words text-xs leading-snug',
                                isZero
                                    ? 'text-muted-foreground/60 font-normal'
                                    : 'font-medium text-foreground'
                            )}
                        >
                            {info.getValue()}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('satuan', {
                header: () => <div className="text-center">Satuan</div>,
                size: 65,
                cell: (info) => {
                    const isZero =
                        info.row.original.stock_lensa === 0 && info.row.original.stock_mtms === 0;
                    return (
                        <div
                            className={cn(
                                'text-center text-xs font-mono',
                                isZero ? 'text-muted-foreground/40' : 'text-muted-foreground'
                            )}
                        >
                            {info.getValue() || '—'}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('stock_lensa', {
                header: () => <div className="text-center">Lensa</div>,
                size: 65,
                cell: (info) => {
                    const { exclude_qty, exclude_type, raw_stock_lensa } = info.row.original;
                    const val = info.getValue();
                    const isZero = val === 0 && info.row.original.stock_mtms === 0;

                    if (exclude_qty && exclude_qty > 0) {
                        const isAdd = exclude_type === 'add';
                        return (
                            <div className="flex justify-center">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            className={cn(
                                                'text-center font-mono text-xs font-bold px-1.5 py-0.5 rounded border cursor-help',
                                                isAdd
                                                    ? 'text-blue-800 bg-blue-100 dark:text-blue-300 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800'
                                                    : 'text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800'
                                            )}
                                        >
                                            {val}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="font-medium">
                                            {isAdd
                                                ? `Normalisasi: +${exclude_qty}`
                                                : `Exclude: -${exclude_qty}`}
                                        </p>
                                        {raw_stock_lensa !== undefined && (
                                            <p className="text-[10px] text-muted-foreground">
                                                (Lensa asli: {raw_stock_lensa})
                                            </p>
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        );
                    }

                    if (val < 0) {
                        return (
                            <div className="text-center font-mono text-xs font-semibold text-destructive">
                                {val}
                            </div>
                        );
                    }

                    if (val === 0) {
                        return (
                            <div
                                className={cn(
                                    'text-center font-mono text-xs',
                                    isZero
                                        ? 'text-muted-foreground/40 font-normal'
                                        : 'text-muted-foreground font-medium'
                                )}
                            >
                                0
                            </div>
                        );
                    }

                    return (
                        <div className="text-center font-mono text-xs font-bold text-foreground">
                            {val}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('stock_mtms', {
                header: () => <div className="text-center">MTMS</div>,
                size: 60,
                cell: (info) => {
                    const val = info.getValue();
                    const isZero = val === 0 && info.row.original.stock_lensa === 0;
                    if (val === 0) {
                        return (
                            <div
                                className={cn(
                                    'text-center font-mono text-xs',
                                    isZero
                                        ? 'text-muted-foreground/40 font-normal'
                                        : 'text-muted-foreground font-medium'
                                )}
                            >
                                0
                            </div>
                        );
                    }
                    return (
                        <div className="text-center font-mono text-xs font-bold text-primary">
                            {val}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('selisih', {
                header: () => <div className="text-center">Selisih</div>,
                size: 65,
                cell: (info) => {
                    const val = info.getValue();
                    const isZero =
                        info.row.original.stock_lensa === 0 && info.row.original.stock_mtms === 0;
                    if (val === 0) {
                        return (
                            <div
                                className={cn(
                                    'text-center font-mono text-xs',
                                    isZero ? 'text-muted-foreground/40' : 'text-muted-foreground/70'
                                )}
                            >
                                0
                            </div>
                        );
                    }
                    return (
                        <div className="text-center text-destructive font-mono font-bold text-xs bg-destructive/10 px-1 py-0.5 rounded">
                            {val > 0 ? `+${val}` : val}
                        </div>
                    );
                },
            }),
            detailColumnHelper.accessor('match_status', {
                header: () => <div className="text-center">Status</div>,
                size: 80,
                cell: (info) => {
                    const isZero =
                        info.row.original.stock_lensa === 0 && info.row.original.stock_mtms === 0;
                    const status = info.getValue();
                    if (status === 'match') {
                        if (isZero) {
                            return (
                                <div className="flex justify-center">
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 border-border/60 text-muted-foreground/50 font-normal"
                                    >
                                        Sesuai (0)
                                    </Badge>
                                </div>
                            );
                        }
                        return (
                            <div className="flex justify-center">
                                <Badge
                                    variant="lightSuccess"
                                    className="capitalize text-[11px] px-2 py-0.5 border-0 font-medium"
                                >
                                    Sesuai
                                </Badge>
                            </div>
                        );
                    }
                    return (
                        <div className="flex justify-center">
                            <Badge
                                variant="lightError"
                                className="capitalize text-[11px] px-2 py-0.5 border-0 font-semibold"
                            >
                                Selisih
                            </Badge>
                        </div>
                    );
                },
            }),
        ],
        []
    );

    const detailData = useMemo(() => {
        const raw = result?.items ?? [];
        return [...raw].sort((a, b) => {
            const totalB = Math.max(0, b.stock_lensa) + Math.max(0, b.stock_mtms);
            const totalA = Math.max(0, a.stock_lensa) + Math.max(0, a.stock_mtms);
            if (totalB !== totalA) {
                return totalB - totalA;
            }
            const diffSelisih = Math.abs(b.selisih) - Math.abs(a.selisih);
            if (diffSelisih !== 0) {
                return diffSelisih;
            }
            return a.nama_material.localeCompare(b.nama_material);
        });
    }, [result]);

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
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-mono">
                                    {
                                        result.items.filter(
                                            (i) => i.stock_lensa > 0 || i.stock_mtms > 0
                                        ).length
                                    }{' '}
                                    Material Aktif
                                </span>
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
                        </div>

                        <DataTable
                            table={detailTable}
                            emptyMessage="Tidak ada detail material (atau belum pernah di-scrape)."
                            maxHeight="45vh"
                            rowClassName={(row) =>
                                row.original.stock_lensa === 0 && row.original.stock_mtms === 0
                                    ? 'opacity-40 hover:opacity-100 transition-opacity bg-muted/10'
                                    : ''
                            }
                            className="rounded-md border border-border overflow-y-auto"
                            tableClassName="table-fixed whitespace-normal"
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
