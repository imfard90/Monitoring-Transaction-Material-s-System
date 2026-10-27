'use client';

import {
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from '@tanstack/react-table';
import { LoaderCircle, Scale } from 'lucide-react';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { SearchField } from '@/components/ui/search-field';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    checkBulkScrapingStatus,
    triggerManualStockScraping,
} from '../../_actions/bulk-scraping-actions';
import {
    getLiveStockComparison,
    getStockComparison,
    getTeknisiList,
    getTeknisiStockList,
} from '../../_actions/stock-comparison-actions';
import type {
    StockComparisonResult,
    TeknisiStockListItem,
} from '../../_actions/stock-comparison.types';
import { createStockComparisonColumns } from './StockComparisonColumns';
import { StockComparisonDetailDialog } from './StockComparisonDetailDialog';
import { StockComparisonLiveDialog } from './StockComparisonLiveDialog';

interface StockComparisonTableViewProps {
    initialData: TeknisiStockListItem[];
    initialError?: string;
    isStaff?: boolean;
}

type Technician = { nik: string; name: string; nama?: string };

export default function StockComparisonTableView({
    initialData,
    initialError,
    isStaff = false,
}: StockComparisonTableViewProps) {
    const [rows, setRows] = useState<TeknisiStockListItem[]>(initialData);
    const [warehouse, setWarehouse] = useState<string>('all');
    const [globalFilter, setGlobalFilter] = useState<string>('');
    const [sorting, setSorting] = useState<SortingState>([]);
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

    const [dialog, setDialog] = useState<'compare' | 'detail' | null>(null);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selectedNik, setSelectedNik] = useState<string>('');
    const [result, setResult] = useState<StockComparisonResult | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [isScrapingStarting, setIsScrapingStarting] = useState(false);
    const [busy, startTransition] = useTransition();

    const hasActiveFilters = Boolean(
        globalFilter.trim() || (!isStaff && warehouse && warehouse !== 'all')
    );

    const handleResetFilters = useCallback(() => {
        setGlobalFilter('');
        if (!isStaff) {
            setWarehouse('all');
        }
    }, [isStaff]);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    const warehouses = useMemo(
        () =>
            [
                ...new Set(
                    rows.map((r) => r.warehouse_name).filter((v): v is string => Boolean(v))
                ),
            ].sort(),
        [rows]
    );

    const filteredData = useMemo(() => {
        if (warehouse === 'all') return rows;
        return rows.filter((r) => r.warehouse_name === warehouse);
    }, [rows, warehouse]);

    function openCompare() {
        setDialog('compare');
        setResult(null);
        setSelectedNik('');
        startTransition(async () => {
            const response = await getTeknisiList();
            if (!response.success || !response.data) {
                toast.error(response.error ?? 'Gagal memuat teknisi');
                return;
            }
            setTechnicians(response.data);
        });
    }

    function runCheck() {
        if (!selectedNik) return;
        startTransition(async () => {
            const response = await getLiveStockComparison(selectedNik);
            if (!response.success || !response.data) {
                toast.error(response.error ?? 'Perbandingan gagal');
                return;
            }
            setResult(response.data);

            const isMatch = response.data.items.every((item) => item.match_status === 'match');
            const diffCount = response.data.items.filter(
                (item) => item.match_status === 'selisih'
            ).length;

            setRows((current) =>
                current.map((row) =>
                    row.nik === selectedNik
                        ? {
                              ...row,
                              status: isMatch ? 'match' : 'selisih',
                              scraped_at: response.data?.scraped_at ?? null,
                              total_materials: response.data?.items.length ?? 0,
                              total_selisih: diffCount,
                          }
                        : row
                )
            );
            toast.success('Pengecekan live selesai');
        });
    }

    const showCached = useCallback((nik: string) => {
        setDialog('detail');
        setResult(null);
        setLoadingDetail(true);
        startTransition(async () => {
            try {
                const response = await getStockComparison(nik);
                if (response.success && response.data) {
                    setResult(response.data);
                } else {
                    toast.error(response.error ?? 'Data cache tidak tersedia');
                }
            } finally {
                setLoadingDetail(false);
            }
        });
    }, []);

    function runBulkScrape() {
        setIsScrapingStarting(true);
        const pollPromise = new Promise<{
            message?: string;
            success?: number;
            failed?: number;
            total?: number;
        }>((resolve, reject) => {
            (async () => {
                try {
                    const res = await triggerManualStockScraping();
                    setIsScrapingStarting(false);

                    if (!res.success) {
                        return reject(new Error(res.error || 'Gagal memulai scraper masal.'));
                    }

                    const interval = setInterval(async () => {
                        try {
                            const status = await checkBulkScrapingStatus(res.jobId);
                            if (status.status === 'running') {
                                // Refresh berkala agar baris tabel yang baru selesai langsung terupdate di layar
                                const refreshed = await getTeknisiStockList();
                                if (refreshed.success && refreshed.data) {
                                    setRows(refreshed.data);
                                }
                            } else if (status.status === 'success') {
                                clearInterval(interval);
                                // Refresh final setelah seluruh teknisi selesai
                                const refreshed = await getTeknisiStockList();
                                if (refreshed.success && refreshed.data) {
                                    setRows(refreshed.data);
                                }
                                resolve(status.data ?? { message: status.message });
                            } else if (status.status === 'error') {
                                clearInterval(interval);
                                reject(new Error(status.error || 'Scraping gagal'));
                            }
                        } catch (_err) {
                            // Abaikan network glitch sementara, polling tetap lanjut
                        }
                    }, 3000);
                } catch (err) {
                    setIsScrapingStarting(false);
                    reject(err);
                }
            })();
        });

        toast.promise(pollPromise, {
            loading:
                'Scraper masal sedang memproses seluruh teknisi (batch 10/gudang berjalan simultan)...',
            success: (data) =>
                data?.message ||
                `Scraper selesai: ${data?.total ?? 0} teknisi diproses (${data?.success ?? 0} berhasil, ${data?.failed ?? 0} gagal)`,
            error: (err: Error) => `Scraper gagal: ${err.message}`,
        });
    }

    const columns = useMemo(() => createStockComparisonColumns(showCached), [showCached]);

    const table = useReactTable({
        data: filteredData,
        columns,
        state: {
            sorting,
            globalFilter,
            pagination,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    return (
        <StaggerContainer className="flex flex-col gap-4 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="flex flex-col md:h-full md:min-h-0 md:overflow-hidden">
                <Card className="flex flex-col md:h-full md:min-h-0 md:overflow-hidden border-border shadow-sm">
                    <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 shrink-0">
                        <div>
                            <CardTitle className="text-xl font-bold">
                                Rekap Stok Intech Lensa vs MTMS
                            </CardTitle>
                            <CardDescription>
                                Perbandingan saldo material teknisi antara data transaksi MTMS
                                dengan sistem Lensa.
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                            {!isStaff && (
                                <WarehouseCombobox
                                    value={warehouse}
                                    onValueChange={setWarehouse}
                                    warehouses={warehouses}
                                    allLabel="Semua Gudang"
                                    placeholder="Cari gudang..."
                                    className="w-full sm:w-[190px]"
                                />
                            )}
                            <SearchField
                                value={globalFilter}
                                onValueChange={setGlobalFilter}
                                onClear={handleResetFilters}
                                placeholder="Cari NIK atau nama..."
                                wrapperClassName="flex-1 sm:w-[220px]"
                            />
                            {!isStaff && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={runBulkScrape}
                                        disabled={isScrapingStarting}
                                        className="shrink-0"
                                    >
                                        {isScrapingStarting && (
                                            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                        )}
                                        Scraper Masal
                                    </Button>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                size="icon"
                                                onClick={openCompare}
                                                className="shrink-0 shadow-sm"
                                                disabled={busy}
                                                aria-label="Bandingkan Realtime"
                                            >
                                                <Scale className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            <p>Bandingkan Realtime</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="flex flex-col md:min-h-0 md:overflow-hidden gap-4 flex-1">
                        {initialError && (
                            <p role="alert" className="text-sm text-destructive shrink-0">
                                {initialError}
                            </p>
                        )}

                        <DataTable
                            table={table}
                            emptyMessage="Tidak ada data teknisi yang ditemukan."
                            className="rounded-md border border-border flex-1 md:overflow-auto relative"
                        />

                        <div className="shrink-0">
                            <DataTablePagination table={table} />
                        </div>
                    </CardContent>
                </Card>
            </StaggerItem>

            <StockComparisonLiveDialog
                open={dialog === 'compare'}
                onOpenChange={(open) => {
                    if (!busy) setDialog(open ? 'compare' : null);
                }}
                technicians={technicians}
                selectedNik={selectedNik}
                onSelectNik={setSelectedNik}
                onRunCheck={runCheck}
                busy={busy}
                result={result}
            />

            <StockComparisonDetailDialog
                open={dialog === 'detail'}
                onOpenChange={(open) => {
                    if (!busy) setDialog(open ? 'detail' : null);
                }}
                result={result}
                loading={loadingDetail}
                busy={busy}
            />
        </StaggerContainer>
    );
}
