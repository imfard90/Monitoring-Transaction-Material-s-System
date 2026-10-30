import { format } from 'date-fns';
import { Check, ChevronsUpDown, Edit2, Eye, FilterX, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { StatusBadge } from '@/app/components/shared/StatusBadge';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
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
import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@/lib/table';
import type { InOutTagRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';

interface InOutTagTableProps {
    data: InOutTagRow[];
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
    toWhOptions: string[];
    toWhFilter: string;
    onToWhChange: (val: string) => void;
    onClearFilters?: () => void;
    onCreateClick: () => void;
    onViewDetail: (row: InOutTagRow) => void;
    onUpdateClick: (row: InOutTagRow) => void;
    dateFilter: DateRange | undefined;
    onDateFilterChange: (val: DateRange | undefined) => void;
    canCreateTag: boolean;
}

const columnHelper = createColumnHelper<InOutTagRow>();

export default function InOutTagTable({
    data,
    pagination,
    onPaginationChange,
    isLoading = false,
    searchQuery,
    onSearchChange,
    toWhOptions,
    toWhFilter,
    onToWhChange,
    onClearFilters,
    onCreateClick,
    onViewDetail,
    onUpdateClick,
    canCreateTag,
    dateFilter,
    onDateFilterChange,
}: InOutTagTableProps) {
    const [openCombo, setOpenCombo] = useState(false);

    const columns = [
        columnHelper.accessor('request_time', {
            header: 'Waktu Permintaan',
            size: 160,
            cell: (info) =>
                info.getValue()
                    ? format(new Date(info.getValue() as string), 'dd MMM yyyy HH:mm')
                    : '-',
        }),
        columnHelper.accessor('id_trx', {
            header: 'ID Trx',
            size: 180,
            cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('from_wh_name', {
            header: 'Dari Gudang',
            size: 150,
            cell: (info) => {
                const val = info.getValue();
                return (
                    <div className="truncate max-w-37.5" title={val || undefined}>
                        {val || '-'}
                    </div>
                );
            },
        }),
        columnHelper.accessor('to_wh_name', {
            header: 'Tujuan Gudang',
            size: 150,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('request_id', {
            header: 'ID Permintaan',
            size: 140,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('send_id', {
            header: 'ID Kirim',
            size: 140,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('name_vendor', {
            header: 'Vendor',
            size: 150,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('accept_id', {
            header: 'ID Terima',
            size: 130,
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('end_status', {
            header: 'Status',
            size: 130,
            cell: (info) => <StatusBadge status={info.getValue() || 'requested'} />,
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Aksi',
            size: 90,
            cell: (info) => {
                const row = info.row.original;
                const isClosed = row.end_status === 'closed' || row.end_status === 'cancel';
                return (
                    <TooltipProvider>
                        <div className="flex gap-1">
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

                            {!isClosed && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onUpdateClick(row)}
                                            className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                                        >
                                            <Edit2 size={16} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Perbarui Tag</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
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

    const hasActiveFilters = Boolean(
        searchQuery.trim() || dateFilter?.from || (toWhFilter && toWhFilter !== 'all')
    );

    const handleResetAll = useCallback(() => {
        if (onClearFilters) {
            onClearFilters();
        } else {
            onSearchChange('');
            onDateFilterChange?.(undefined);
            onToWhChange('all');
        }
    }, [onClearFilters, onSearchChange, onDateFilterChange, onToWhChange]);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetAll,
    });

    return (
        <StaggerContainer className="space-y-4 flex flex-col flex-1 w-full min-w-0 max-w-full md:h-full md:min-h-0">
            <StaggerItem className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 shrink-0 p-0.5 w-full min-w-0 max-w-full">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                    <SearchField
                        wrapperClassName="w-full sm:w-64 lg:w-72 shrink-0"
                        placeholder="Cari ID permintaan, kirim, terima..."
                        className="bg-background"
                        value={searchQuery}
                        onValueChange={onSearchChange}
                        onClear={handleResetAll}
                    />

                    <DateRangePicker
                        date={dateFilter}
                        setDate={onDateFilterChange}
                        className="w-full sm:w-65 shrink-0"
                    />

                    {/* To WH Combobox Filter */}
                    <Popover open={openCombo} onOpenChange={setOpenCombo}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCombo}
                                className="w-full sm:w-45 justify-between font-normal h-9 px-3 shrink-0"
                            >
                                <span className="truncate">
                                    {toWhFilter === 'all' ? 'Semua Tujuan' : toWhFilter}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-55 p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Cari gudang tujuan..." />
                                <CommandEmpty>Gudang tidak ditemukan.</CommandEmpty>
                                <CommandList>
                                    <CommandGroup>
                                        <CommandItem
                                            value="all"
                                            onSelect={() => {
                                                onToWhChange('all');
                                                setOpenCombo(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 shrink-0',
                                                    toWhFilter === 'all'
                                                        ? 'opacity-100'
                                                        : 'opacity-0'
                                                )}
                                            />
                                            Semua Tujuan
                                        </CommandItem>
                                        {toWhOptions.map((wh) => (
                                            <CommandItem
                                                key={wh}
                                                value={wh}
                                                onSelect={(currentValue) => {
                                                    onToWhChange(currentValue);
                                                    setOpenCombo(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4 shrink-0',
                                                        toWhFilter === wh
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

                <div className="flex items-center gap-2 self-end lg:self-auto shrink-0 w-full sm:w-auto justify-end">
                    {onClearFilters && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={onClearFilters}
                                        className="bg-background shrink-0"
                                    >
                                        <FilterX className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Hapus semua filter (Esc)</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    {canCreateTag && (
                        <Button
                            onClick={onCreateClick}
                            className="flex items-center gap-2 w-full sm:w-auto shrink-0"
                        >
                            <Plus size={16} />
                            Buat Tag
                        </Button>
                    )}
                </div>
            </StaggerItem>

            <StaggerItem className="flex-1 md:min-h-0 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                <DataTable
                    table={table}
                    isLoading={isLoading}
                    emptyMessage="Tidak ada data tag."
                    className="rounded-md border border-border flex-1 w-full min-w-0 max-w-full overflow-x-auto relative max-h-150"
                />
            </StaggerItem>
            <StaggerItem className="py-2 px-1 shrink-0 w-full min-w-0 max-w-full">
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
