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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
                            <AnimatePresence>
                                {table.getRowModel().rows.map((row, i) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, delay: i * 0.03 }}
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
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="h-24 text-center text-gray-500"
                                >
                                    No movements found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between py-4 px-4">
                <div className="text-sm text-gray-500 font-medium">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                </div>
                <div className="flex items-center space-x-2">
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
        </div>
    );
}
