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
import { CalendarIcon, FilterX, Pencil, Search } from 'lucide-react';
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
import type { HasilRekonData } from '../_actions/rekon-actions';

interface HasilRekonTableProps {
    data: HasilRekonData[];
    searchQuery: string;
    onSearchChange: (val: string) => void;
    dateRange?: DateRange;
    onDateRangeChange?: (date: DateRange | undefined) => void;
    warehouseFilter?: string;
    onWarehouseFilterChange?: (val: string) => void;
    typeFilter?: string;
    onTypeFilterChange?: (val: string) => void;
    materialFilter?: string;
    onMaterialFilterChange?: (val: string) => void;
    uniqueWarehouses?: string[];
    uniqueTypes?: string[];
    uniqueMaterials?: string[];
    onClearFilters?: () => void;
    onEditClick?: (row: HasilRekonData) => void;
}

const columnHelper = createColumnHelper<HasilRekonData>();

export default function HasilRekonTable({
    data,
    searchQuery,
    onSearchChange,
    dateRange,
    onDateRangeChange,
    warehouseFilter,
    onWarehouseFilterChange,
    typeFilter,
    onTypeFilterChange,
    materialFilter,
    onMaterialFilterChange,
    uniqueWarehouses = [],
    uniqueTypes = [],
    uniqueMaterials = [],
    onClearFilters,
    onEditClick,
}: HasilRekonTableProps) {
    const columns = [
        columnHelper.accessor('created_at', {
            header: 'Timestamp',
            cell: (info) => (
                <span className="text-sm">
                    {info.getValue()
                        ? format(new Date(info.getValue() as string), 'dd MMM yyyy, HH:mm')
                        : '-'}
                </span>
            ),
        }),
        columnHelper.accessor('trx_id', {
            header: 'TRX ID',
            cell: (info) => (
                <div className="max-w-[160px] whitespace-normal break-all text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('sap_number', {
            header: 'SAP Number',
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Warehouse',
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('nik', {
            header: 'NIK Teknisi',
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('type', {
            header: 'Type',
            cell: (info) => {
                const val = info.getValue();
                return (
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-transparent uppercase">
                        {val || '-'}
                    </Badge>
                );
            },
        }),
        columnHelper.accessor('workorder', {
            header: 'Workorder',
            cell: (info) => <span className="text-sm font-medium">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('material_code', {
            header: 'Material Code',
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('material_name', {
            header: 'Description',
            cell: (info) => <span className="text-sm text-gray-500">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('qty', {
            header: () => <div className="text-right">Qty</div>,
            cell: (info) => (
                <div className="text-right text-sm font-bold text-gray-900">
                    {info.getValue() || 0}
                </div>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            cell: (info) => (
                <div className="flex justify-center">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                    onClick={() => {
                                        if (onEditClick) onEditClick(info.row.original);
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Edit Rekon</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            ),
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
                            placeholder="Search TRX, SAP, NIK, or WO..."
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

                    {onTypeFilterChange && (
                        <div className="w-[150px]">
                            <SearchableSelect
                                value={typeFilter || ''}
                                onValueChange={onTypeFilterChange}
                                options={[
                                    { value: 'all', label: 'All Types' },
                                    ...uniqueTypes.map((t) => ({
                                        value: t,
                                        label: t.toUpperCase(),
                                    })),
                                ]}
                                placeholder="All Types"
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
            <DataTable table={table} emptyMessage="No records found." />

            {/* Pagination */}
            <div className="py-4 px-4">
                <DataTablePagination table={table} />
            </div>
        </div>
    );
}
