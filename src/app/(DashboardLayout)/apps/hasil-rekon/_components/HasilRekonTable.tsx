'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { FileSpreadsheet, FilterX, Pencil, Search } from 'lucide-react';
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
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    onPaginationChange?: (page: number, pageSize: number) => void;
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
    onExportClick?: () => void;
}

const columnHelper = createColumnHelper<HasilRekonData>();

export default function HasilRekonTable({
    data,
    pagination,
    onPaginationChange,
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
    onExportClick,
}: HasilRekonTableProps) {
    const columns = [
        columnHelper.accessor('created_at', {
            header: 'Timestamp',
            size: 160,
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
            size: 210,
            cell: (info) => (
                <div className="whitespace-normal break-all text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('sap_number', {
            header: 'SAP Number',
            size: 130,
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Warehouse',
            size: 130,
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('nik', {
            header: () => <div className="text-center">NIK</div>,
            size: 80,
            cell: (info) => (
                <div className="text-center whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('type', {
            header: () => <div className="text-center">Type</div>,
            size: 90,
            cell: (info) => (
                <div className="flex justify-center whitespace-nowrap">
                    <Badge variant="outline" className="capitalize text-xs font-semibold">
                        {info.getValue() || '-'}
                    </Badge>
                </div>
            ),
        }),
        columnHelper.accessor('workorder', {
            header: 'WO Number',
            size: 220,
            cell: (info) => (
                <div className="whitespace-normal break-words text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('material_code', {
            header: 'Material Code',
            size: 140,
            cell: (info) => (
                <div className="whitespace-nowrap text-sm">{info.getValue() || '-'}</div>
            ),
        }),
        columnHelper.accessor('material_name', {
            header: 'Description',
            size: 200,
            cell: (info) => (
                <div className="min-w-[150px] max-w-[180px] whitespace-normal break-words text-sm text-muted-foreground">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('qty', {
            header: () => <div className="text-center whitespace-nowrap">Qty</div>,
            size: 65,
            cell: (info) => (
                <div className="text-center whitespace-nowrap text-sm font-bold text-foreground">
                    {info.getValue() || 0}
                </div>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            size: 65,
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

    const paginationState = {
        pageIndex: pagination ? pagination.page - 1 : 0,
        pageSize: pagination ? pagination.pageSize : 20,
    };

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: !!pagination,
        pageCount: pagination ? pagination.totalPages : undefined,
        state: {
            pagination: paginationState,
        },
        initialState: {
            pagination: {
                pageSize: 20,
            },
        },
        onPaginationChange: (updater) => {
            if (typeof updater === 'function') {
                const next = updater(paginationState);
                onPaginationChange?.(next.pageIndex + 1, next.pageSize);
            } else {
                onPaginationChange?.(updater.pageIndex + 1, updater.pageSize);
            }
        },
    });

    return (
        <StaggerContainer className="space-y-4 flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            {/* Toolbar */}
            <StaggerItem className="flex flex-col sm:flex-row flex-wrap items-center gap-4 shrink-0">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search TRX, SAP, NIK, or WO..."
                            className="pl-9 bg-background"
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

                <div className="flex items-center gap-2 ml-auto">
                    {onClearFilters && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={onClearFilters}
                                        className="bg-background"
                                        aria-label="Clear all filters"
                                    >
                                        <FilterX className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Clear all filters</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    {onExportClick && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={onExportClick}
                                        className="bg-background text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 transition-colors"
                                        aria-label="Export Data Excel (.xlsx)"
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export Data Excel (.xlsx)</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </StaggerItem>

            {/* Table */}
            <StaggerItem className="flex-1 md:min-h-0 flex flex-col overflow-hidden">
                <DataTable
                    table={table}
                    emptyMessage="No records found."
                    className="rounded-md border border-border flex-1 md:overflow-auto relative"
                />
            </StaggerItem>

            {/* Pagination */}
            <StaggerItem className="py-2 px-1 shrink-0">
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
