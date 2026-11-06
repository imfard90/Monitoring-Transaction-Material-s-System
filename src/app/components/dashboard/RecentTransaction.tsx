'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
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
type CategoryFilter = 'all' | 'cable' | 'accessories';

interface RawOutMaterialItem {
    material_code: string | null;
    material_name: string | null;
    material_unit?: string | null;
    total_qty: number;
}

const RecentTransaction: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

    const targetWh = isStaff ? 'all' : selectedWh;

    const {
        data: rawData = [],
        isLoading,
        isError: hasError,
    } = useQuery({
        queryKey: queryKeys.dashboard.recentTransaction(targetWh),
        queryFn: async () => {
            const { getTopOutMaterials } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getTopOutMaterials(7, isStaff ? 'all' : selectedWh);
            if (!result.success || !result.data) {
                return [];
            }
            return result.data as RawOutMaterialItem[];
        },
        staleTime: 60 * 1000,
    });

    // Client-side filtering by category
    const filteredData = useMemo(() => {
        if (categoryFilter === 'cable') {
            return rawData.filter((item) => {
                const code = (item.material_code || '').toUpperCase();
                const unit = (item.material_unit || '').toUpperCase();
                return unit === 'M' || code.includes('OF') || code.includes('KU');
            });
        }
        if (categoryFilter === 'accessories') {
            return rawData.filter((item) => {
                const code = (item.material_code || '').toUpperCase();
                const unit = (item.material_unit || '').toUpperCase();
                return unit !== 'M' && !code.includes('OF') && !code.includes('KU');
            });
        }
        return rawData;
    }, [rawData, categoryFilter]);

    const chartData = useMemo(() => {
        const categories = filteredData.map((d) => {
            const name = d.material_name || d.material_code || '';
            const truncated = name.length > 25 ? `${name.slice(0, 23)}...` : name;
            return d.material_code === 'AC-OF-SM-1-3SL' ? `${truncated} (x10)` : truncated;
        });

        const fullNames = filteredData.map((d) => d.material_name || d.material_code || '');
        const codes = filteredData.map((d) => d.material_code || '');
        const units = filteredData.map((d) => d.material_unit || 'Unit');
        const realQtys = filteredData.map((d) => Number(d.total_qty || 0));

        const seriesData = filteredData.map((d) => {
            const qty = Number(d.total_qty || 0);
            return d.material_code === 'AC-OF-SM-1-3SL' ? qty / 10 : qty;
        });

        return { categories, fullNames, codes, units, realQtys, seriesData };
    }, [filteredData]);

    const ChartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                toolbar: { show: false },
                type: 'bar',
                fontFamily: 'inherit',
                foreColor: 'var(--color-muted-foreground, #7C8FAC)',
                height: 300,
                animations: { enabled: true, speed: 450 },
            },
            colors: ['#0EA5E9'],
            plotOptions: {
                bar: {
                    horizontal: true,
                    borderRadius: 4,
                    barHeight: '48%',
                    dataLabels: {
                        position: 'top',
                    },
                },
            },
            dataLabels: {
                enabled: true,
                offsetX: 14,
                style: {
                    colors: ['var(--foreground)'],
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                },
                formatter: (_val, opts) => {
                    const idx = opts?.dataPointIndex ?? -1;
                    if (idx < 0) return '';
                    const realQty = chartData.realQtys[idx] ?? 0;
                    const unit = chartData.units[idx] ?? '';
                    return `${realQty.toLocaleString('id-ID')} ${unit}`;
                },
            },
            legend: { show: false },
            grid: { borderColor: 'var(--color-border, rgba(0,0,0,0.08))', strokeDashArray: 3 },
            xaxis: {
                categories: chartData.categories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                title: { text: 'Volume Pengeluaran (Drop Cable skala visual 1:10)' },
                labels: {
                    style: { fontSize: '10px', fontFamily: 'monospace' },
                    formatter: (val) => `${Number(val).toLocaleString('id-ID')}`,
                },
            },
            yaxis: {
                labels: {
                    style: { fontSize: '11px', fontFamily: 'inherit' },
                },
            },
            tooltip: {
                theme: 'dark',
                y: {
                    formatter: (_value, opts) => {
                        const idx = opts?.dataPointIndex ?? -1;
                        if (idx < 0) return '';
                        const realQty = chartData.realQtys[idx] ?? 0;
                        const unit = chartData.units[idx] ?? '';
                        const code = chartData.codes[idx] ?? '';
                        return `${realQty.toLocaleString('id-ID')} ${unit} [${code}]`;
                    },
                },
            },
        }),
        [chartData]
    );

    const series = useMemo(
        () => [{ name: 'Total Out', data: chartData.seriesData }],
        [chartData.seriesData]
    );

    return (
        <Card
            className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 pb-1 motion-reduce:transition-none h-full w-full relative overflow-hidden flex flex-col justify-between"
            role="img"
            aria-label="Grafik bar Total Out Material 30 hari terakhir"
        >
            <div
                className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            {/* Header */}
            <div className="relative z-10 mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Top Out Material
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        30 Hari Terakhir
                    </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Category tabs */}
                    <div className="inline-flex rounded-md border border-border/70 p-0.5 bg-background/80 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCategoryFilter('all')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                categoryFilter === 'all'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Semua
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategoryFilter('cable')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                categoryFilter === 'cable'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Kabel
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategoryFilter('accessories')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                categoryFilter === 'accessories'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Pasif
                        </button>
                    </div>

                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger
                                aria-label="Filter gudang top out material"
                                className="w-28.75 sm:w-31.25 h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors"
                            >
                                <SelectValue placeholder="Pilih Gudang" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Gudang</SelectItem>
                                {warehouses.map((warehouse) => (
                                    <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                                        {warehouse.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="relative z-10 -mx-2 flex-1" aria-busy={isLoading}>
                {isLoading ? (
                    <Skeleton className="h-75 w-full" aria-label="Memuat grafik top out material" />
                ) : hasError ? (
                    <p
                        className="flex h-75 items-center justify-center text-sm text-destructive"
                        role="alert"
                    >
                        Grafik gagal dimuat.
                    </p>
                ) : chartData.categories.length === 0 ? (
                    <p
                        className="flex h-75 items-center justify-center text-sm text-muted-foreground"
                        role="status"
                    >
                        Belum ada data transaksi material.
                    </p>
                ) : (
                    <div role="img" aria-label="Grafik Top Out Material 30 hari terakhir">
                        <Chart
                            options={ChartOptions}
                            series={series}
                            type="bar"
                            height={300}
                            width="100%"
                        />
                    </div>
                )}
            </div>
        </Card>
    );
};

export { RecentTransaction };
