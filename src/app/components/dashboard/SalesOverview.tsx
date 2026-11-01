'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
type ViewMode = 'stacked' | 'grouped' | 'area';

const SalesOverview: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('15days');
    const [viewMode, setViewMode] = useState<ViewMode>('stacked');

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

    // Summary KPIs
    const { totalOut, totalRekon, rekonRatio } = useMemo(() => {
        const out = chartData.outMaterial.reduce((acc, v) => acc + (v || 0), 0);
        const rekon = chartData.hasilRekon.reduce((acc, v) => acc + (v || 0), 0);
        const ratio = out > 0 ? Math.round((rekon / out) * 100) : 0;
        return { totalOut: out, totalRekon: rekon, rekonRatio: ratio };
    }, [chartData.outMaterial, chartData.hasilRekon]);

    const ChartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                toolbar: { show: false },
                type: viewMode === 'area' ? 'area' : 'bar',
                fontFamily: 'inherit',
                foreColor: 'var(--color-muted-foreground, #7C8FAC)',
                height: 300,
                stacked: viewMode === 'stacked',
                width: '100%',
                offsetX: -10,
                animations: { enabled: true, speed: 450 },
            },
            colors: ['#2563EB', '#10B981'],
            stroke: {
                show: true,
                curve: 'smooth',
                width: viewMode === 'area' ? 2.5 : 0,
            },
            fill: {
                type: viewMode === 'area' ? 'gradient' : 'solid',
                gradient: {
                    shade: 'dark',
                    type: 'vertical',
                    shadeIntensity: 0.5,
                    gradientToColors: undefined,
                    inverseColors: true,
                    opacityFrom: 0.35,
                    opacityTo: 0.05,
                    stops: [0, 90, 100],
                },
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: viewMode === 'stacked' ? '34%' : '52%',
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
        }),
        [viewMode, chartData.dates]
    );

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

            {/* Header */}
            <div className="relative z-10 sm:flex items-center justify-between mb-2 gap-3">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Out Material vs Hasil Rekon
                        </h2>
                        <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                                rekonRatio >= 85
                                    ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                                    : rekonRatio >= 60
                                      ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                                      : 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10'
                            }`}
                        >
                            Rasio Rekon: {rekonRatio}%
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Perbandingan volume transaksi harian
                    </p>
                </div>

                {/* Controls (Mode Switcher + Filters) */}
                <div className="sm:mt-0 mt-2 flex items-center gap-2 flex-wrap">
                    {/* View mode toggle */}
                    <div className="inline-flex rounded-md border border-border/70 p-0.5 bg-background/80 shrink-0">
                        <button
                            type="button"
                            onClick={() => setViewMode('stacked')}
                            title="Tampilan Batang Bertumpuk"
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                viewMode === 'stacked'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Tumpuk
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('grouped')}
                            title="Tampilan Batang Berdampingan"
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                viewMode === 'grouped'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Dua Sisi
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('area')}
                            title="Tampilan Kurva Area"
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                viewMode === 'area'
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Area
                        </button>
                    </div>

                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[120px] sm:w-[130px] h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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
                        <SelectTrigger className="w-[130px] sm:w-36 h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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

            {/* Quick KPI Strip */}
            <div className="relative z-10 grid grid-cols-3 gap-2 py-1.5 px-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs mb-1">
                <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#2563EB] shrink-0" />
                    <span className="text-[11px] text-muted-foreground">Total Out:</span>
                    <span className="font-mono font-bold text-foreground tabular-nums">
                        {totalOut.toLocaleString('id-ID')}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#10B981] shrink-0" />
                    <span className="text-[11px] text-muted-foreground">Total Rekon:</span>
                    <span className="font-mono font-bold text-foreground tabular-nums">
                        {totalRekon.toLocaleString('id-ID')}
                    </span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Gap Terbuka:</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {Math.max(0, totalOut - totalRekon).toLocaleString('id-ID')}
                    </span>
                </div>
            </div>

            {/* Chart */}
            <div className="relative z-10 -mx-2 flex-1">
                <Chart
                    options={ChartOptions}
                    series={series}
                    type={viewMode === 'area' ? 'area' : 'bar'}
                    height={280}
                    width="100%"
                />
            </div>
        </Card>
    );
};

export default SalesOverview;
