'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getDashboardStockIntech } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { DataTable } from '@/app/components/shared/DataTable';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { Input } from '@/components/ui/input';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import CardBox from '../shared/CardBox';

interface StockIntechItem {
    branch: string | null;
    wh_name: string | null;
    teknisi: string | null;
    nik: string | null;
    material_code: string;
    material_name: string | null;
    qty_intech: number;
}

const columnHelper = createColumnHelper<StockIntechItem>();

export const StockIntechOverview = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [openCombo, setOpenCombo] = useState(false);
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
            header: 'Warehouse',
            cell: (info) => <span className="text-gray-500">{info.getValue() || '-'}</span>,
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
            header: 'Material Code',
            cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
        }),
        columnHelper.accessor('material_name', {
            header: 'Material Name',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('qty_intech', {
            header: () => <div className="text-center">Qty Intech</div>,
            cell: (info) => (
                <div className="text-center font-bold text-blue-600">{info.getValue()}</div>
            ),
        }),
    ];

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <StaggerContainer className="flex flex-col flex-1 min-h-0">
            <StaggerItem className="flex flex-col flex-1 min-h-0">
                <CardBox className="flex flex-col flex-1 min-h-0 p-6">
                    <div
                        id="stock-intech"
                        className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                        <div>
                            <h5 className="card-title">Stock Intech Overview</h5>
                            <p className="text-sm text-muted-foreground font-normal">
                                Sisa material yang masih di tangan teknisi (Status: Intech)
                            </p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                <Input
                                    type="search"
                                    placeholder="Cari NIK/Teknisi/Material..."
                                    className="pl-9 bg-white"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
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
                </CardBox>
            </StaggerItem>
        </StaggerContainer>
    );
};
