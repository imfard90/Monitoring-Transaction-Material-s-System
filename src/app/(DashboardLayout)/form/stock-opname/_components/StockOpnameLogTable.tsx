'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getFilteredRowModel,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table';
import { Eye, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchField } from '@/components/ui/search-field';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { StatusBadge } from '@/app/components/shared/StatusBadge';
import { EmptyState } from '@/app/components/shared/EmptyState';
import { getStockOpnameLogs } from '../_actions/stock-opname-actions';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';

interface Props {
    onViewDetail: (log: StockOpnameLog) => void;
    refreshTrigger?: number;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export function StockOpnameLogTable({ onViewDetail, refreshTrigger }: Props) {
    const [logs, setLogs] = useState<StockOpnameLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const res = await getStockOpnameLogs();
            if (!res.success) {
                toast.error(res.error ?? 'Gagal memuat data riwayat');
                return;
            }
            setLogs(res.data ?? []);
        } catch {
            toast.error('Terjadi kesalahan saat memuat data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, [refreshTrigger]);

    // Client-side filtering by status tab
    const filteredLogs = useMemo(() => {
        if (statusFilter === 'all') return logs;
        return logs.filter((log) => log.status === statusFilter);
    }, [logs, statusFilter]);

    const columns: ColumnDef<StockOpnameLog>[] = useMemo(
        () => [
            {
                accessorKey: 'id',
                header: 'ID',
                size: 80,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-foreground">
                        #{row.original.id}
                    </span>
                ),
            },
            {
                accessorKey: 'warehouse_name',
                header: 'Gudang',
                size: 180,
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">
                        {row.original.warehouse_name}
                    </span>
                ),
            },
            {
                accessorKey: 'total_items',
                header: 'Total Item',
                size: 100,
                cell: ({ row }) => (
                    <span className="font-mono text-sm">{row.original.total_items}</span>
                ),
            },
            {
                accessorKey: 'total_difference',
                header: 'Total Selisih',
                size: 120,
                cell: ({ row }) => {
                    const diff = row.original.total_difference;
                    return (
                        <span
                            className={`font-mono text-sm font-semibold ${
                                diff > 0 ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                        >
                            {diff}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'status',
                header: 'Status',
                size: 120,
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                accessorKey: 'created_by',
                header: 'Dibuat Oleh',
                size: 120,
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.created_by}</span>
                ),
            },
            {
                accessorKey: 'created_at',
                header: 'Tanggal',
                size: 160,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {format(row.original.created_at, 'dd MMM yyyy HH:mm', {
                            locale: localeId,
                        })}
                    </span>
                ),
            },
            {
                id: 'actions',
                header: 'Aksi',
                size: 70,
                cell: ({ row }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDetail(row.original)}
                        className="h-8 w-8 p-0 hover:bg-muted"
                        aria-label={`Lihat detail stock opname #${row.original.id}`}
                        title={`Lihat detail stock opname #${row.original.id}`}
                    >
                        <Eye className="h-4 w-4" />
                    </Button>
                ),
            },
        ],
        [onViewDetail]
    );

    const table = useReactTable({
        data: filteredLogs,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: {
            pagination: {
                pageSize: 10,
            },
        },
    });

    const statusCounts = useMemo(() => {
        const counts = { all: logs.length, pending: 0, approved: 0, rejected: 0 };
        for (const log of logs) {
            if (log.status in counts) {
                counts[log.status as keyof typeof counts]++;
            }
        }
        return counts;
    }, [logs]);

    return (
        <Card className="border-border/70 shadow-sm">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="text-base font-semibold sm:text-lg">
                            Riwayat Stock Opname
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Daftar hasil rekonsiliasi dan arsip berita acara stock opname
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadLogs}
                        disabled={isLoading}
                        className="self-start sm:self-auto gap-2"
                        aria-label="Muat ulang riwayat stock opname"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        Segarkan
                    </Button>
                </div>

                {/* Filters & Status Tabs */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Search Field */}
                    <div className="w-full sm:w-72">
                        <SearchField
                            placeholder="Cari ID, gudang, atau NIK..."
                            value={globalFilter}
                            onValueChange={setGlobalFilter}
                            onClear={() => setGlobalFilter('')}
                        />
                    </div>

                    {/* Status Chips */}
                    <div
                        className="flex flex-wrap items-center gap-1.5"
                        role="tablist"
                        aria-label="Filter status stock opname"
                    >
                        {(
                            [
                                { key: 'all', label: 'Semua', count: statusCounts.all },
                                { key: 'pending', label: 'Pending', count: statusCounts.pending },
                                {
                                    key: 'approved',
                                    label: 'Disetujui',
                                    count: statusCounts.approved,
                                },
                                { key: 'rejected', label: 'Ditolak', count: statusCounts.rejected },
                            ] as const
                        ).map(({ key, label, count }) => {
                            const isActive = statusFilter === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setStatusFilter(key)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        isActive
                                            ? 'bg-primary text-primary-foreground shadow-xs'
                                            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    <span>{label}</span>
                                    <span
                                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                                            isActive
                                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                                : 'bg-background text-muted-foreground'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-3 space-y-4">
                {!isLoading && filteredLogs.length === 0 ? (
                    <EmptyState
                        title="Tidak ada data stock opname"
                        description={
                            globalFilter || statusFilter !== 'all'
                                ? 'Tidak ditemukan data yang sesuai dengan filter pencarian.'
                                : 'Belum ada dokumen stock opname yang pernah diunggah.'
                        }
                    />
                ) : (
                    <>
                        <DataTable
                            table={table}
                            isLoading={isLoading}
                            emptyMessage="Belum ada data stock opname."
                            maxHeight="min(65vh, 600px)"
                        />
                        <DataTablePagination table={table} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
