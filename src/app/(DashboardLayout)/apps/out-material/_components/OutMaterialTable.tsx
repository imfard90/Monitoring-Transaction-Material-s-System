import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OutMaterialTableProps {
    data: any[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    onViewDetail: (row: any) => void;
}

const columnHelper = createColumnHelper<any>();

export default function OutMaterialTable({
    data,
    isLoading,
    searchQuery,
    onSearchChange,
    onViewDetail,
}: OutMaterialTableProps) {
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
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative w-80">
                    <Input
                        placeholder="Search request id, reservasi, sap..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9"
                    />
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        size={16}
                    />
                </div>
                {/* No Create Button based on requirements */}
            </div>

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
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
                                    No materials found.
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
