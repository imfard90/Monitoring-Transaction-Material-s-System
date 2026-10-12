'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { toCanonicalWarehouseName } from '@/lib/warehouse-helper';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    checkWOScrapingStatus,
    getWOLensaRefDetails,
    triggerWOScraping,
} from '../_actions/wo-lensa-actions';

export interface WOLensaHeader {
    id: number | string;
    pemakaian_id: string | null;
    tanggal_update: string | null;
    formatted_date: string | Date | null;
    type: string | null;
    wo_number: string | null;
    nik_pemakai: string | null;
    nama_gudang: string | null;
    gi_number: string | null;
    wbs: string | null;
    rekon_check: boolean | null;
}

export interface WOLensaDetail {
    material_id: string | null;
    material_desc: string | null;
    uom: string | null;
    qty_pemakaian: number | null;
}

interface PaginationInfo {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

const columnHelper = createColumnHelper<WOLensaHeader>();
const detailColumnHelper = createColumnHelper<WOLensaDetail>();

function getTypeBadgeVariant(type: string | null): BadgeProps['variant'] {
    if (!type) return 'outline';
    const val = type.toLowerCase().trim();
    if (val === 'provisioning' || val === 'psb') return 'outline';
    if (val === 'assurance' || val === 'qe/gamas') return 'outlineWarning';
    if (val === 'maintenance') return 'outlineSecondary';
    if (val === 'myrep' || val === 'lintas_arta') return 'outlineInfo';
    return 'outline';
}

export default function WOLensaRefClient({
    initialData,
    pagination,
    error,
    isStaff = false,
    currentWarehouse = 'all',
    warehouseOptions = [],
}: {
    initialData: WOLensaHeader[];
    pagination?: PaginationInfo;
    error?: string;
    isStaff?: boolean;
    currentWarehouse?: string;
    warehouseOptions?: string[];
}) {
    const data = initialData;
    const [isStarting, setIsStarting] = useState(false);

    // For detail view
    const [detailData, setDetailData] = useState<WOLensaDetail[]>([]);
    const [selectedHeader, setSelectedHeader] = useState<WOLensaHeader | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [selectedGudang, setSelectedGudang] = useState<string>(
        toCanonicalWarehouseName(currentWarehouse)
    );
    const router = useRouter();

    const uniqueGudang = useMemo(() => {
        if (warehouseOptions && warehouseOptions.length > 0) {
            return warehouseOptions;
        }
        const list = new Set(
            initialData
                .map((d) => toCanonicalWarehouseName(d.nama_gudang))
                .filter(Boolean)
        );
        return Array.from(list).sort() as string[];
    }, [initialData, warehouseOptions]);

    const filteredData = data;

    useEffect(() => {
        if (error) {
            toast.error(error);
        }
    }, [error]);

    const handleWarehouseChange = (value: string) => {
        setSelectedGudang(value);
        const params = new URLSearchParams(window.location.search);
        if (value === 'all') {
            params.delete('warehouse');
        } else {
            params.set('warehouse', value);
        }
        if (pagination && pagination.page > 1) {
            params.set('page', '1');
        }
        const query = params.toString();
        router.push(`/apps/wo-lensa-ref${query ? `?${query}` : ''}`);
    };

    const handleRunScraping = () => {
        setIsStarting(true);
        const pollPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
            (async () => {
                try {
                    const res = await triggerWOScraping();
                    setIsStarting(false);

                    if (!res.success)
                        return reject(new Error(res.error || 'Gagal memulai proses scraping.'));

                    const interval = setInterval(async () => {
                        try {
                            const status = await checkWOScrapingStatus(res.jobId);
                            if (status.status === 'success') {
                                clearInterval(interval);
                                resolve(status.data);
                            } else if (status.status === 'error') {
                                clearInterval(interval);
                                reject(new Error(status.error));
                            }
                        } catch (_err) {
                            // ignore network errors, keep polling
                        }
                    }, 3000);
                } catch (err) {
                    setIsStarting(false);
                    reject(err);
                }
            })();
        });

