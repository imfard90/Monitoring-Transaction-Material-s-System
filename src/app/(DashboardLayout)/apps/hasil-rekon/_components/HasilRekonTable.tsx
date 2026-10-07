'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { FilterX, Pencil, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
                <div className="whitespace-nowrap text-sm">
                    {info.getValue()
                        ? format(new Date(info.getValue() as string), 'dd MMM yyyy, HH:mm')
                        : '-'}
                </div>
            ),
        }),
        columnHelper.accessor('trx_id', {
            header: 'TRX ID',
            cell: (info) => (
                <div className="min-w-[160px] max-w-[160px] whitespace-normal break-all text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('sap_number', {
            header: 'SAP Number',
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Warehouse',
            cell: (info) => (
                <div className="whitespace-nowrap min-w-[150px] text-sm">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('nik', {
            header: 'NIK Teknisi',
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('type', {
            header: 'Type',
            cell: (info) => {
                const val = info.getValue();
                return (
                    <div className="whitespace-nowrap">
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-transparent uppercase">
                            {val || '-'}
                        </Badge>
                    </div>
                );
            },
        }),
        columnHelper.accessor('workorder', {
            header: () => <div className="whitespace-nowrap">Work Order</div>,
            cell: (info) => (
                <div className="min-w-[120px] max-w-[150px] whitespace-normal break-words text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('material_code', {
            header: 'Material Code',
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('material_name', {
            header: 'Description',
            cell: (info) => (
                <div className="min-w-[150px] max-w-[180px] whitespace-normal break-words text-sm text-gray-500">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('qty', {
            header: () => <div className="text-right whitespace-nowrap">Qty</div>,
            cell: (info) => (
                <div className="text-right whitespace-nowrap text-sm font-bold text-gray-900">
                    {info.getValue() || 0}
                </div>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            cell: (info) => {
                const isLensa = info.row.original.type === 'lensa';
                const isNewRekon = info.row.original.isNewRekon;
                const isDisabled = isLensa || isNewRekon;

                return (
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
                                        disabled={isDisabled}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        {isNewRekon
                                            ? 'New Rekon cannot be edited'
                                            : isLensa
                                              ? 'Rekon Lensa cannot be edited'
                                              : 'Edit Rekon'}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                );
            },
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
        <StaggerContainer className="space-y-4 flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            {/* Toolbar */}
            <StaggerItem className="flex flex-col sm:flex-row flex-wrap items-center gap-4 shrink-0">
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
            </StaggerItem>

            {/* Table */}
            <StaggerItem className="flex-1 md:min-h-0 md:overflow-y-auto">
                <DataTable table={table} emptyMessage="No records found." />
            </StaggerItem>

            {/* Pagination */}
            <StaggerItem className="py-4 px-4 shrink-0">
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
