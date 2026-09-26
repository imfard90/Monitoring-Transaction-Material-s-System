'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Plus, Search, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toggleTechnicianStatus } from './actions';
import { TechnicianDialog } from './technician-dialog';

interface TechnicianTableProps {
    data: any[];
    branches: any[];
    mitras: any[];
}

const columnHelper = createColumnHelper<any>();

export default function TechnicianTable({ data, branches, mitras }: TechnicianTableProps) {
    const [isPending, startTransition] = useTransition();
    const [nikFilter, setNikFilter] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedTechnician, setSelectedTechnician] = useState<any>(null);

    // Extract unique service areas for the filter
    const serviceAreas = useMemo(() => {
        const areas = data.map((item) => item.service_area).filter(Boolean);
        return Array.from(new Set(areas)).sort();
    }, [data]);

    // Apply filters
    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const matchNik = item.nik?.toLowerCase().includes(nikFilter.toLowerCase()) ?? false;
            const matchWh = whFilter === 'all' || item.service_area === whFilter;
            return matchNik && matchWh;
        });
    }, [data, nikFilter, whFilter]);

    const handleToggleStatus = (id: number, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleTechnicianStatus(id, !currentStatus);
                toast.success(`Technician status ${currentStatus ? 'deactivated' : 'activated'}`);
            } catch (error: any) {
                toast.error(error.message || 'Failed to update status');
            }
        });
    };

    const columns = [
        columnHelper.accessor('service_area', {
            header: 'Service Area',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nik', {
            header: 'NIK',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('name', {
            header: 'Nama',
            cell: (info) => <span className="font-medium">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('mitra_name', {
            header: 'Mitra',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('is_active', {
            header: 'Status',
            cell: (info) => {
                const isActive = info.getValue() === true;
                const id = info.row.original.id;
                return (
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(id, isActive)}
                            disabled={isPending}
                        />
                        <span className="text-sm text-muted-foreground">
                            {isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            cell: (info) => {
                return (
                    <div className="flex justify-center items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                            title="Edit Technician"
                            onClick={() => {
                                setSelectedTechnician(info.row.original);
                                setIsDialogOpen(true);
                            }}
                        >
                            <Pencil size={16} />
                        </Button>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 15 } },
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4 flex flex-col p-4"
        >
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {/* Search by NIK */}
                    <div className="relative w-full sm:w-[250px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by NIK..."
                            value={nikFilter}
                            onChange={(e) => setNikFilter(e.target.value)}
                            className="pl-9 pr-9"
                        />
                        {nikFilter && (
                            <button
                                type="button"
                                onClick={() => setNikFilter('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground flex items-center justify-center"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter by WH */}
                    <div className="w-full sm:w-[200px]">
                        <Select value={whFilter} onValueChange={setWhFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by WH" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Service Areas</SelectItem>
                                {serviceAreas.map((area: any) => (
                                    <SelectItem key={area} value={area}>
                                        {area}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Insert Button */}
                <Button
                    className="w-full sm:w-auto gap-2"
                    onClick={() => {
                        setSelectedTechnician(null);
                        setIsDialogOpen(true);
                    }}
                >
                    <Plus size={16} />
                    Insert Technician
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
                    <thead className="text-sm text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-300 border-b sticky top-0 z-10 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-4 py-1.5 font-semibold">
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
                        {filteredData.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-6 text-center text-gray-500"
                                >
                                    No technicians found.
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
                                        className="bg-card border-b hover:bg-muted/50"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-4 py-1.5">
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
            <div className="flex items-center justify-between px-2 py-2">
                <div className="text-sm text-muted-foreground">
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

            <TechnicianDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                initialData={selectedTechnician}
                branches={branches}
                mitras={mitras}
            />
        </motion.div>
    );
}
