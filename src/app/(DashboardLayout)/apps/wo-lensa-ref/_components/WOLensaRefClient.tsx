'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Eye, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    checkWOScrapingStatus,
    getWOLensaRefDetails,
    triggerWOScraping,
} from '../_actions/wo-lensa-actions';

export interface WOLensaHeader {
    id: number | string;
    pemakaian_id: string | null;
    tanggal_update: string | null;
    type: string | null;
    wo_number: string | null;
    nik_pemakai: string | null;
    nama_gudang: string | null;
    gi_number: string | null;
    wbs: string | null;
}

export interface WOLensaDetail {
    material_id: string | null;
    material_desc: string | null;
    uom: string | null;
    qty_pemakaian: number | null;
}

const columnHelper = createColumnHelper<WOLensaHeader>();
const detailColumnHelper = createColumnHelper<WOLensaDetail>();

export default function WOLensaRefClient({
    initialData,
    error,
    isStaff = false,
}: {
    initialData: WOLensaHeader[];
    error?: string;
    isStaff?: boolean;
}) {
    const [data] = useState(initialData);
    const [isStarting, setIsStarting] = useState(false);

    // For detail view
    const [detailData, setDetailData] = useState<WOLensaDetail[]>([]);
    const [selectedHeader, setSelectedHeader] = useState<WOLensaHeader | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [selectedGudang, setSelectedGudang] = useState<string>('all');

    const uniqueGudang = useMemo(() => {
        const list = new Set(initialData.map((d) => d.nama_gudang).filter(Boolean));
        return Array.from(list).sort() as string[];
    }, [initialData]);

    const filteredData = useMemo(() => {
        if (selectedGudang === 'all') return data;
        return data.filter((d) => d.nama_gudang === selectedGudang);
    }, [data, selectedGudang]);

    useEffect(() => {
        if (error) {
            toast.error(error);
        }
    }, [error]);

    const handleRunScraping = () => {
        setIsStarting(true);
        const pollPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
            (async () => {
                try {
                    const res = await triggerWOScraping();
                    setIsStarting(false);

                    if (!res.success)
                        return reject(new Error(res.error || 'Gagal memulai scraping.'));

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

        const result = await getWOLensaRefDetails(Number(row.id));

        setLoadingDetail(false);
        if (result.success && result.data) {
            setDetailData(result.data);
        } else {
            toast.error(result.error || 'Gagal mengambil detail material');
        }
    };

    const columns = [
        columnHelper.accessor('pemakaian_id', {
            header: 'Pemakaian ID',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('tanggal_update', {
            header: 'Tgl Update',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('type', {
            header: 'Type',
            cell: (info) => (
                <Badge variant="outline" className="capitalize">
                    {info.getValue() || '-'}
                </Badge>
            ),
        }),
        columnHelper.accessor('wo_number', {
            header: 'WO Number',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nik_pemakai', {
            header: 'NIK Pemakai',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_gudang', {
            header: 'Gudang',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('gi_number', {
            header: 'GI Number',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('wbs', {
            header: 'WBS',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Aksi',
            cell: (info) => (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewDetail(info.row.original)}
                >
                    <Eye className="h-4 w-4 text-blue-500" />
                </Button>
            ),
        }),
    ];

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        initialState: {
            pagination: {
                pageSize: 10,
            },
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
        <StaggerContainer className="flex flex-col gap-4">
            <StaggerItem>
                <Card className="border-border shadow-sm">
                    <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4">
                        <div>
                            <CardTitle className="text-xl font-bold">Daftar Ref WO Lensa</CardTitle>
                            <CardDescription>
                                Data referensi WO Provisioning & Maintenance yang ditarik secara
                                otomatis dari aplikasi Lensa.
                            </CardDescription>
                        </div>
                        {!isStaff && (
                            <div className="flex items-center gap-2">
                                <Select value={selectedGudang} onValueChange={setSelectedGudang}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Pilih Gudang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Semua Gudang</SelectItem>
                                        {uniqueGudang.map((g) => (
                                            <SelectItem key={g} value={g}>
                                                {g}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

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
                    <CardContent>
                        <div className="rounded-md border border-border">
                            <DataTable table={table} emptyMessage="Tidak ada data." />
                        </div>
                        <div className="mt-4">
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
