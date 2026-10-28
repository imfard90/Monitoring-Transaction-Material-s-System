'use client';

import { IconBuildingWarehouse } from '@tabler/icons-react';
import {
    type Column,
    type ColumnDef,
    type ColumnFiltersState,
    createColumnHelper,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    type Table,
    useReactTable,
    type VisibilityState,
} from '@/lib/table';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchField } from '@/components/ui/search-field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { StockItem, StockStatus, WarehouseSummary } from '../_lib/stock-status';
import { calculateDaysUntilRunout, warehouseLocation } from '../_lib/stock-status';
import { OtherStockDialog } from './OtherStockDialog';
import { StockStatusBadge } from './StockStatusBadge';

interface StockTableProps {
    warehouses: WarehouseSummary[];
    items: StockItem[];
    onWarehouseChange: (warehouseId: number) => void;
    selectedWarehouseId: number;
}

const columnHelper = createColumnHelper<StockItem>();

function SortableHeader({
    title,
    column,
}: {
    title: string;
    column: Column<StockItem, unknown>;
    table?: any;
}) {
    const sorted = column.getIsSorted();
    const isSorted = Boolean(sorted);
    const isAsc = sorted === 'asc';

    return (
        <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 uppercase hover:text-primary transition-colors"
            style={{ userSelect: 'none' }}
        >
            <span>{title}</span>
            {isSorted ? (
                isAsc ? (
                    <ChevronUp className="h-3 w-3 text-primary" />
                ) : (
                    <ChevronDown className="h-3 w-3 text-primary" />
                )
            ) : (
                <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />
            )}
        </button>
    );
}

