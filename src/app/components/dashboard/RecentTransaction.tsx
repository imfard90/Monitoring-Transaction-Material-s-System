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

const RecentTransaction: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState('all');

    const targetWh = isStaff ? 'all' : selectedWh;

    const {
        data: chartData = { categories: [], seriesData: [] },
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
                return { categories: [], seriesData: [] };
            }

            const categories = result.data.map(
                (d: {
                    material_code: string | null;
                    material_name: string | null;
                    total_qty: number;
                }) => {
                    const name = d.material_name || '';
                    return d.material_code === 'AC-OF-SM-1-3SL' ? `${name} (x10)` : name;
                }
            );
            const seriesData = result.data.map(
                (d: {
                    material_code: string | null;
                    material_name: string | null;
                    total_qty: number;
                }) => {
                    const qty = Number(d.total_qty);
                    // Scale down AC-OF-SM-1-3SL by 10 for better visual comparison
                    return d.material_code === 'AC-OF-SM-1-3SL' ? qty / 10 : qty;
                }
            );
            return { categories, seriesData };
        },
        staleTime: 60 * 1000,
    });
    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: 'bar',
            fontFamily: 'inherit',
            foreColor: 'var(--color-muted-foreground, #7C8FAC)',
            height: 310,
        },
        colors: ['var(--color-primary)'],
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 4,
                barHeight: '50%',
            },
        },
        dataLabels: {
            enabled: true,
            style: {
                colors: ['#fff'],
            },
        },
        legend: { show: false },
        grid: { borderColor: 'rgba(0,0,0,0.1)', strokeDashArray: 3 },
        xaxis: {
            categories: chartData.categories,
            axisBorder: { show: false },
            axisTicks: { show: false },
            title: { text: 'Jumlah (AC-OF-SM-1-3SL ditampilkan skala visual 1:10)' },
        },
        tooltip: {
            theme: 'dark',
            y: {
                formatter: (value, opts) => {
                    const scaled =
                        chartData.categories[opts?.dataPointIndex ?? -1]?.endsWith(' (x10)');
                    const numVal = value ?? 0;
                    return `${(scaled ? numVal * 10 : numVal).toLocaleString()} unit${scaled ? ' (nilai asli)' : ''}`;
                },
            },
        },
    };

    const series = useMemo(
        () => [{ name: 'Total Out', data: chartData.seriesData }],
        [chartData.seriesData]
    );

    return (
        <Card
            className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none h-full w-full relative overflow-hidden"
            role="img"
            aria-label="Grafik bar Total Out Material 30 hari terakhir"
        >
            <div
                className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Top Out Material
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        30 Hari Terakhir
                    </p>
                </div>
                {!isStaff && (
                    <Select value={selectedWh} onValueChange={setSelectedWh}>
                        <SelectTrigger
                            aria-label="Filter gudang top out material"
                            className="w-[130px] sm:w-[150px] h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors"
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
            <div className="relative z-10 -mx-2" aria-busy={isLoading}>
                {isLoading ? (
                    <Skeleton
                        className="h-[316px] w-full"
                        aria-label="Memuat grafik top out material"
                    />
                ) : hasError ? (
                    <p
                        className="flex h-[316px] items-center justify-center text-sm text-destructive"
                        role="alert"
                    >
                        Grafik gagal dimuat.
                    </p>
                ) : chartData.categories.length === 0 ? (
                    <p
                        className="flex h-[316px] items-center justify-center text-sm text-muted-foreground"
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
                            height={316}
                            width="100%"
                        />
                    </div>
                )}
            </div>
        </Card>
    );
};

// Also default export not needed if named exported but original exported `export const RecentTransaction = () => {`
// Let's keep it named export so it works with page.tsx
export { RecentTransaction };
