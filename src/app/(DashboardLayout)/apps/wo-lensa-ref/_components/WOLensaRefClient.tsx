'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    checkWOScrapingStatus,
    getWOLensaRefDetails,
    triggerWOScraping,
} from '../_actions/wo-lensa-actions';

const columnHelper = createColumnHelper<any>();

export default function WOLensaRefClient({
    initialData,
    error,
    isStaff = false,
}: {
    initialData: any[];
    error?: string;
    isStaff?: boolean;
}) {
    const [data] = useState(initialData);
    const [isStarting, setIsStarting] = useState(false);

    // For detail view
    const [detailData, setDetailData] = useState<any[]>([]);
    const [selectedHeader, setSelectedHeader] = useState<any | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

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
                        } catch (err) {
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
            success: (data: any) => data.message || 'Scraping berhasil diselesaikan!',
            error: (err: any) => `Scraping gagal: ${err.message}`,
        });
    };

    const handleViewDetail = async (row: any) => {
        setIsDialogOpen(true);
        setLoadingDetail(true);
        setSelectedHeader(row);

        const result = await getWOLensaRefDetails(row.id);

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
        data,
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
        columnHelper.accessor('material_id', {
            header: 'ID MATERIAL',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('material_desc', {
            header: 'NAMA MATERIAL',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('uom', {
            header: 'SATUAN',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('qty_pemakaian', {
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
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col gap-4"
            >
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
            </motion.div>
        </>
    );
}
