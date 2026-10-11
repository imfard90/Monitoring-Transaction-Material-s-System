import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Eye, FilterX, Search } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { StatusBadge } from '@/app/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { OutMaterialRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';

interface OutMaterialTableProps {
    data: OutMaterialRow[];
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    onPaginationChange?: (page: number, pageSize: number) => void;
    isLoading?: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    whOptions: string[];
    whFilter: string;
    onWhChange: (val: string) => void;
    onViewDetail: (row: OutMaterialRow) => void;
    dateFilter: DateRange | undefined;
    onDateFilterChange: (val: DateRange | undefined) => void;
    onClearFilters?: () => void;
}

const columnHelper = createColumnHelper<OutMaterialRow>();

export default function OutMaterialTable({
    data,
    pagination,
    onPaginationChange,
    isLoading = false,
    searchQuery,
    onSearchChange,
    whOptions,
    whFilter,
    onWhChange,
    onViewDetail,
    dateFilter,
    onDateFilterChange,
    onClearFilters,
}: OutMaterialTableProps) {
    const [openCombo, setOpenCombo] = useState(false);

    const columns = [
        columnHelper.accessor('request_time', {
            header: 'Request Time',
            cell: (info) =>
                info.getValue() ? format(new Date(info.getValue()), 'dd MMM yyyy HH:mm') : '-',
        }),
        columnHelper.accessor('id_trx', {
            header: 'ID Trx',
            cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('request_id', {
            header: 'Request ID',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nik_teknisi', {
            header: 'NIK Teknisi',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_teknisi', {
            header: 'Nama Teknisi',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('name_sa', {
            header: 'Nama SA',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_gudang', {
            header: 'Nama Gudang',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('id_reservasi', {
            header: 'ID Reservasi',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('sap_number', {
            header: 'SAP Number',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('end_status', {
            header: 'Status',
            cell: (info) => <StatusBadge status={info.getValue() || 'wait_approve'} />,
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Action',
            cell: (info) => {
                const row = info.row.original;
                return (
                    <TooltipProvider>
                        <div className="flex items-center gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onViewDetail(row)}
                                        className="h-8 w-8 text-primary"
                                    >
                                        <Eye size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>View Details</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </TooltipProvider>
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
        <StaggerContainer className="space-y-4">
            <StaggerItem className="flex justify-between items-center gap-4 mb-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <div className="relative w-full md:w-80">
                        <Input
                            placeholder="Search request id, reservasi, sap..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 bg-background"
                        />
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            size={16}
                        />
                    </div>
                    <DateRangePicker
                        date={dateFilter}
                        setDate={onDateFilterChange}
                        className="w-full md:w-auto"
                    />
                    {/* Warehouse Filter */}
                    <Popover open={openCombo} onOpenChange={setOpenCombo}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCombo}
                                className="w-[200px] justify-between font-normal h-9 px-3"
                            >
                                <span className="truncate">
                                    {whFilter === 'all' ? 'Semua Gudang' : whFilter}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Cari gudang..." />
                                <CommandEmpty>Gudang tidak ditemukan.</CommandEmpty>
                                <CommandList>
                                    <CommandGroup>
                                        <CommandItem
                                            value="all"
                                            onSelect={() => {
                                                onWhChange('all');
                                                setOpenCombo(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 shrink-0',
                                                    whFilter === 'all' ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            Semua Gudang
                                        </CommandItem>
                                        {whOptions.map((wh) => (
                                            <CommandItem
                                                key={wh}
                                                value={wh}
                                                onSelect={(currentValue) => {
                                                    onWhChange(currentValue);
                                                    setOpenCombo(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4 shrink-0',
                                                        whFilter === wh
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
                                                    )}
                                                />
                                                <span className="truncate">{wh}</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
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
                                <p>Clear all filters</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </StaggerItem>

            <StaggerItem>
                <DataTable
                    table={table}
                    isLoading={isLoading}
                    emptyMessage="No materials found."
                    className="rounded-md border border-border overflow-auto relative max-h-[600px]"
                />
            </StaggerItem>
            <StaggerItem className="py-2 px-1">
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