        toast.promise(pollPromise, {
            loading: 'Scraping WO Lensa berjalan di latar belakang...',
            success: (data: Record<string, unknown>) =>
                (data.message as string) || 'Scraping berhasil diselesaikan!',
            error: (err: Error) => `Scraping gagal: ${err.message}`,
        });
    };

    const handleViewDetail = async (row: WOLensaHeader) => {
        setIsDialogOpen(true);
        setLoadingDetail(true);
        setSelectedHeader(row);

        const result = await getWOLensaRefDetails(row.id);

        setLoadingDetail(false);
        if (result.success && result.data) {
            setDetailData(result.data as WOLensaDetail[]);
        } else {
            toast.error(result.error || 'Gagal mengambil detail material');
        }
    };

    const columns = [
        columnHelper.accessor('pemakaian_id', {
            id: 'pemakaian_id',
            header: 'Pemakaian ID',
            size: 130,
            cell: (info) => (
                <span className="font-medium text-foreground">
                    {info.getValue() || '-'}
                </span>
            ),
        }),
        columnHelper.accessor('formatted_date', {
            id: 'formatted_date',
            header: 'Tgl Update',
            size: 110,
            sortingFn: 'datetime',
            cell: (info) => {
                const val = info.getValue();
                if (!val) return '-';
                if (val instanceof Date) return val.toLocaleDateString('id-ID');
                try {
                    return format(new Date(val), 'dd/MM/yyyy');
                } catch {
                    return String(val);
                }
            },
        }),
        columnHelper.accessor('type', {
            header: () => <div className="text-center">Type</div>,
            size: 130,
            cell: (info) => {
                const val = info.getValue();
                return (
                    <div className="flex justify-center">
                        <Badge
                            variant={getTypeBadgeVariant(val)}
                            className="capitalize"
                        >
                            {val || '-'}
                        </Badge>
                    </div>
                );
            },
        }),
        columnHelper.accessor('wo_number', {
            header: 'WO Number',
            size: 200,
            cell: (info) => (
                <div className="min-w-[160px] max-w-[260px] whitespace-normal break-words font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('nik_pemakai', {
            header: 'NIK Pemakai',
            size: 120,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_gudang', {
            header: 'Gudang',
            size: 160,
            cell: (info) => toCanonicalWarehouseName(info.getValue()) || '-',
        }),
        columnHelper.accessor('gi_number', {
            header: 'GI Number',
            size: 120,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('wbs', {
            header: 'WBS',
            size: 180,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('rekon_check', {
            header: () => <div className="text-center">Rekon</div>,
            size: 100,
            cell: (info) => {
                const val = info.getValue();
                return (
                    <div className="flex justify-center">
                        {val === true ? (
                            <Badge variant="lightSuccess">Sudah</Badge>
                        ) : (
                            <Badge variant="secondary">Belum</Badge>
                        )}
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Aksi</div>,
            size: 80,
            cell: (info) => (
                <div className="flex justify-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetail(info.row.original)}
                        title="Lihat Detail"
                        aria-label="Lihat detail material"
                    >
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            ),
        }),
    ];

    const [{ pageIndex, pageSize }, setPagination] = useState({
        pageIndex: pagination ? pagination.page - 1 : 0,
        pageSize: pagination ? pagination.pageSize : 20,
    });

    const paginationState = {
        pageIndex: pagination ? pagination.page - 1 : pageIndex,
        pageSize: pagination ? pagination.pageSize : pageSize,
    };

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualPagination: !!pagination,
        pageCount: pagination ? pagination.totalPages : undefined,
        initialState: {
            sorting: [
                { id: 'formatted_date', desc: true },
                { id: 'pemakaian_id', desc: true },
            ],
        },
        state: {
            pagination: paginationState,
        },
        onPaginationChange: (updater) => {
            if (typeof updater === 'function') {
                const newState = updater(paginationState);
                setPagination(newState);

                if (pagination) {
                    const params = new URLSearchParams(window.location.search);
                    params.set('page', (newState.pageIndex + 1).toString());
                    params.set('pageSize', newState.pageSize.toString());
                    router.push(`/apps/wo-lensa-ref?${params.toString()}`);
                }
            } else {
                setPagination(updater);
            }
        },
    });

    const detailColumns = [
        detailColumnHelper.accessor('material_id', {
            header: 'ID MATERIAL',
            cell: (info) => info.getValue() || '-',
        }),
        detailColumnHelper.accessor('material_desc', {
            header: 'NAMA MATERIAL',
            cell: (info) => info.getValue() || '-',
        }),
        detailColumnHelper.accessor('uom', {
            header: 'SATUAN',
            cell: (info) => info.getValue() || '-',
        }),
        detailColumnHelper.accessor('qty_pemakaian', {
            header: 'QTY PEMAKAIAN',
            cell: (info) => info.getValue() || '-',
        }),
    ];

    const detailTable = useReactTable({
        data: detailData,
        columns: detailColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <StaggerContainer className="flex flex-col gap-4 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="md:h-full md:min-h-0 md:overflow-hidden">
                <Card className="border-border shadow-sm flex flex-col md:h-full md:min-h-0 md:overflow-hidden">
                    <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 shrink-0">
                        <div>
                            <CardTitle className="text-xl font-bold">Daftar Ref WO Lensa</CardTitle>
                            <CardDescription>
                                Data referensi WO Provisioning & Maintenance yang ditarik secara
                                otomatis dari aplikasi Lensa.
                            </CardDescription>
                        </div>
                        {!isStaff && (
                            <div className="flex items-center gap-2">
                                <WarehouseCombobox
                                    value={selectedGudang}
                                    onValueChange={handleWarehouseChange}
                                    warehouses={uniqueGudang}
                                    placeholder="Cari gudang..."
                                    allLabel="Semua Gudang"
                                    emptyText="Gudang tidak ditemukan."
                                />

                                <Button
                                    onClick={handleRunScraping}
                                    disabled={isStarting}
                                    className="shrink-0 shadow-sm"
                                >
                                    {isStarting ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    ) : (
                                        <Play className="h-4 w-4 mr-2" />
                                    )}
                                    Run Scraping
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="flex flex-col md:min-h-0 md:overflow-hidden gap-4">
                        <DataTable
                            table={table}
                            emptyMessage="Tidak ada data."
                            className="rounded-md border border-border flex-1 md:overflow-auto relative"
                        />
                        <div className="shrink-0">
                            <DataTablePagination table={table} />
                        </div>
                    </CardContent>
                </Card>
            </StaggerItem>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detail Material WO Lensa</DialogTitle>
                    </DialogHeader>

                    {selectedHeader && (
                        <div className="mb-4 space-y-1">
                            <div>
                                <span className="font-semibold">WO Number:</span>{' '}
                                {selectedHeader.wo_number || '-'}
                            </div>
                            <div>
                                <span className="font-semibold">GI Number:</span>{' '}
                                {selectedHeader.gi_number || '-'}
                            </div>
                        </div>
                    )}

                    <DataTable
                        table={detailTable}
                        isLoading={loadingDetail}
                        emptyMessage="Tidak ada detail material (Atau mungkin belum terscrape)."
                    />
                </DialogContent>
            </Dialog>
        </StaggerContainer>
    );
}
