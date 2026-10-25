'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, LoaderCircle, Scale } from 'lucide-react';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
    type StockComparisonItem,
    type StockComparisonResult,
    type TeknisiStockListItem,
} from '../../_actions/stock-comparison-actions';

interface StockComparisonTableViewProps {
    initialData: TeknisiStockListItem[];
    initialError?: string;
    isStaff?: boolean;
}

type Technician = { nik: string; name: string; nama?: string };

const columnHelper = createColumnHelper<TeknisiStockListItem>();
const detailColumnHelper = createColumnHelper<StockComparisonItem>();

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
        const pollPromise = new Promise<{ message?: string; success?: number; failed?: number }>(
            (resolve, reject) => {
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
                                if (status.status === 'success') {
                                    clearInterval(interval);
                                    // Refresh data tabel otomatis setelah scraping selesai
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
            }
        );

        toast.promise(pollPromise, {
            loading: 'Scraper masal stok teknisi berjalan di latar belakang...',
            success: (data) =>
                data?.message ||
                `Scraper selesai: ${data?.success ?? 0} berhasil, ${data?.failed ?? 0} gagal`,
            error: (err: Error) => `Scraper gagal: ${err.message}`,
        });
    }

    const technicianOptions = useMemo(() => {
        return technicians.map((t) => ({
            value: t.nik,
            label: `${t.nik} — ${t.name || t.nama || ''}`,
        }));
    }, [technicians]);

    const columns = useMemo(
        () => [
            columnHelper.accessor('branch', {
                header: 'Branch',
                cell: (info) => info.getValue() || '—',
            }),
            columnHelper.accessor('service_area', {
                header: 'Service Area',
                cell: (info) => info.getValue() || '—',
            }),
            columnHelper.accessor('warehouse_name', {
                header: 'Gudang',
                cell: (info) => info.getValue() || '—',
            }),
            columnHelper.accessor('nik', {
                header: 'NIK',
                cell: (info) => <span className="font-mono">{info.getValue()}</span>,
            }),
            columnHelper.accessor('nama', {
                header: 'Nama Teknisi',
                cell: (info) => (
                    <span className="font-medium text-foreground">{info.getValue()}</span>
                ),
            }),
            columnHelper.accessor('status', {
                header: 'Status',
                cell: (info) => {
                    const status = info.getValue();
                    let variant: 'lightSuccess' | 'lightError' | 'outline' = 'outline';
                    let label = 'Belum dicek';
                    if (status === 'match') {
                        variant = 'lightSuccess';
                        label = 'Sesuai';
                    } else if (status === 'selisih') {
                        variant = 'lightError';
                        label = 'Selisih';
                    } else if (status === 'failed') {
                        variant = 'lightError';
                        label = 'Gagal';
                    }
                    return (
                        <Badge variant={variant} className="capitalize">
                            {label}
                        </Badge>
                    );
                },
            }),
            columnHelper.accessor('total_selisih', {
                header: 'Selisih Material',
                cell: (info) => {
                    const row = info.row.original;
                    if (row.total_selisih !== null && row.total_selisih > 0) {
                        return (
                            <span className="font-semibold text-destructive font-mono">
                                {row.total_selisih} item
                            </span>
                        );
                    }
                    if (row.status === 'match') {
                        return <span className="text-muted-foreground font-mono">0 item</span>;
                    }
                    return <span className="text-muted-foreground font-mono">—</span>;
                },
            }),
            columnHelper.accessor('scraped_at', {
                header: 'Terakhir Dicek',
                cell: (info) => {
                    const val = info.getValue();
                    if (!val) return <span className="text-muted-foreground text-xs">—</span>;
                    try {
                        return (
                            <span className="text-xs text-muted-foreground font-mono">
                                {format(new Date(val), 'dd/MM/yyyy HH:mm')}
                            </span>
                        );
                    } catch {
                        return <span className="text-xs text-muted-foreground">{val}</span>;
                    }
                },
            }),
            columnHelper.display({
                id: 'actions',
                header: 'Aksi',
                cell: (info) => (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Lihat cache ${info.row.original.nama}`}
                                onClick={() => showCached(info.row.original.nik)}
                                className="h-8 w-8 hover:bg-muted"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            <p>Lihat Detail Cache</p>
                        </TooltipContent>
                    </Tooltip>
                ),
            }),
        ],
        [showCached]
    );

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

    const detailTable = useReactTable({
        data: result?.items ?? [],
        columns: detailColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <StaggerContainer className="flex flex-col gap-4 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="md:h-full md:min-h-0 md:overflow-hidden">
                <Card className="border-border shadow-sm flex flex-col md:h-full md:min-h-0 md:overflow-hidden">
                    <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 shrink-0">
                        <div>
                            <CardTitle className="text-xl font-bold">
                                Daftar Intech Lensa vs MTMS
                            </CardTitle>
                            <CardDescription>
                                Perbandingan saldo material teknisi antara data transaksi MTMS
                                dengan sistem Lensa.
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                            <WarehouseCombobox
                                value={warehouse}
                                onValueChange={setWarehouse}
                                warehouses={warehouses}
                                allLabel="Semua Gudang"
                                placeholder="Cari gudang..."
                                className="w-full sm:w-[190px]"
                            />
                            <SearchField
                                value={globalFilter}
                                onValueChange={setGlobalFilter}
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

            <Dialog
                open={dialog !== null}
                onOpenChange={(open) => {
                    if (!busy) setDialog(open ? dialog : null);
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
                        <DialogTitle>
                            {dialog === 'compare'
                                ? 'Bandingkan Stok Realtime'
                                : 'Detail Cache Stok Teknisi'}
                        </DialogTitle>
                    </DialogHeader>

                    {dialog === 'compare' && (
                        <div className="space-y-4 pt-1">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    Pilih Teknisi{' '}
                                    {technicians.length > 0 && `(${technicians.length} tersedia)`}
                                </Label>
                                <SearchableSelect
                                    options={technicianOptions}
                                    value={selectedNik}
                                    onValueChange={setSelectedNik}
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
                                onClick={runCheck}
                                disabled={busy || !selectedNik}
                                className="w-full shadow-sm"
                            >
                                {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                {busy ? 'Memeriksa stok Lensa...' : 'Periksa Stok'}
                            </Button>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-4 pt-1">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 border border-border p-3.5">
                                <div>
                                    <p className="font-semibold text-foreground text-base">
                                        {result.nama_teknisi} ({result.nik_teknisi})
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {result.warehouse_name ?? 'Tanpa gudang'} · Scraped:{' '}
                                        {result.scraped_at
                                            ? format(
                                                  new Date(result.scraped_at),
                                                  'dd/MM/yyyy HH:mm:ss'
                                              )
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
                                isLoading={loadingDetail}
                                emptyMessage="Tidak ada detail material (atau belum pernah di-scrape)."
                                maxHeight="45vh"
                                className="rounded-md border border-border overflow-y-auto"
                                tableClassName="table-fixed whitespace-normal"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </StaggerContainer>
    );
}
