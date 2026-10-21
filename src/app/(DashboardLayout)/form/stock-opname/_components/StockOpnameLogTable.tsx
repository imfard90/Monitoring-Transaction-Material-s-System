'use client';

import { useEffect, useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStockOpnameLogs } from '../_actions/stock-opname-actions';
import { toast } from 'sonner';
import type { StockOpnameLog } from '@/lib/repositories/stock-opname.repository';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface Props {
    onViewDetail: (log: StockOpnameLog) => void;
    refreshTrigger?: number;
}

const statusBadge = (status: string) => {
    const variants = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
        <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${variants[status as keyof typeof variants]}`}
        >
            {status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
    );
};

export function StockOpnameLogTable({ onViewDetail, refreshTrigger }: Props) {
    const [logs, setLogs] = useState<StockOpnameLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sorting, setSorting] = useState<SortingState>([]);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const res = await getStockOpnameLogs();
            if (!res.success) {
                toast.error(res.error ?? 'Gagal memuat data');
                return;
            }
            setLogs(res.data ?? []);
        } catch (err) {
            toast.error('Terjadi kesalahan');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, [refreshTrigger]);

    const columns: ColumnDef<StockOpnameLog>[] = [
        {
            accessorKey: 'id',
            header: 'ID',
            cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
        },
        {
            accessorKey: 'warehouse_name',
            header: 'Gudang',
            cell: ({ row }) => <span className="font-medium">{row.original.warehouse_name}</span>,
        },
        {
            accessorKey: 'total_items',
            header: 'Total Item',
            cell: ({ row }) => <span className="font-mono">{row.original.total_items}</span>,
        },
        {
            accessorKey: 'total_difference',
            header: 'Total Selisih',
            cell: ({ row }) => (
                <span className="font-mono font-semibold text-destructive">
                    {row.original.total_difference}
                </span>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => statusBadge(row.original.status),
        },
        {
            accessorKey: 'created_by',
            header: 'Dibuat Oleh',
            cell: ({ row }) => <span className="font-mono text-sm">{row.original.created_by}</span>,
        },
        {
            accessorKey: 'created_at',
            header: 'Tanggal',
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {format(row.original.created_at, 'dd MMM yyyy HH:mm', { locale: localeId })}
                </span>
            ),
        },
        {
            id: 'actions',
            header: 'Aksi',
            cell: ({ row }) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetail(row.original)}
                    className="h-8 w-8 p-0"
                >
                    <Eye className="h-4 w-4" />
                </Button>
            ),
        },
    ];

    const table = useReactTable({
        data: logs,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return (
            <div className="rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm p-8 text-center">
                <p className="text-muted-foreground">Memuat data...</p>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm p-8 text-center">
                <p className="text-muted-foreground">Belum ada data stock opname</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
            <table className="w-full">
                <thead className="bg-muted/80 backdrop-blur-sm border-b border-border/50">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                >
                                    {header.isPlaceholder ? null : (
                                        <div
                                            className={
                                                header.column.getCanSort()
                                                    ? 'flex items-center gap-2 cursor-pointer select-none'
                                                    : ''
                                            }
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                            {header.column.getCanSort() && (
                                                <span className="text-muted-foreground/50">
                                                    {header.column.getIsSorted() === 'asc' ? (
                                                        <ChevronUp className="h-4 w-4" />
                                                    ) : header.column.getIsSorted() === 'desc' ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 opacity-0 group-hover:opacity-50" />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody className="divide-y divide-border/30">
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="px-4 py-3 text-sm">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
