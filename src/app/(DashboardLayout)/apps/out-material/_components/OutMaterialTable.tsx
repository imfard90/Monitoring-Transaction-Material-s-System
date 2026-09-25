import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Eye, Search } from 'lucide-react';
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

interface OutMaterialTableProps {
    data: any[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    whOptions: string[];
    whFilter: string;
    onWhChange: (val: string) => void;
    onViewDetail: (row: any) => void;
}

const columnHelper = createColumnHelper<any>();

export default function OutMaterialTable({
    data,
    isLoading,
    searchQuery,
    onSearchChange,
    whOptions,
    whFilter,
    onWhChange,
    onViewDetail,
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
            cell: (info) => {
                const val = info.getValue();
                let color = 'bg-gray-500/10 text-gray-800';
                if (val === 'wait_approve') color = 'bg-yellow-500/10 text-yellow-800';
                else if (val === 'request') color = 'bg-blue-500/10 text-blue-800';
                else if (val === 'intech') color = 'bg-purple-500/10 text-purple-800';
                else if (val === 'close') color = 'bg-green-500/10 text-green-800';
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
        <div className="space-y-4 flex flex-col flex-1 min-h-0">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex gap-3 flex-wrap items-center">
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
                {/* No Create Button based on requirements */}
            </div>

            <div className="rounded-md border flex-1 overflow-auto">
                <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b sticky top-0 z-10 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-3 py-1.5 font-semibold">
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
                                    className="px-3 py-4 text-center text-gray-500"
                                >
                                    Loading data...
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-3 py-4 text-center text-gray-500"
                                >
                                    No materials found.
                                </td>
                            </tr>
                        ) : (
                            <AnimatePresence>
                                {table.getRowModel().rows.map((row, i) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, delay: i * 0.03 }}
                                        className="bg-white border-b hover:bg-gray-50"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-3 py-1.5">
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </td>
                                        ))}
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </div>
                <div className="flex gap-2">
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
