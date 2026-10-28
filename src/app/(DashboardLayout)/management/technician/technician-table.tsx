'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@/lib/table';
import { motion } from 'framer-motion';
import { Pencil, Plus } from 'lucide-react';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
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

export interface TechnicianItem {
    id: string | number;
    service_area: string | null;
    nik: string | null;
    name: string | null;
    mitra_name: string | null;
    is_active: boolean;
}

interface TechnicianTableProps {
    data: TechnicianItem[];
    branches: { id: number; service_area: string; branch: string }[];
    mitras: { id: number; mitra_name: string | null }[];
}

const columnHelper = createColumnHelper<TechnicianItem>();

export default function TechnicianTable({ data, branches, mitras }: TechnicianTableProps) {
    const [isPending, startTransition] = useTransition();
    const [nikFilter, setNikFilter] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedTechnician, setSelectedTechnician] = useState<TechnicianItem | null>(null);

    const hasActiveFilters = Boolean(nikFilter.trim() || whFilter !== 'all');

    const handleResetFilters = useCallback(() => {
        setNikFilter('');
        setWhFilter('all');
    }, []);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    // Extract unique service areas for the filter
    const serviceAreas = useMemo(() => {
        const areas = data.map((item) => item.service_area).filter(Boolean) as string[];
        return Array.from(new Set(areas)).sort();
    }, [data]);

    // Apply filters
    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const search = nikFilter.trim().toLowerCase();
            const matchSearch =
                !search ||
                item.nik?.toLowerCase().includes(search) ||
                item.name?.toLowerCase().includes(search);
            const matchWh = whFilter === 'all' || item.service_area === whFilter;
            return Boolean(matchSearch) && matchWh;
        });
    }, [data, nikFilter, whFilter]);

    const handleToggleStatus = (id: string | number, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleTechnicianStatus(id, !currentStatus);
                toast.success(`Status teknisi ${currentStatus ? 'dinonaktifkan' : 'diaktifkan'}`);
            } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : 'Gagal memperbarui status');
            }
        });
    };

    const columns = [
        columnHelper.accessor('service_area', {
            header: 'Area Layanan',
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
                            {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Aksi</div>,
            cell: (info) => {
                return (
                    <div className="flex justify-center items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                            title="Edit Teknisi"
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
        initialState: { pagination: { pageSize: 20 } },
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
                    <SearchField
                        wrapperClassName="w-full sm:w-[250px]"
                        placeholder="Cari berdasarkan NIK atau nama..."
                        value={nikFilter}
                        onValueChange={setNikFilter}
                        onClear={handleResetFilters}
                        clearLabel="Hapus filter NIK teknisi"
                    />

                    {/* Filter by WH */}
                    <div className="w-full sm:w-[200px]">
                        <Select value={whFilter} onValueChange={setWhFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter Area Layanan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Area Layanan</SelectItem>
                                {serviceAreas.map((area) => (
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
                    Tambah Teknisi
                </Button>
            </div>

            {/* Table */}
            <DataTable table={table} maxHeight="min(65vh, 720px)" />

            {/* Pagination Controls */}
            <DataTablePagination table={table} />

            <TechnicianDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                initialData={selectedTechnician as Record<string, unknown> | null}
                branches={branches}
                mitras={mitras}
            />
        </motion.div>
    );
}
