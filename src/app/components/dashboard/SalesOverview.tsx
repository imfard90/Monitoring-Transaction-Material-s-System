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
            end = new Date(year, month + 1, 0);
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
            height: 300,
            stacked: true,
            width: '100%',
            offsetX: -12,
        },
        colors: ['#2563EB', '#10B981'],
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '34%',
                borderRadius: 4,
                borderRadiusApplication: 'end',
            },
        },
        dataLabels: { enabled: false },
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            fontSize: '11px',
            fontWeight: 500,
            labels: { colors: 'var(--muted-foreground, #7C8FAC)' },
            markers: { size: 5, shape: 'circle' },
            itemMargin: { horizontal: 8, vertical: 0 },
        },
        grid: {
            borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
            strokeDashArray: 3,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
        },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
            labels: {
                style: { fontSize: '11px', fontFamily: 'inherit' },
            },
        },
        yaxis: {
            tickAmount: 5,
            labels: {
                style: { fontSize: '11px', fontFamily: 'monospace' },
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
                label: `${d.toLocaleString('id-ID', { month: 'long' })} ${y}`,
            });
            d.setMonth(m - 1);
        }
        return options;
    }, []);

    return (
        <Card className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 pb-1 h-full w-full relative overflow-hidden flex flex-col justify-between">
            <div
                className="absolute top-0 left-0 w-full h-20 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 sm:flex items-center justify-between mb-3 gap-3">
                <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Out Material vs Hasil Rekon
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Perbandingan volume transaksi harian
                    </p>
                </div>
                <div className="sm:mt-0 mt-2 flex items-center gap-2 flex-wrap">
                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[125px] sm:w-[135px] h-7.5 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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
                        <SelectTrigger className="w-[135px] sm:w-38 h-7.5 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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

            <div className="relative z-10 -mx-2 flex-1">
                <Chart
                    options={ChartOptions}
                    series={series}
                    type="bar"
                    height={300}
                    width="100%"
                />
            </div>
        </Card>
    );
};

export default SalesOverview;
