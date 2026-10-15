'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getOtherWarehouseStock } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import type { OtherStockItem } from '@/app/(DashboardLayout)/_actions/dashboard-queries';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { RegionalCombobox } from '@/app/components/shared/RegionalCombobox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface OtherStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    materialCode: string;
    materialName: string;
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder rows
                <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
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

export function OtherStockModal({
    isOpen,
    onClose,
    materialCode,
    materialName,
}: OtherStockModalProps) {
    const [selectedRegional, setSelectedRegional] = useState<string>('all');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['otherWarehouseStock', materialCode],
        queryFn: () => getOtherWarehouseStock(materialCode),
        enabled: isOpen && materialCode.length > 0,
        staleTime: 1000 * 60 * 5,
        retry: 1,
    });

    // Reset filter when modal opens with a new material
    // (using key on modal instead would remount; useState reset on isOpen change is simpler)
    const allRows: OtherStockItem[] = data?.success ? data.data : [];

    const fetchError = isError
        ? error instanceof Error
            ? error.message
            : 'Terjadi kesalahan.'
        : !data?.success && data?.error
          ? data.error
          : null;

    // Derive sorted unique regionals from all rows
    const regionalOptions = useMemo(
        () => [...new Set(allRows.map((r) => r.regional))].sort(),
        [allRows]
    );

    // Apply regional filter client-side (data already fetched)
    const rows = useMemo(
        () =>
            selectedRegional === 'all' || selectedRegional === ''
                ? allRows
                : allRows.filter((r) => r.regional === selectedRegional),
        [allRows, selectedRegional]
    );

    const totalStock = rows.reduce((s, r) => s + r.stockH1, 0);
    const isFiltered = selectedRegional !== 'all' && selectedRegional !== '';

    return (
        <ModalDialog
            isOpen={isOpen}
            onClose={() => {
                setSelectedRegional('all');
                onClose();
            }}
            className="flex max-h-[85dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden p-4 sm:w-full sm:p-6 sm:max-w-5xl"
            title={
                <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="shrink-0">Stock Material</span>
                    <Badge
                        variant="outline"
                        className="shrink-0 rounded-md border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-sm"
                    >
                        {materialCode}
                    </Badge>
                    <span className="min-w-0 truncate font-normal text-muted-foreground">
                        ({materialName || 'Nama material tidak tersedia'})
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
                        <span>Stock di gudang lainnya posisi H-1, Source Google Sheet Area</span>
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
                {/* Error state */}
                {fetchError && !isLoading && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{fetchError}</span>
                    </div>
                )}

                {/* Table: only this region scrolls; the dialog heading and filters stay in place. */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
                    <div className="min-h-0 flex-1 overflow-auto overscroll-contain [&_[data-slot=table-container]]:overflow-visible">
                        <div className="min-w-[760px] sm:min-w-0">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Regional
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Branch
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Gudang
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Kode Material
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Nama Material
                                        </TableHead>
                                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Stock H-1
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <SkeletonRows />
                                    ) : rows.length === 0 && !fetchError ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={6}
                                                className="py-10 text-center text-sm text-muted-foreground"
                                            >
                                                {isFiltered
                                                    ? `Tidak ada stok untuk regional "${selectedRegional}".`
                                                    : 'Tidak ada stok material ini di gudang lain.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.map((row, idx) => (
                                            <TableRow
                                                // biome-ignore lint/suspicious/noArrayIndexKey: rows sorted server-side, no stable ID
                                                key={`${row.gudang}-${row.branch}-${idx}`}
                                                className="transition-colors hover:bg-muted/30"
                                            >
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {row.regional}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium whitespace-nowrap">
                                                    {row.branch}
                                                </TableCell>
                                                <TableCell className="text-sm whitespace-nowrap">
                                                    {row.gudang}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex rounded-md border border-border/70 bg-muted/60 px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-sm whitespace-nowrap">
                                                        {row.materialCode}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm max-w-[240px] truncate">
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

                {/* Footer summary */}
                {!isLoading && rows.length > 0 && (
                    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <span>
                            {rows.length} gudang ditemukan
                            {isFiltered && (
                                <span className="ml-1 font-medium text-primary">
                                    · {selectedRegional}
                                </span>
                            )}
                        </span>
                        <span>
                            Total:{' '}
                            <span className="font-semibold tabular-nums text-foreground">
                                {totalStock.toLocaleString('id-ID')}
                            </span>
                        </span>
                    </div>
                )}
            </div>
        </ModalDialog>
    );
}
