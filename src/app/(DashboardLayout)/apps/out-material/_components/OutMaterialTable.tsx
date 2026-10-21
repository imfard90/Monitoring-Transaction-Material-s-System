import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Eye, FilterX } from 'lucide-react';
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
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
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
            size: 160,
            cell: (info) =>
                info.getValue() ? format(new Date(info.getValue()), 'dd MMM yyyy HH:mm') : '-',
        }),
        columnHelper.accessor('id_trx', {
            header: 'ID Trx',
            size: 180,
            cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('request_id', {
            header: 'ID Permintaan',
            size: 140,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nik_teknisi', {
            header: 'NIK Teknisi',
            size: 110,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_teknisi', {
            header: 'Nama Teknisi',
            size: 180,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('name_sa', {
            header: 'Nama SA',
            size: 130,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nama_gudang', {
            header: 'Nama Gudang',
            size: 150,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('id_reservasi', {
            header: 'ID Reservasi',
            size: 140,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('sap_number', {
            header: 'Nomor SAP',
            size: 140,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('end_status', {
            header: 'Status',
            size: 130,
            cell: (info) => <StatusBadge status={info.getValue() || 'wait_approve'} />,
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Aksi',
            size: 70,
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
            <StaggerItem className="flex justify-between items-center gap-4 mb-4 p-0.5">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <SearchField
                        wrapperClassName="w-full md:w-80"
                        placeholder="Cari ID permintaan, reservasi, SAP..."
                        className="bg-background"
                        value={searchQuery}
                        onValueChange={onSearchChange}
                    />
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
                                <p>Hapus semua filter</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </StaggerItem>

            <StaggerItem>
                <DataTable
                    table={table}
                    isLoading={isLoading}
                    emptyMessage="Tidak ada data material."
                    className="rounded-md border border-border overflow-auto relative max-h-[600px]"
                />
            </StaggerItem>
            <StaggerItem className="py-2 px-1">
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