export function StockTable({
    warehouses,
    items,
    onWarehouseChange,
    selectedWarehouseId,
}: StockTableProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

    const hasActiveFilters = Boolean(
        searchQuery.trim() || statusFilter !== null || selectedWarehouseId !== 0
    );

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setStatusFilter(null);
        onWarehouseChange(0);
    }, [onWarehouseChange]);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    const filteredItems = useMemo(() => {
        let result = items;

        if (selectedWarehouseId !== 0) {
            result = result.filter((item) => item.warehouse_id === selectedWarehouseId);
        }

        if (statusFilter) {
            result = result.filter((item) => item.stock_status === statusFilter);
        }

        const query = searchQuery.trim().toLowerCase();
        if (query) {
            result = result.filter(
                (item) =>
                    item.material_code.toLowerCase().includes(query) ||
                    item.material_name.toLowerCase().includes(query)
            );
        }

        return result;
    }, [items, selectedWarehouseId, statusFilter, searchQuery]);

    const columns: ColumnDef<StockItem, any>[] = [
        columnHelper.accessor('warehouse_name', {
            header: ({ column, table }) => (
                <SortableHeader title="Lokasi" column={column} table={table} />
            ),
            cell: (info) => (
                <span className="whitespace-nowrap text-sm font-medium text-foreground">
                    {warehouseLocation(info.getValue())}
                </span>
            ),
        }),
        columnHelper.accessor('material_code', {
            header: ({ column, table }) => (
                <SortableHeader title="Kode Material" column={column} table={table} />
            ),
            cell: (info) => (
                <button
                    type="button"
                    onClick={() => setSearchQuery(info.getValue())}
                    className="font-mono text-sm font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
                    aria-label={`Cari material ${info.getValue()}`}
                >
                    {info.getValue()}
                </button>
            ),
        }),
        columnHelper.accessor('material_name', {
            header: 'Nama Material',
            cell: (info) => <span className="max-w-xs truncate">{info.getValue()}</span>,
        }),
        columnHelper.accessor('material_unit', {
            header: () => <div className="text-center">Satuan</div>,
            cell: (info) => (
                <div className="flex justify-center">
                    <Badge variant="secondary" className="text-xs">
                        {info.getValue()}
                    </Badge>
                </div>
            ),
        }),
        columnHelper.accessor('qty_stock', {
            header: ({ column, table }) => (
                <SortableHeader title="Stok" column={column} table={table} />
            ),
            cell: (info) => (
                <span className="font-bold tabular-nums text-right">
                    {info.getValue().toLocaleString('id-ID')}
                </span>
            ),
        }),
        columnHelper.accessor('min_qty', {
            header: () => <div className="text-center">Min</div>,
            cell: (info) => (
                <div className="text-center text-muted-foreground tabular-nums">
                    {info.getValue() ?? '-'}
                </div>
            ),
        }),
        columnHelper.accessor('average_demand_weekly', {
            header: () => (
                <div className="mx-auto max-w-[7rem] whitespace-normal text-center leading-tight">
                    Rata-rata Mingguan
                </div>
            ),
            cell: (info) => {
                const avg = info.getValue();
                return (
                    <div className="text-center text-muted-foreground tabular-nums">
                        {avg === null ? '-' : avg.toLocaleString('id-ID')}
                    </div>
                );
            },
        }),
        columnHelper.accessor('has_out_material_history', {
            header: () => (
                <div className="mx-auto max-w-[8rem] whitespace-normal text-center leading-tight">
                    Estimasi Stok Habis
                </div>
            ),
            cell: (info) => {
                const row = info.row.original;
                if (!row.has_out_material_history) {
                    return <div className="text-center text-muted-foreground">-</div>;
                }
                const days = calculateDaysUntilRunout(
                    row.qty_stock,
                    row.average_demand_weekly,
                    row.has_out_material_history
                );
                if (days === null) {
                    return <div className="text-center text-muted-foreground">-</div>;
                }
                return (
                    <div
                        className={cn(
                            'text-center font-mono tabular-nums',
                            days <= 7 ? 'text-destructive font-semibold' : 'text-muted-foreground'
                        )}
                    >
                        {days} hari
                    </div>
                );
            },
        }),
        columnHelper.accessor('stock_status', {
            header: () => <div className="text-center">Status</div>,
            cell: (info) => (
                <div className="flex justify-center">
                    <StockStatusBadge status={info.getValue()} />
                </div>
            ),
        }),
        columnHelper.display({
            id: 'other_stock',
            header: () => (
                <div className="mx-auto max-w-[3.5rem] whitespace-normal text-center leading-tight">
                    Lokasi Lain
                </div>
            ),
            cell: (info) => {
                const row = info.row.original;
                return (
                    <div className="flex justify-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Lihat stok ${row.material_code} di gudang lain`}
                                    className="h-7 w-7 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                    onClick={() => setSelectedItem(row)}
                                >
                                    <IconBuildingWarehouse className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>Stok lokasi lain</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: filteredItems,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        state: { sorting, columnFilters, columnVisibility },
        initialState: { pagination: { pageSize: 20 } },
    });

    const currentWarehouse =
        selectedWarehouseId === 0
            ? null
            : (warehouses.find((w) => w.warehouse_id === selectedWarehouseId) ?? null);

    const sumBy = (pick: (w: WarehouseSummary) => number) =>
        warehouses.reduce((sum, w) => sum + pick(w), 0);

    const statusCounts: { status: StockStatus; label: string; count: number; className: string }[] =
        [
            {
                status: 'critical',
                label: 'Kritis',
                count: currentWarehouse?.critical_count ?? sumBy((w) => w.critical_count),
                className: 'text-destructive border-destructive/20 bg-destructive/10',
            },
            {
                status: 'low',
                label: 'Rendah',
                count: currentWarehouse?.low_count ?? sumBy((w) => w.low_count),
                className: 'text-warning border-warning/20 bg-warning/10',
            },
            {
                status: 'normal',
                label: 'Normal',
                count: currentWarehouse?.normal_count ?? sumBy((w) => w.normal_count),
                className: 'text-success border-success/20 bg-success/10',
            },
        ];

    return (
        <>
            <OtherStockDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
            <Card className="border-border/70 shadow-sm mb-4">
                <CardContent className="pt-4 pb-4 px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3">
                                <label
                                    htmlFor="warehouse-select"
                                    className="text-sm font-medium text-foreground"
                                >
                                    Gudang:
                                </label>
                                <Select
                                    value={selectedWarehouseId.toString()}
                                    onValueChange={(value) => onWarehouseChange(Number(value))}
                                >
                                    <SelectTrigger id="warehouse-select" className="w-full sm:w-64">
                                        <SelectValue placeholder="Semua Gudang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Semua Gudang</SelectItem>
                                        {warehouses.map((w) => (
                                            <SelectItem
                                                key={w.warehouse_id}
                                                value={w.warehouse_id.toString()}
                                            >
                                                {w.warehouse_name} ({w.branch_name})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <SearchField
                                wrapperClassName="w-full sm:w-64"
                                placeholder="Cari kode/nama material..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                onClear={handleResetFilters}
                                clearLabel="Hapus pencarian"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {statusCounts.map(({ status, label, count, className }) => {
                                const isActive = statusFilter === status;
                                return (
                                    <button
                                        key={status}
                                        type="button"
                                        aria-pressed={isActive}
                                        onClick={() => setStatusFilter(isActive ? null : status)}
                                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                className,
                                                'cursor-pointer transition-opacity hover:opacity-80',
                                                isActive
                                                    ? 'font-semibold ring-2 ring-current ring-offset-1'
                                                    : count > 0 && 'font-semibold'
                                            )}
                                        >
                                            {label}: {count}
                                        </Badge>
                                    </button>
                                );
                            })}
                            {statusFilter && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setStatusFilter(null)}
                                >
                                    Hapus filter
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <DataTable
                            table={table}
                            isLoading={false}
                            emptyMessage="Tidak ada data material."
                        />
                    </div>
                    <div className="border-t border-border/70 p-4">
                        <DataTablePagination table={table} />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
