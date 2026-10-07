'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { CheckCircle2, Eye, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
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
    checkScrapingStatus,
    getOutLensaRefDetails,
    triggerScraping,
} from '../_actions/out-lensa-actions';

export interface OutLensaHeader {
    id: string;
    reservation_id: string | null;
    tgl_entry: string | null;
    nama_gudang: string | null;
    gi_number: string | null;
    status_proses: string | null;
    nik_pemakai: string | null;
    reservation_id_sap: string | null;
    sap_out_check: boolean | null;
    mitra: string | null;
}

export interface OutLensaDetail {
    id: string;
    header_id: string | null;
    material_id: string | null;
    material_desc: string | null;
    qty_approve: number | null;
    sap_out_matched: boolean | null;
}

const columnHelper = createColumnHelper<OutLensaHeader>();
const detailColumnHelper = createColumnHelper<OutLensaDetail>();

export default function OutLensaRefClient({
    initialData,
    error,
    isStaff = false,
}: {
    initialData: OutLensaHeader[];
    error?: string;
    isStaff?: boolean;
}) {
    const [data] = useState<OutLensaHeader[]>(initialData);
    const [isStarting, setIsStarting] = useState(false);
    const [detailData, setDetailData] = useState<OutLensaDetail[]>([]);
    const [selectedHeader, setSelectedHeader] = useState<OutLensaHeader | null>(null);
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
        const pollPromise = new Promise((resolve, reject) => {
            (async () => {
                try {
                    const res = await triggerScraping();
                    setIsStarting(false);

                    if (!res.success)
                        return reject(new Error(res.error || 'Gagal memulai scraping.'));

                    const interval = setInterval(async () => {
                        try {
                            const status = await checkScrapingStatus(res.jobId);
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
            loading: 'Scraping berjalan di latar belakang...',
            success: (data: unknown) =>
                `Berhasil menarik ${(data as { newCount?: number }).newCount || 0} reservasi baru!`,
            error: (err: unknown) =>
                `Scraping gagal: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
    };

    const handleViewDetail = async (row: OutLensaHeader) => {
        setIsDialogOpen(true);
        setLoadingDetail(true);
        setSelectedHeader(row);

        const result = await getOutLensaRefDetails(row.id);

        setLoadingDetail(false);
        if (result.success && result.data) {
            setDetailData(result.data);
        } else {
            toast.error(result.error || 'Gagal mengambil detail material');
        }
    };

    const columns = [
        columnHelper.accessor('reservation_id', {
            header: 'Reservation ID',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('tgl_entry', {
            header: 'Tgl Entry',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('nama_gudang', {
            header: 'Gudang',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('gi_number', {
            header: 'GI Number',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('status_proses', {
            header: 'Status',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('nik_pemakai', {
            header: 'NIK Pemakai',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('reservation_id_sap', {
            header: 'Resv ID SAP',
            cell: (info) => info.getValue(),
        }),
        columnHelper.accessor('sap_out_check', {
            header: 'Out SAP',
            cell: (info) => (
                <div className="flex justify-center">
                    {info.getValue() ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                </div>
            ),
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
                pageSize: 12,
            },
            sorting: [
                {
                    id: 'reservation_id',
                    desc: true,
                },
            ],
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
        detailColumnHelper.accessor('qty_approve', {
            header: 'QTY ACCEPTED',
            cell: (info) => info.getValue() || '-',
        }),
        detailColumnHelper.accessor('sap_out_matched', {
            header: 'Match',
            cell: (info) => (
                <div className="flex justify-center">
                    {info.getValue() ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                </div>
            ),
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
                            <CardTitle className="text-xl font-bold">
                                Daftar Ref Out Lensa
                            </CardTitle>
                            <CardDescription>
                                Data referensi Out SAP yang ditarik secara otomatis dari aplikasi
                                Lensa.
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
                    <CardContent className="flex flex-col md:min-h-0 md:overflow-hidden gap-4">
                        <div className="rounded-md border border-border md:min-h-0 md:overflow-y-auto">
                            <DataTable table={table} emptyMessage="Tidak ada data." />
                        </div>
                        <div className="shrink-0">
                            <DataTablePagination table={table} />
                        </div>
                    </CardContent>
                </Card>
            </StaggerItem>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detail Material Reservation</DialogTitle>
                    </DialogHeader>

                    {selectedHeader && (
                        <div className="mb-4 space-y-1">
                            <div>
                                <span className="font-semibold">NIK:</span>{' '}
                                {selectedHeader.nik_pemakai || '-'}
                            </div>
                            <div>
                                <span className="font-semibold">MITRA:</span>{' '}
                                {selectedHeader.mitra || '-'}
                            </div>
                        </div>
                    )}

                    <DataTable
                        table={detailTable}
                        isLoading={loadingDetail}
                        emptyMessage="Tidak ada detail material."
                    />
                </DialogContent>
            </Dialog>
        </StaggerContainer>
    );
}
