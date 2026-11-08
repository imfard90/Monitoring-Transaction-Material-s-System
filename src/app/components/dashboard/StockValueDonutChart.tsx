'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type WarehouseOption = { id: number; name: string };

interface StockComparisonData {
    stockInventoryRp: number;
    stockIntechRp: number;
    totalRp: number;
    inventoryPercentage: number;
    intechPercentage: number;
    totalInventoryQty: number;
    totalIntechQty: number;
}

function formatCompactRp(value: number): string {
    if (!value || Number.isNaN(value)) return 'Rp 0';
    if (value >= 1_000_000_000) {
        return `Rp ${(value / 1_000_000_000).toLocaleString('id-ID', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
        })} M`;
    }
    if (value >= 1_000_000) {
        return `Rp ${(value / 1_000_000).toLocaleString('id-ID', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
        })} Jt`;
    }
    if (value >= 1_000) {
        return `Rp ${(value / 1_000).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
        })} Rb`;
    }
    return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatRupiahFull(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

export const StockValueDonutChart: React.FC<{
    isStaff: boolean;
    warehouses: WarehouseOption[];
}> = ({ isStaff, warehouses }) => {
    const cardRef = useScrollReveal();
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const targetWh = isStaff ? 'all' : selectedWh;

    const defaultData: StockComparisonData = {
        stockInventoryRp: 0,
        stockIntechRp: 0,
        totalRp: 0,
        inventoryPercentage: 0,
        intechPercentage: 0,
        totalInventoryQty: 0,
        totalIntechQty: 0,
    };

    const { data = defaultData, isLoading: loading } = useQuery({
        queryKey: queryKeys.dashboard.stockValue(targetWh),
        queryFn: async () => {
            const { getStockValueComparison } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getStockValueComparison(targetWh);
            return res.success && res.data ? res.data : defaultData;
        },
        staleTime: 60 * 1000,
    });

    const chartSeries = useMemo(() => {
        if (data.totalRp === 0) {
            return [0, 0];
        }
        return [data.stockInventoryRp, data.stockIntechRp];
    }, [data.stockInventoryRp, data.stockIntechRp, data.totalRp]);

    const chartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: 'donut',
                fontFamily: 'inherit',
                foreColor: 'var(--muted-foreground)',
                toolbar: { show: false },
                animations: {
                    enabled: true,
                    speed: 550,
                },
            },
            labels: ['Gudang (Inventory)', 'Teknisi (Intech)'],
            colors: ['#2563EB', '#F59E0B'],
            stroke: {
                width: 2,
                colors: ['var(--card)'],
            },
            dataLabels: {
                enabled: false,
            },
            legend: {
                show: false,
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '60%',
                        background: 'transparent',
                        labels: {
                            show: true,
                            name: {
                                show: true,
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                offsetY: -3,
                                color: 'var(--muted-foreground)',
                            },
                            value: {
                                show: true,
                                fontSize: '16px',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                offsetY: 4,
                                color: 'var(--foreground)',
                                formatter: (val: string) => formatCompactRp(Number(val)),
                            },
                            total: {
                                show: true,
                                label: 'Total Aset',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                fontWeight: 600,
                                color: 'var(--muted-foreground)',
                                formatter: () => formatCompactRp(data.totalRp),
                            },
                        },
                    },
                },
            },
            tooltip: {
                theme: 'dark',
                fillSeriesColor: false,
                y: {
                    formatter: (val: number) => {
                        const pct =
                            data.totalRp > 0 ? ((val / data.totalRp) * 100).toFixed(1) : '0';
                        return `${formatRupiahFull(val)} (${pct}%)`;
                    },
                },
            },
        }),
        [data.totalRp]
    );

    return (
        <Card
            ref={cardRef} className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 motion-reduce:transition-none h-full w-full relative overflow-hidden flex flex-col justify-between">
            {/* Ambient decorative gradient */}
            <div
                className="absolute top-0 left-0 w-full h-20 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 flex flex-col h-full justify-between">
                {/* Header & Filter */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Nilai Stok Material
                        </h2>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            Gudang vs Teknisi (Rupiah)
                        </p>
                    </div>

                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-39 h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
                                <SelectValue placeholder="Pilih Gudang" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Gudang</SelectItem>
                                {warehouses.map((wh) => (
                                    <SelectItem key={wh.id} value={String(wh.id)}>
                                        {wh.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Donut Chart Content */}
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-47.5">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 w-full py-6">
                            <Skeleton className="h-36 w-36 rounded-full" />
                            <Skeleton className="h-4 w-28" />
                        </div>
                    ) : data.totalRp === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center p-4 my-auto text-muted-foreground">
                            <div className="p-2.5 rounded-full bg-muted/40 mb-1.5">
                                <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/40" />
                            </div>
                            <p className="text-xs font-semibold">Tidak Ada Data Stok</p>
                            <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                                Belum ada saldo stok atau transaksi intech untuk gudang ini.
                            </p>
                        </div>
                    ) : (
                        <div className="w-full flex justify-center py-1">
                            <Chart
                                options={chartOptions}
                                series={chartSeries}
                                type="donut"
                                height={200}
                                width="100%"
                            />
                        </div>
                    )}
                </div>

                {/* Metrics Breakdown (Dual Health Cards) */}
                <div className="mt-2 pt-2.5 border-t border-border/60 space-y-2">
                    {/* Stock Inventory */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#2563EB]/5 border border-[#2563EB]/20 text-xs">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                                Stok Gudang (Inventory)
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                {data.totalInventoryQty.toLocaleString('id-ID')} unit barang
                            </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                            <span
                                title={formatRupiahFull(data.stockInventoryRp)}
                                className="font-bold text-foreground font-mono tabular-nums"
                            >
                                {formatCompactRp(data.stockInventoryRp)}
                            </span>
                            <span className="text-[10px] font-semibold text-[#2563EB] dark:text-blue-400 font-mono">
                                {data.inventoryPercentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Stock Intech */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#F59E0B]/5 border border-[#F59E0B]/20 text-xs">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-semibold text-[#F59E0B] dark:text-amber-400 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                                Stok Lapangan (Intech)
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                {data.totalIntechQty.toLocaleString('id-ID')} unit barang
                            </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                            <span
                                title={formatRupiahFull(data.stockIntechRp)}
                                className="font-bold text-foreground font-mono tabular-nums"
                            >
                                {formatCompactRp(data.stockIntechRp)}
                            </span>
                            <span className="text-[10px] font-semibold text-[#F59E0B] dark:text-amber-400 font-mono">
                                {data.intechPercentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Total Material Asset */}
                    <div className="pt-1.5 flex items-center justify-between text-xs px-1">
                        <span className="text-muted-foreground font-medium text-[11px]">
                            Total Nilai Aset:
                        </span>
                        <span
                            title={formatRupiahFull(data.totalRp)}
                            className="font-extrabold text-foreground font-mono tabular-nums text-xs"
                        >
                            {formatRupiahFull(data.totalRp)}
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default StockValueDonutChart;
