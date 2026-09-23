'use client';

import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import CardBox from '../shared/CardBox';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Strongly typed chart data
interface MonthlyChartData {
    series: ApexOptions['series'];
    xaxis: ApexOptions['xaxis'];
}

const chartDataByMonth: Record<string, MonthlyChartData> = {
    'Year 2025': {
        series: [
            {
                name: 'Earnings',
                data: [1500, 2700, 2200, 3000, 1500, 1000, 1400, 2400, 1900, 2300, 1400, 1100],
            },
            {
                name: 'Expense',
                data: [
                    -1800, -1100, -2500, -1500, -600, -1800, -1200, -2300, -1900, -2300, -1200,
                    -2500,
                ],
            },
        ],
        xaxis: {
            categories: [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
            ],
        },
    },
    'Year 2024': {
        series: [
            {
                name: 'Earnings',
                data: [2000, 2500, 2800, 3000, 2000, 1500, 2300, 1500, 1000, 1400, 2400, 1900],
            },
            {
                name: 'Expense',
                data: [
                    -1200, -1500, -2000, -1000, -800, -1300, -1500, -600, -1800, -1200, -2300,
                    -1900,
                ],
            },
        ],
        xaxis: {
            categories: [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
            ],
        },
    },
    'Year 2023': {
        series: [
            {
                name: 'Earnings',
                data: [1800, 2200, 2600, 3000, 1700, 1200, 2000, 2500, 2800, 1800, 2000, 1500],
            },
            {
                name: 'Expense',
                data: [
                    -1500, -1300, -2200, -1200, -700, -1600, -1200, -1500, -2000, -1000, -800,
                    -1300,
                ],
            },
        ],
        xaxis: {
            categories: [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
            ],
        },
    },
};

const baseChartOptions: ApexOptions = {
    chart: {
        toolbar: { show: false },
        type: 'bar',
        fontFamily: 'inherit',
        foreColor: '#7C8FAC',
        height: 310,
        stacked: true,
        width: '100%',
        offsetX: -20,
    },
    colors: ['var(--color-primary)', 'var(--color-secondary)'],
    plotOptions: {
        bar: {
            horizontal: false,
            barHeight: '60%',
            columnWidth: '20%',
            borderRadius: 6,
            borderRadiusApplication: 'end',
            borderRadiusWhenStacked: 'all',
        },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: 'rgba(0,0,0,0.1)', strokeDashArray: 3 },
    yaxis: {
        min: -3000,
        max: 3000,
        tickAmount: 6,
        labels: { formatter: (val) => `${val / 1000}k` },
    },
    tooltip: {
        theme: 'dark',
        y: { formatter: (val) => `${val}k` },
    },
};

const SalesOverview: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState<keyof typeof chartDataByMonth>('Year 2025');

    const ChartData: ApexOptions = {
        ...baseChartOptions,
        xaxis: {
            ...chartDataByMonth[selectedMonth].xaxis,
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
    };

    return (
        <CardBox className="pb-0 h-full w-full">
            <div className="sm:flex items-center justify-between mb-6">
                <div>
                    <h5 className="card-title">Revenue updates</h5>
                    <p className="text-sm text-muted-foreground font-normal">Overview of Profit</p>
                </div>
                <div className="sm:mt-0 mt-4">
                    <Select
                        value={selectedMonth}
                        onValueChange={(val) =>
                            setSelectedMonth(val as keyof typeof chartDataByMonth)
                        }
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(chartDataByMonth).map((year) => (
                                <SelectItem key={year} value={year}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Chart
                options={ChartData}
                series={chartDataByMonth[selectedMonth].series}
                type="bar"
                height={316}
                width="100%"
            />
        </CardBox>
    );
};

export default SalesOverview;
