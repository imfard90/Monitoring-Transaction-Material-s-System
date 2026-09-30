'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarIcon, FilterX, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MovementTableProps {
    data: any[];
    searchQuery: string;
    onSearchChange: (val: string) => void;
    dateRange?: DateRange;
    onDateRangeChange?: (date: DateRange | undefined) => void;
    warehouseFilter?: string;
    onWarehouseFilterChange?: (val: string) => void;
    materialFilter?: string;
    onMaterialFilterChange?: (val: string) => void;
    uniqueWarehouses?: string[];
    uniqueMaterials?: string[];
    onClearFilters?: () => void;
}

const columnHelper = createColumnHelper<any>();

export default function MovementTable({
    data,
    searchQuery,
    onSearchChange,
    dateRange,
    onDateRangeChange,
    warehouseFilter,
    onWarehouseFilterChange,
    materialFilter,
    onMaterialFilterChange,
    uniqueWarehouses = [],
    uniqueMaterials = [],
    onClearFilters,
}: MovementTableProps) {
    const columns = [
        columnHelper.accessor('created_at', {
            header: 'Timestamp',
            cell: (info) => (
                <span className="text-sm">
                    {info.getValue()
                        ? format(new Date(info.getValue()), 'dd MMM yyyy, HH:mm')
                        : '-'}
                </span>
            ),
        }),
        columnHelper.accessor('reference_trx', {
            header: 'Reference TRX',
            cell: (info) => (
                <div className="max-w-[160px] whitespace-normal break-all text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Warehouse',
            cell: (info) => <span className="text-sm">{info.getValue()}</span>,
        }),
        columnHelper.accessor('material_code', {
            header: 'Material Code',
            cell: (info) => <span className="text-sm">{info.getValue()}</span>,
        }),
        columnHelper.accessor('material_name', {
            header: 'Description',
            cell: (info) => <span className="text-sm text-gray-500">{info.getValue()}</span>,
        }),
        columnHelper.accessor('movement_type', {
            header: 'Type',
            cell: (info) => {
                const val = info.getValue();
                let color = 'bg-gray-100 text-gray-800';
                if (val === 'transfer_in' || val === 'receive' || val === 'return')
                    color = 'bg-green-100 text-green-800';
                if (val === 'transfer_out' || val === 'sap_out') color = 'bg-red-100 text-red-800';

                return (
                    <Badge className={`hover:bg-transparent capitalize ${color}`}>
                        {val?.replace(/_/g, ' ')}
                    </Badge>
                );
            },
        }),
        columnHelper.accessor('qty_delta', {
            header: () => <div className="text-right">Delta</div>,
            cell: (info) => {
                const val = info.getValue();
                const color =
                    val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-900';
                return (
                    <div className={`text-right text-sm font-bold ${color}`}>
                        {val > 0 ? `+${val}` : val}
                    </div>
                );
            },
        }),
        columnHelper.accessor('qty_after', {
            header: () => <div className="text-right">Balance</div>,
            cell: (info) => <div className="text-right text-sm">{info.getValue()}</div>,
        }),
        columnHelper.accessor('notes', {
            header: 'Notes',
            cell: (info) => <span className="text-sm text-gray-500">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('created_by', {
            header: 'By',
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: {
                pageSize: 15,
            },
        },
    });

    return (
        <div className="space-y-4 flex flex-col flex-1 min-h-0">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            type="search"
                            placeholder="Search reference, material, etc..."
                            className="pl-9 bg-white"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>

                    {onDateRangeChange && (
                        <DateRangePicker
                            date={dateRange}
                            setDate={onDateRangeChange}
                            className="w-[260px]"
                        />
                    )}

                    {onWarehouseFilterChange && (
                        <div className="w-[200px]">
                            <SearchableSelect
                                value={warehouseFilter || ''}
                                onValueChange={onWarehouseFilterChange}
                                options={[
                                    { value: 'all', label: 'All Warehouses' },
                                    ...uniqueWarehouses.map((wh) => ({ value: wh, label: wh })),
                                ]}
                                placeholder="All Warehouses"
                            />
                        </div>
                    )}

                    {onMaterialFilterChange && (
                        <div className="w-[200px]">
                            <SearchableSelect
                                value={materialFilter || ''}
                                onValueChange={onMaterialFilterChange}
                                options={[
                                    { value: 'all', label: 'All Materials' },
                                    ...uniqueMaterials.map((mat) => ({ value: mat, label: mat })),
                                ]}
                                placeholder="All Materials"
                            />
                        </div>
                    )}
                </div>

                {onClearFilters && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={onClearFilters}
                                    className="bg-white ml-auto"
                                >
                                    <FilterX className="h-4 w-4 text-gray-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Clear all filters</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Table */}
            <DataTable table={table} emptyMessage="No movements found." />

            {/* Pagination */}
            <div className="py-4 px-4">
                <DataTablePagination table={table} />
            </div>
        </div>
    );
}
