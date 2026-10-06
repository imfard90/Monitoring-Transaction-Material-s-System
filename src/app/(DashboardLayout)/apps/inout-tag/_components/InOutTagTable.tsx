import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Edit2, Eye, FilterX, Plus, Search } from 'lucide-react';
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
import type { InOutTagRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';

interface InOutTagTableProps {
    data: InOutTagRow[];
    isLoading: boolean;
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
}

const columnHelper = createColumnHelper<InOutTagRow>();

export default function InOutTagTable({
    data,
    isLoading,
    searchQuery,
    onSearchChange,
    toWhOptions,
    toWhFilter,
    onToWhChange,
    onClearFilters,
    onCreateClick,
    onViewDetail,
    onUpdateClick,
    dateFilter,
    onDateFilterChange,
}: InOutTagTableProps) {
    const [openCombo, setOpenCombo] = useState(false);

    // Columns order: request time, id trx, from wh, to wh, request id, send id, vendor, accept id, status, action
    const columns = [
        columnHelper.accessor('request_time', {
            header: 'Request Time',
            cell: (info) =>
                info.getValue()
                    ? format(new Date(info.getValue() as string), 'dd MMM yyyy HH:mm')
                    : '-',
        }),
        columnHelper.accessor('id_trx', {
            header: 'ID Trx',
            cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('from_wh_name', {
            header: 'From WH',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('to_wh_name', {
            header: 'To WH',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('request_id', {
            header: 'Request ID',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('send_id', {
            header: 'Send ID',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('name_vendor', {
            header: 'Vendor',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('accept_id', {
            header: 'Accept ID',
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
                const isClosed = row.end_status === 'closed' || row.end_status === 'cancel';

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

                            {!isClosed && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onUpdateClick(row)}
                                            className="h-8 w-8 text-blue-600"
                                        >
                                            <Edit2 size={16} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Update Tag</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
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
        <StaggerContainer className="space-y-4">
            <StaggerItem className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1 w-full">
                    <div className="relative w-full md:w-64">
                        <Input
                            placeholder="Search request, send, accept id..."
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

                    {/* To WH Combobox Filter */}
                    <Popover open={openCombo} onOpenChange={setOpenCombo}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCombo}
                                className="w-full md:w-[200px] justify-between font-normal bg-white"
                            >
                                {toWhFilter === 'all' ? 'All Destination' : toWhFilter}
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
                                                onToWhChange('all');
                                                setOpenCombo(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    toWhFilter === 'all'
                                                        ? 'opacity-100'
                                                        : 'opacity-0'
                                                )}
                                            />
                                            All Destination
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
                                                        'mr-2 h-4 w-4',
                                                        toWhFilter === wh
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

                <Button
                    onClick={onCreateClick}
                    className="flex items-center gap-2 w-full md:w-auto"
                >
                    <Plus size={16} /> Create Tag
                </Button>
            </StaggerItem>

            <StaggerItem>
                <DataTable table={table} isLoading={isLoading} emptyMessage="No tags found." />
            </StaggerItem>
            <StaggerItem>
                <DataTablePagination table={table} />
            </StaggerItem>
        </StaggerContainer>
    );
}
