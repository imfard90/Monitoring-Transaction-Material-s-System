'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { CalendarIcon, FilterX, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HasilRekonTableProps {
    data: any[];
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
}

const columnHelper = createColumnHelper<any>();

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
}: HasilRekonTableProps) {
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
        columnHelper.accessor('trx_id', {
            header: 'TRX ID',
            cell: (info) => <span className="text-sm font-medium">{info.getValue() || '-'}</span>,
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
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={'outline'}
                                    className={cn(
                                        'w-[260px] justify-start text-left font-normal bg-white',
                                        !dateRange && 'text-muted-foreground'
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, 'LLL dd, y')} -{' '}
                                                {format(dateRange.to, 'LLL dd, y')}
                                            </>
                                        ) : (
                                            format(dateRange.from, 'LLL dd, y')
                                        )
                                    ) : (
                                        <span>Filter by date range...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={onDateRangeChange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
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
            <div className="flex-1 overflow-auto rounded-md border">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="border-b bg-gray-50/50">
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="h-8 px-3 py-1.5 align-middle font-medium text-gray-500 text-sm whitespace-nowrap"
                                    >
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="border-b transition-colors hover:bg-gray-50/50"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="px-3 py-1.5 align-middle whitespace-nowrap"
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="h-24 text-center text-gray-500"
                                >
                                    No records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 py-4 px-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    Previous
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
