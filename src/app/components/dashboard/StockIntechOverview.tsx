'use client';

import { useQuery } from '@tanstack/react-query';
import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@/lib/table';
import { useCallback, useMemo, useState } from 'react';
import { getDashboardStockIntech } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { SearchField } from '@/components/ui/search-field';
import { formatStockAge } from '@/lib/stock-intech-age';

interface StockIntechItem {
    branch: string | null;
    wh_name: string | null;
    teknisi: string | null;
    nik: string | null;
    request_time: string | Date;
    material_code: string;
    material_name: string | null;
    qty_intech: number;
}

const columnHelper = createColumnHelper<StockIntechItem>();

export const StockIntechOverview = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [openCombo, setOpenCombo] = useState(false);

    const hasActiveFilters = Boolean(searchQuery.trim() || whFilter !== 'all');

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setWhFilter('all');
    }, []);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });
    const { data, isLoading } = useQuery({
        queryKey: ['dashboardStockIntech'],
        queryFn: getDashboardStockIntech,
    });

    const stockData = (data?.data as StockIntechItem[]) || [];

    const uniqueWhs = useMemo(() => {
        const set = new Set(stockData.map((item: StockIntechItem) => item.wh_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [stockData]);

    const filteredData = useMemo(() => {
        return stockData.filter((item: StockIntechItem) => {
            const matchesWh = whFilter === 'all' || item.wh_name === whFilter;

            if (!searchQuery) return matchesWh;
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                item.nik?.toLowerCase().includes(q) ||
                item.teknisi?.toLowerCase().includes(q) ||
                item.material_code.toLowerCase().includes(q) ||
                item.material_name?.toLowerCase().includes(q);

            return matchesWh && matchesSearch;
        });
    }, [stockData, searchQuery, whFilter]);

    const columns = [
        columnHelper.accessor('branch', {
            header: 'Branch',
            cell: (info) => <span className="font-medium">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('wh_name', {
            header: 'Gudang',
            cell: (info) => <span className="text-muted-foreground">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('nik', {
            header: 'NIK',
            cell: (info) => <span className="font-mono text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('teknisi', {
            header: 'Teknisi',
            cell: (info) => <span className="font-semibold">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('material_code', {
            header: 'Kode Material',
            cell: (info) => (
                <span className="inline-flex rounded-md border border-border/70 bg-muted/60 px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-sm">
                    {info.getValue() || '-'}
                </span>
            ),
        }),
        columnHelper.accessor('material_name', {
            header: 'Nama Material',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('qty_intech', {
            header: () => <div className="text-center">Jumlah Intech</div>,
            cell: (info) => (
                <div className="text-center font-bold text-primary">{info.getValue()}</div>
            ),
        }),
        columnHelper.accessor('request_time', {
            header: 'Usia',
            cell: (info) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {formatStockAge(info.getValue())}
                </span>
            ),
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
        <StaggerContainer className="flex flex-col flex-1 min-h-0">
            <StaggerItem className="flex flex-col flex-1 min-h-0">
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none flex flex-col flex-1 min-h-0 p-6">
                    <div
                        id="stock-intech"
                        className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                        <div>
                            <h2 className="card-title">Ringkasan Stok Intech</h2>
                            <p className="text-sm text-muted-foreground font-normal">
                                Sisa material yang masih di tangan teknisi (Status: Intech)
                            </p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <SearchField
                                wrapperClassName="w-full sm:w-64"
                                type="search"
                                placeholder="Cari NIK/Teknisi/Material..."
                                className="bg-background"
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                onClear={handleResetFilters}
                            />
                            <WarehouseCombobox
                                value={whFilter}
                                onValueChange={setWhFilter}
                                warehouses={uniqueWhs}
                                open={openCombo}
                                onOpenChange={setOpenCombo}
                            />
                        </div>
                    </div>
                    <DataTable
                        table={table}
                        isLoading={isLoading}
                        emptyMessage="Tidak ada material Intech."
                    />
                    <div className="pt-4">
                        <DataTablePagination table={table} />
                    </div>
                </Card>
            </StaggerItem>
        </StaggerContainer>
    );
};
