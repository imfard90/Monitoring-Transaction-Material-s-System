'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RegionalCombobox } from '@/app/components/shared/RegionalCombobox';
import { Badge } from '@/components/ui/badge';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { getOtherLocationStock } from '../_actions/live-stock-queries';
import type { StockItem } from '../_lib/stock-status';

interface OtherStockDialogProps {
    /** Baris yang dipilih; null menutup dialog. */
    item: StockItem | null;
    onClose: () => void;
}

const headClass =
    'text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';

const COLUMN_COUNT = 6;

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder rows
                <TableRow key={i}>
                    {Array.from({ length: COLUMN_COUNT }).map((__, j) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder cells
                        <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </>
    );
}

/**
 * Stok material yang sama di lokasi di luar 5 gudang MTMS (Karangpilang, Gresik,
 * Lamongan, Tuban, Bojonegoro). Sumber: cache Google Sheets "DATA KEMARIN"
 * (data/other-stock.json) yang disinkronkan harian — bukan tabel stock_balance.
 */
export function OtherStockDialog({ item, onClose }: OtherStockDialogProps) {
    const [selectedRegional, setSelectedRegional] = useState<string>('all');
    const materialCode = item?.material_code ?? '';

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['otherLocationStock', materialCode],
        queryFn: () => getOtherLocationStock(materialCode),
        enabled: item !== null && materialCode.length > 0,
        staleTime: 1000 * 60 * 5,
        retry: 1,
    });

    const allRows = data?.success ? data.data.items : [];

    const fetchError = isError
        ? error instanceof Error
            ? error.message
            : 'Terjadi kesalahan.'
        : !data?.success && data?.error
          ? data.error
          : null;

    const regionalOptions = useMemo(
        () => [...new Set(allRows.map((row) => row.regional))].sort(),
        [allRows]
    );

    const rows = useMemo(
        () =>
            selectedRegional === 'all' || selectedRegional === ''
                ? allRows
                : allRows.filter((row) => row.regional === selectedRegional),
        [allRows, selectedRegional]
    );

    const totalStock = rows.reduce((sum, row) => sum + row.stockH1, 0);
    const isFiltered = selectedRegional !== 'all' && selectedRegional !== '';

    return (
        <ModalDialog
            isOpen={item !== null}
            onClose={() => {
                setSelectedRegional('all');
                onClose();
            }}
            className="flex max-h-[85dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden p-4 sm:w-full sm:p-6 sm:max-w-5xl"
            title={
                <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="shrink-0">Stok Lokasi Lain</span>
                    <Badge
                        variant="outline"
                        className="shrink-0 rounded-md border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-sm"
                    >
                        {materialCode}
                    </Badge>
                    <span className="min-w-0 truncate font-normal text-muted-foreground">
                        ({item?.material_name || 'Nama material tidak tersedia'})
                    </span>
                </span>
            }
            description={null}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span
                            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                            aria-hidden="true"
                        />
                        <span>Stok di luar gudang MTMS (posisi H-1, sumber Google Sheets).</span>
                    </p>
                    {!isLoading && !fetchError && allRows.length > 0 && (
                        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                            <span className="text-xs text-muted-foreground">Filter regional:</span>
                            <RegionalCombobox
                                value={selectedRegional}
                                onValueChange={setSelectedRegional}
                                regionals={regionalOptions}
                                disabled={isLoading}
                            />
                            {isFiltered && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedRegional('all')}
                                    className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {fetchError && !isLoading && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{fetchError}</span>
                    </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
                    <div className="min-h-0 flex-1 overflow-auto overscroll-contain [&_[data-slot=table-container]]:overflow-visible">
                        <div className="min-w-[760px] sm:min-w-0">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className={headClass}>Regional</TableHead>
                                        <TableHead className={headClass}>Branch</TableHead>
                                        <TableHead className={headClass}>Gudang</TableHead>
                                        <TableHead className={headClass}>Kode Material</TableHead>
                                        <TableHead className={headClass}>Nama Material</TableHead>
                                        <TableHead className={`${headClass} text-right`}>
                                            Stok H-1
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <SkeletonRows />
                                    ) : rows.length === 0 && !fetchError ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={COLUMN_COUNT}
                                                className="py-10 text-center text-sm text-muted-foreground"
                                            >
                                                {isFiltered
                                                    ? `Tidak ada stok untuk regional "${selectedRegional}".`
                                                    : 'Tidak ada stok material ini di lokasi lain.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.map((row, index) => (
                                            <TableRow
                                                // biome-ignore lint/suspicious/noArrayIndexKey: gudang+branch tidak dijamin unik
                                                key={`${row.gudang}-${row.branch}-${index}`}
                                                className="transition-colors hover:bg-muted/30"
                                            >
                                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                                    {row.regional}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                                    {row.branch}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-sm font-medium">
                                                    {row.gudang}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap font-mono text-sm text-muted-foreground">
                                                    {row.materialCode}
                                                </TableCell>
                                                <TableCell className="max-w-[240px] truncate text-sm">
                                                    <span title={row.materialName}>
                                                        {row.materialName}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="font-bold tabular-nums text-primary">
                                                        {row.stockH1.toLocaleString('id-ID')}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                {!isLoading && !fetchError && rows.length > 0 && (
                    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <span>
                            {rows.length} lokasi ditemukan
                            {isFiltered && (
                                <span className="ml-1 font-medium text-primary">
                                    · {selectedRegional}
                                </span>
                            )}
                        </span>
                        <span>
                            Total:{' '}
                            <span className="font-semibold tabular-nums text-foreground">
                                {totalStock.toLocaleString('id-ID')} {item?.material_unit}
                            </span>
                        </span>
                    </div>
                )}
            </div>
        </ModalDialog>
    );
}
