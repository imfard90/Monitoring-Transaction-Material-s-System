import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Edit2, Eye, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

interface InOutTagTableProps {
    data: any[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    toWhOptions: string[];
    toWhFilter: string;
    onToWhChange: (val: string) => void;
    onCreateClick: () => void;
    onViewDetail: (row: any) => void;
    onUpdateClick: (row: any) => void;
}

const columnHelper = createColumnHelper<any>();

export default function InOutTagTable({
    data,
    isLoading,
    searchQuery,
    onSearchChange,
    toWhOptions,
    toWhFilter,
    onToWhChange,
    onCreateClick,
    onViewDetail,
    onUpdateClick,
}: InOutTagTableProps) {
    const [openCombo, setOpenCombo] = useState(false);

    // Columns order: request time, id trx, from wh, to wh, request id, send id, vendor, accept id, status, action
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
            cell: (info) => {
                const val = info.getValue();
                let color = 'bg-gray-500/10 text-gray-800';
                if (val === 'requested') color = 'bg-blue-500/10 text-blue-800';
                else if (val === 'in_transit') color = 'bg-yellow-500/10 text-yellow-800';
                else if (val === 'closed') color = 'bg-green-500/10 text-green-800';
                else if (val === 'cancel') color = 'bg-red-500/10 text-red-800';

                return (
                    <Badge className={`capitalize border-none ${color}`} variant="outline">
                        {val?.replace('_', ' ')}
                    </Badge>
                );
            },
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
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
                </div>

                <Button
                    onClick={onCreateClick}
                    className="flex items-center gap-2 w-full md:w-auto"
                >
                    <Plus size={16} /> Create Tag
                </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-6 py-3 font-semibold">
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
                        {isLoading ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-6 py-8 text-center text-gray-500"
                                >
                                    Loading data...
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-6 py-8 text-center text-gray-500"
                                >
                                    No tags found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-6 py-4">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
