'use client';

import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useEffect, useState } from 'react';
import CardBox from '../shared/CardBox';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const RecentTransaction: React.FC = () => {
    const [chartData, setChartData] = useState<{ categories: string[]; seriesData: number[] }>({
        categories: [],
        seriesData: [],
    });

    useEffect(() => {
        const loadData = async () => {
            const { getTopOutMaterials } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getTopOutMaterials(7);

            if (result.success && result.data) {
                const categories = result.data.map((d: any) => d.material_name);
                const seriesData = result.data.map((d: any) => Number(d.total_qty));
                setChartData({ categories, seriesData });
            }
        };

        loadData();
    }, []);
    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: 'bar',
            fontFamily: 'inherit',
            foreColor: '#7C8FAC',
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
        <CardBox className="h-full w-full">
            <div className="flex flex-col mb-6">
                <h5 className="card-title">Top Out Material</h5>
                <p className="text-sm text-muted-foreground font-normal">30 Hari Terakhir</p>
            </div>
            <div className="mt-2">
                <Chart
                    options={ChartOptions}
                    series={series}
                    type="bar"
                    height={316}
                    width="100%"
                />
            </div>
        </CardBox>
    );
};

// Also default export not needed if named exported but original exported `export const RecentTransaction = () => {`
// Let's keep it named export so it works with page.tsx
export { RecentTransaction };
