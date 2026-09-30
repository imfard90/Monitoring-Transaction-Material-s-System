import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Eye, FilterX, Search } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/app/components/shared/DateRangePicker';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { OutMaterialRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';

interface OutMaterialTableProps {
    data: OutMaterialRow[];
    isLoading: boolean;
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
    isLoading,
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
    // Columns order: request time, id trx, request_id, nik teknisi, nama teknisi, nama sa, nama gudang, id reservasi, sap number, end_status, action
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
            cell: (info) => <StatusBadge status={info.getValue()} />,
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            cell: (info) => {
                const row = info.row.original;

                return (
                    <TooltipProvider>
                        <div className="flex justify-center items-center gap-2">
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

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 15 } },
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center gap-4 mb-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 flex-1">
                    <div className="relative w-full md:w-80">
                        <Input
                            placeholder="Search request id, reservasi, sap..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 bg-white"
                        />
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                                className="w-[200px] justify-between font-normal bg-white"
                            >
                                {whFilter === 'all' ? 'All Warehouses' : whFilter}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search WH..." />
                                <CommandEmpty>No WH found.</CommandEmpty>
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
                                                    'mr-2 h-4 w-4',
                                                    whFilter === 'all' ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            All Warehouses
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
                                                        'mr-2 h-4 w-4',
                                                        whFilter === wh
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
                                                    )}
                                                />
                                                {wh}
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

            <DataTable table={table} isLoading={isLoading} emptyMessage="No materials found." />
            <DataTablePagination table={table} />
        </div>
    );
}
