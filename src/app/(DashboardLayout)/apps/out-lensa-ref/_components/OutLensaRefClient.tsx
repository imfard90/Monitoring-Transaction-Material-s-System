'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Eye, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    checkScrapingStatus,
    getOutLensaRefDetails,
    triggerScraping,
} from '../_actions/out-lensa-actions';

const columnHelper = createColumnHelper<any>();

export default function OutLensaRefClient({
    initialData,
    error,
    isStaff = false,
}: {
    initialData: any[];
    error?: string;
    isStaff?: boolean;
}) {
    const [data, _setData] = useState(initialData);
    const [isStarting, setIsStarting] = useState(false);
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
            loading: 'Scraping berjalan di latar belakang...',
            success: (data: any) => `Berhasil menarik ${data.newCount || 0} reservasi baru!`,
            error: (err: any) => `Scraping gagal: ${err.message}`,
        });
    };

    const handleViewDetail = async (row: any) => {
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
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        initialState: {
            sorting: [
                {
                    id: 'reservation_id',
                    desc: true,
                },
            ],
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
        columnHelper.accessor('qty_approve', {
            header: 'QTY ACCEPTED',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('sap_out_matched', {
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
                            <CardTitle className="text-xl font-bold">
                                Daftar Ref Out Lensa
                            </CardTitle>
                            <CardDescription>
                                Data referensi Out SAP yang ditarik secara otomatis dari aplikasi
                                Lensa.
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
            </motion.div>
        </>
    );
}
