'use client';

import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type WarehouseOption = { id: number; name: string };

const RecentTransaction: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState('all');
    const [chartData, setChartData] = useState<{ categories: string[]; seriesData: number[] }>({
        categories: [],
        seriesData: [],
    });

    useEffect(() => {
        let isActive = true;
        const loadData = async () => {
            const { getTopOutMaterials } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getTopOutMaterials(7, isStaff ? 'all' : selectedWh);

            if (isActive && result.success && result.data) {
                const categories = result.data.map(
                    (d: { material_name: string | null; total_qty: number }) =>
                        d.material_name || ''
                );
                const seriesData = result.data.map(
                    (d: { material_name: string | null; total_qty: number }) => Number(d.total_qty)
                );
                setChartData({ categories, seriesData });
            }
        };

        void loadData();
        return () => {
            isActive = false;
        };
    }, [selectedWh, isStaff]);
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
        },
        tooltip: {
            theme: 'dark',
        },
    };

    const series = [
        {
            name: 'Total Out',
            data: chartData.seriesData,
        },
    ];

    return (
        <Card
            className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none h-full w-full relative overflow-hidden motion-reduce:transition-none"
            role="img"
            aria-label="Grafik bar Total Out Material 30 hari terakhir"
        >
            <div
                className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                        Top Out Material
                    </h2>
                    <p className="text-sm text-muted-foreground font-medium mt-1">
                        30 Hari Terakhir
                    </p>
                </div>
                {!isStaff && (
                    <Select value={selectedWh} onValueChange={setSelectedWh}>
                        <SelectTrigger
                            aria-label="Filter gudang top out material"
                            className="w-full sm:w-52"
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
            <div className="relative z-10 -mx-2">
                <Chart
                    options={ChartOptions}
                    series={series}
                    type="bar"
                    height={316}
                    width="100%"
                />
            </div>
        </Card>
    );
};

// Also default export not needed if named exported but original exported `export const RecentTransaction = () => {`
// Let's keep it named export so it works with page.tsx
export { RecentTransaction };
