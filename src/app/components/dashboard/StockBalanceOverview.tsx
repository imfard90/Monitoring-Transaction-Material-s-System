'use client';

import { useQuery } from '@tanstack/react-query';
import {
    createColumnHelper,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import React, { useState } from 'react';
import { getStockBalances } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import CardBox from '@/app/components/shared/CardBox';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { SearchField } from '@/app/components/shared/SearchField';
import { WarehouseCombobox } from '@/app/components/shared/WarehouseCombobox';
import { OtherStockModal } from '@/app/components/dashboard/OtherStockModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { sortStockBalancesByRunout } from '@/lib/utils/stock-balance-order';

interface StockBalanceData {
    warehouse_name: string | null;
    branch_name: string | null;
    material_name: string | null;
    material_code: string | null;
    qty_stock: number;
    average_demand_weekly: number | null;
    has_out_material_history: boolean;
}

const columnHelper = createColumnHelper<StockBalanceData>();

export default function StockBalanceOverview() {
    const [searchQuery, setSearchQuery] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [openCombo, setOpenCombo] = useState(false);
    const [selectedMaterialCode, setSelectedMaterialCode] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['stockBalances'],
        queryFn: async () => {
            const res = await getStockBalances();
            if (!res.success) throw new Error('Failed to fetch stock balances');
            return res.data;
        },
        staleTime: 1000 * 60, // 1 minute
    });

    const balances = data || [];

    const uniqueWhs = React.useMemo(() => {
        const set = new Set(
            balances.map((b: StockBalanceData) => b.warehouse_name).filter(Boolean)
        );
        return Array.from(set).sort() as string[];
    }, [balances]);

    const filteredBalances = React.useMemo(() => {
        return balances.filter((b: StockBalanceData) => {
            const matchesWh = whFilter === 'all' || b.warehouse_name === whFilter;

            if (!searchQuery) return matchesWh;
            const lowerQuery = searchQuery.toLowerCase();
            const matchesSearch =
                b.material_name?.toLowerCase().includes(lowerQuery) ||
                b.material_code?.toLowerCase().includes(lowerQuery);

            return matchesWh && matchesSearch;
        });
    }, [balances, searchQuery, whFilter]);

    const sortedBalances = React.useMemo(
        () => sortStockBalancesByRunout(filteredBalances),
        [filteredBalances]
    );

    const columns = [
        columnHelper.accessor('warehouse_name', {
            header: 'Gudang',
            cell: (info) => <span className="font-medium">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('branch_name', {
            header: 'Branch',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('material_code', {
            header: 'Kode Material',
            cell: (info) => {
                const materialCode = info.getValue();
                if (!materialCode) return '-';

                return (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Filter saldo berdasarkan kode material ${materialCode} di semua gudang`}
                        className="h-auto rounded-md p-0 font-mono text-xs font-semibold text-foreground hover:bg-transparent"
                        onClick={() => {
                            setSearchQuery(materialCode);
                            setWhFilter('all');
                        }}
                    >
                        <Badge
                            variant="outline"
                            className="rounded-md border-border/70 bg-muted/60 px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-sm transition-colors hover:bg-muted"
                        >
                            {materialCode}
                        </Badge>
                    </Button>
                );
            },
        }),
        columnHelper.accessor('material_name', {
            header: 'Nama Material',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('qty_stock', {
            header: () => <div className="text-right">Jumlah Stok</div>,
            cell: (info) => {
                const qty = Number(info.getValue());
                return (
                    <div className="text-right font-medium">
                        <span className={qty <= 0 ? 'text-error' : 'text-foreground'}>
                            {qty.toLocaleString()}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'days_until_empty',
            header: () => <div className="text-right">Estimasi Stok Habis</div>,
            cell: ({ row }) => {
                const averageWeekly = Number(row.original.average_demand_weekly ?? 0);
                const hasHistory = row.original.has_out_material_history;
                const daysUntilEmpty =
                    averageWeekly > 0
                        ? Math.ceil((Number(row.original.qty_stock) / averageWeekly) * 7)
                        : null;

                return (
                    <div className="text-right">
                        {hasHistory ? (
                            daysUntilEmpty === null ? (
                                <span className="text-muted-foreground">Tidak habis</span>
                            ) : (
                                <>
                                    <div className="font-medium">
                                        Habis dalam {daysUntilEmpty} hari
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Rata-rata{' '}
                                        {averageWeekly.toLocaleString(undefined, {
                                            maximumFractionDigits: 2,
                                        })}{' '}
                                        / minggu
                                    </div>
                                </>
                            )
                        ) : (
                            <span className="text-muted-foreground">Belum ada data</span>
                        )}
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'other_location_stock',
            size: 48,
            header: () => (
                <div className="flex justify-center">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default">
                                <IconBuildingWarehouse
                                    className="h-4 w-4 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p>Stock lokasi lain</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            ),
            cell: ({ row }) => {
                const code = row.original.material_code;
                if (!code) return null;
                return (
                    <div className="flex justify-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Lihat stock material ${code} di gudang lain`}
                                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    onClick={() => setSelectedMaterialCode(code)}
                                >
                                    <IconBuildingWarehouse className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>Stock lokasi lain</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: sortedBalances,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 20 } },
    });

    return (
        <StaggerContainer className="flex flex-col flex-1 min-h-0">
            <StaggerItem className="flex flex-col flex-1 min-h-0">
                <CardBox className="flex flex-col flex-1 min-h-0 p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">
                                Saldo Stok Real-time
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Monitoring saldo material per gudang
                            </p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <SearchField
                                wrapperClassName="w-full sm:w-64"
                                placeholder="Cari kode atau nama material..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                clearLabel="Hapus pencarian material"
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
                        emptyMessage="Tidak ada data saldo stok."
                    />
                    <div className="pt-4">
                        <DataTablePagination table={table} />
                    </div>
                </CardBox>
            </StaggerItem>
            {/* Modal stock lokasi lain */}
            {selectedMaterialCode && (
                <OtherStockModal
                    isOpen={selectedMaterialCode !== null}
                    onClose={() => setSelectedMaterialCode(null)}
                    materialCode={selectedMaterialCode}
                />
            )}
        </StaggerContainer>
    );
}
