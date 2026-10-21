'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { FilterX } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { SearchField } from '@/components/ui/search-field';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface StockMovementItem {
    id?: number | string;
    created_at: string | Date;
    reference_trx: string | null;
    warehouse_name: string | null;
    material_code: string | null;
    material_name: string | null;
    movement_type: string;
    qty_delta: number;
    qty_after: number;
    notes: string | null;
    created_by: string | null;
    [key: string]: unknown;
}

interface MovementTableProps {
    data: StockMovementItem[];
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
    materialFilter?: string;
    onMaterialFilterChange?: (val: string) => void;
    typeFilter?: string[];
    onTypeFilterChange?: (val: string[]) => void;
    uniqueWarehouses?: string[];
    uniqueMaterials?: string[];
    uniqueTypes?: string[];
    onClearFilters?: () => void;
}

const columnHelper = createColumnHelper<StockMovementItem>();

export default function MovementTable({
    data,
    pagination,
    onPaginationChange,
    searchQuery,
    onSearchChange,
    dateRange,
    onDateRangeChange,
    warehouseFilter,
    onWarehouseFilterChange,
    materialFilter,
    onMaterialFilterChange,
    typeFilter,
    onTypeFilterChange,
    uniqueWarehouses = [],
    uniqueMaterials = [],
    uniqueTypes = [],
    onClearFilters,
}: MovementTableProps) {
    const columns = [
        columnHelper.accessor('created_at', {
            header: 'Waktu',
            size: 160,
            cell: (info) => (
                <span className="text-sm">
                    {info.getValue()
                        ? format(new Date(info.getValue()), 'dd MMM yyyy, HH:mm')
                        : '-'}
                </span>
            ),
        }),
        columnHelper.accessor('reference_trx', {
            header: 'Referensi TRX',
            size: 220,
            cell: (info) => (
                <div className="whitespace-normal break-all text-sm font-medium">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Gudang',
            size: 150,
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('material_code', {
            header: 'Kode Material',
            size: 140,
            cell: (info) => <span className="text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('material_name', {
            header: 'Deskripsi Material',
            size: 200,
            cell: (info) => (
                <div className="whitespace-normal break-words text-sm text-muted-foreground">
                    {info.getValue() || '-'}
                </div>
            ),
        }),
        columnHelper.accessor('movement_type', {
            header: () => <div className="text-center">Tipe</div>,
            size: 110,
            cell: (info) => {
                const val = info.getValue();
                let color = 'bg-secondary/10 text-secondary';
                if (val === 'transfer_in' || val === 'sap_in') color = 'bg-success/10 text-success';
                if (val === 'transfer_out' || val === 'sap_out') color = 'bg-error/10 text-error';

                return (
                    <div className="flex justify-center">
                        <Badge className={`hover:bg-transparent capitalize ${color}`}>
                            {val?.replace(/_/g, ' ')}
                        </Badge>
                    </div>
                );
            },
        }),
        columnHelper.accessor('qty_delta', {
            header: () => <div className="text-center">Delta</div>,
            size: 75,
            cell: (info) => {
                const val = info.getValue();
                const color = val > 0 ? 'text-success' : val < 0 ? 'text-error' : 'text-foreground';
                return (
                    <div className={`text-center text-sm font-bold ${color}`}>
                        {val > 0 ? `+${val}` : val}
                    </div>
                );
            },
        }),
        columnHelper.accessor('qty_after', {
            header: () => <div className="text-center">Saldo</div>,
            size: 75,
            cell: (info) => <div className="text-center text-sm">{info.getValue()}</div>,
        }),
        columnHelper.accessor('notes', {
            header: 'Catatan',
            size: 200,
            cell: (info) => (
                <span className="text-sm text-muted-foreground">{info.getValue() || '-'}</span>
            ),
        }),
        columnHelper.accessor('created_by', {
            header: () => <div className="text-center">By</div>,
            size: 90,
            cell: (info) => <div className="text-center text-sm">{info.getValue() || '-'}</div>,
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
        <StaggerContainer className="space-y-4 flex flex-col flex-1 md:h-full md:min-h-0">
            {/* Toolbar */}
            <StaggerItem className="flex flex-col sm:flex-row flex-wrap items-center gap-4 shrink-0 p-0.5">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <SearchField
                        wrapperClassName="w-full sm:w-72 md:w-80"
                        placeholder="Cari referensi, material, dll..."
                        className="bg-background"
                        value={searchQuery}
                        onValueChange={onSearchChange}
                    />

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
                                    { value: 'all', label: 'Semua Gudang' },
                                    ...uniqueWarehouses.map((wh) => ({ value: wh, label: wh })),
                                ]}
                                placeholder="Semua Gudang"
                            />
                        </div>
                    )}

                    {onMaterialFilterChange && (
                        <div className="w-[200px]">
                            <SearchableSelect
                                value={materialFilter || ''}
                                onValueChange={onMaterialFilterChange}
                                options={[
                                    { value: 'all', label: 'Semua Material' },
                                    ...uniqueMaterials.map((mat) => ({ value: mat, label: mat })),
                                ]}
                                placeholder="Semua Material"
                            />
                        </div>
                    )}

                    {onTypeFilterChange && (
                        <div className="w-[200px]">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-between bg-background font-normal"
                                    >
                                        {typeFilter && typeFilter.length > 0
                                            ? `${typeFilter.length} Tipe dipilih`
                                            : 'Semua Tipe'}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto">
                                    <DropdownMenuLabel>Filter Berdasarkan Tipe</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {uniqueTypes.map((type) => {
                                        const label = type
                                            .replace(/_/g, ' ')
                                            .replace(/\b\w/g, (l) => l.toUpperCase());
                                        const isChecked = typeFilter?.includes(type) ?? false;
                                        return (
                                            <DropdownMenuCheckboxItem
                                                key={type}
                                                checked={isChecked}
                                                onCheckedChange={(checked) => {
                                                    const current = typeFilter ?? [];
                                                    const next = checked
                                                        ? [...current, type]
                                                        : current.filter((t) => t !== type);
                                                    onTypeFilterChange(next);
                                                }}
                                                onSelect={(e) => e.preventDefault()}
                                            >
                                                {label}
                                            </DropdownMenuCheckboxItem>
                                        );
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                                    className="bg-background ml-auto"
                                >
                                    <FilterX className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Hapus semua filter</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </StaggerItem>

            {/* Table */}
            <StaggerItem className="flex-1 md:min-h-0 flex flex-col overflow-hidden">
                <DataTable
                    table={table}
                    emptyMessage="Tidak ada data pergerakan stok."
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
