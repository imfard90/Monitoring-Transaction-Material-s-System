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
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
};

type WarehouseOption = { id: number; name: string };

const SalesOverview: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('15days');

    const { daysCount, endDate, endDateKey } = useMemo(() => {
        let count = 15;
        let end = new Date();

        if (selectedMonth !== '15days') {
            const [m, y] = selectedMonth.split('-');
            const month = parseInt(m, 10);
            const year = parseInt(y, 10);
            count = getDaysInMonth(year, month);
            end = new Date(year, month + 1, 0); // last day of that month
        }

        return {
            daysCount: count,
            endDate: end,
            endDateKey: end.toISOString().slice(0, 10),
        };
    }, [selectedMonth]);

    const { data: chartData = { dates: [], outMaterial: [], hasilRekon: [] } } = useQuery({
        queryKey: queryKeys.dashboard.salesOverview(selectedWh, daysCount, endDateKey),
        queryFn: async () => {
            const { getSalesOverviewData } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getSalesOverviewData(selectedWh, daysCount, endDate);
            if (result.success && result.data) {
                return result.data;
            }
            return { dates: [], outMaterial: [], hasilRekon: [] };
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
            stacked: true,
            width: '100%',
            offsetX: -20,
        },
        colors: ['#0085db', '#13deb9'],
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '36%',
                borderRadius: 5,
                borderRadiusApplication: 'end',
            },
        },
        dataLabels: { enabled: false },
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            fontSize: '12px',
            fontWeight: 500,
            labels: { colors: 'var(--muted-foreground, #7C8FAC)' },
            markers: { size: 6, shape: 'circle' },
        },
        grid: { borderColor: 'var(--color-border, rgba(0,0,0,0.08))', strokeDashArray: 3 },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
            labels: {
                style: { fontSize: '11px' },
            },
        },
        yaxis: {
            tickAmount: 5,
            labels: {
                style: { fontSize: '11px' },
                formatter: (val) => `${Math.abs(val ?? 0)}`,
            },
        },
        tooltip: {
            theme: 'dark',
            y: { formatter: (val) => `${Math.abs(val ?? 0)} transaksi` },
        },
    };

    const series = [
        { name: 'Out Material', data: chartData.outMaterial },
        { name: 'Hasil Rekon', data: chartData.hasilRekon },
    ];

    // Generate options for month filter (last 6 months)
    const monthOptions = useMemo(() => {
        const options = [];
        const d = new Date();
        for (let i = 0; i < 6; i++) {
            const m = d.getMonth();
            const y = d.getFullYear();
            options.push({
                value: `${m}-${y}`,
                label: `${d.toLocaleString('default', { month: 'long' })} ${y}`,
            });
            d.setMonth(m - 1);
        }
        return options;
    }, []);

    return (
        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none pb-0 h-full w-full relative overflow-hidden">
            <div
                className="absolute top-0 left-0 w-full h-28 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 sm:flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Out Material vs Hasil Rekon
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Perbandingan transaksi per hari
                    </p>
                </div>
                <div className="sm:mt-0 mt-3 flex items-center gap-2">
                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[130px] sm:w-[145px] h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
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

                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-[145px] sm:w-40 h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
                            <SelectValue placeholder="Pilih Periode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="15days">15 Hari Terakhir</SelectItem>
                            {monthOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
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

export default SalesOverview;
