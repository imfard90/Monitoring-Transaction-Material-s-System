'use client';

import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import CardBox from '../shared/CardBox';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
};

const SalesOverview: React.FC = () => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('15days');
    const [chartData, setChartData] = useState<{
        dates: string[];
        outMaterial: number[];
        hasilRekon: number[];
    }>({
        dates: [],
        outMaterial: [],
        hasilRekon: [],
    });

    useEffect(() => {
        const loadData = async () => {
            let daysCount = 15;
            let endDate = new Date();

            if (selectedMonth !== '15days') {
                const [m, y] = selectedMonth.split('-');
                const month = parseInt(m, 10);
                const year = parseInt(y, 10);
                daysCount = getDaysInMonth(year, month);
                endDate = new Date(year, month + 1, 0); // last day of that month
            }

            const { getSalesOverviewData } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getSalesOverviewData(selectedWh, daysCount, endDate);

            if (result.success && result.data) {
                setChartData(result.data);
            }
        };

        loadData();
    }, [selectedWh, selectedMonth]);

    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: 'bar',
            fontFamily: 'inherit',
            foreColor: '#7C8FAC',
            height: 310,
            stacked: true, // stacked instead of side-by-side
            width: '100%',
            offsetX: -20,
        },
        colors: ['var(--color-primary)', 'var(--color-secondary)'],
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '40%',
                borderRadius: 4,
            },
        },
        dataLabels: { enabled: false },
        legend: { show: true, position: 'top', horizontalAlign: 'right' },
        grid: { borderColor: 'rgba(0,0,0,0.1)', strokeDashArray: 3 },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            tickAmount: 5,
            labels: { formatter: (val) => `${Math.abs(val)}` },
        },
        tooltip: {
            theme: 'dark',
            y: { formatter: (val) => `${Math.abs(val)}` },
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

    const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        const loadWarehouses = async () => {
            const { getWarehouses } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getWarehouses();
            if (result.success && result.data) {
                setWarehouses(result.data.map((w: any) => ({ id: w.id, name: w.name })));
            }
        };
        loadWarehouses();
    }, []);

    return (
        <CardBox className="pb-0 h-full w-full">
            <div className="sm:flex items-center justify-between mb-2">
                <div>
                    <h5 className="card-title">Out Material vs Hasil Rekon</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Perbandingan per hari
                    </p>
                </div>
                <div className="sm:mt-0 mt-4 flex gap-3">
                    <Select value={selectedWh} onValueChange={setSelectedWh}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Select WH" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All WH</SelectItem>
                            {warehouses.map((wh) => (
                                <SelectItem key={wh.id} value={String(wh.id)}>
                                    {wh.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Select Period" />
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

            <Chart options={ChartOptions} series={series} type="bar" height={316} width="100%" />
        </CardBox>
    );
};

export default SalesOverview;
