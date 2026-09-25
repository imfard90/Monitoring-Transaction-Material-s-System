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

const OutMaterialLineChart: React.FC = () => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('all');

    const [chartData, setChartData] = useState<{
        dates: string[];
        series: any[];
        allMatNames: string[];
    }>({
        dates: [],
        series: [],
        allMatNames: [],
    });

    useEffect(() => {
        const loadData = async () => {
            const { getOutMaterialLineChartData } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getOutMaterialLineChartData(selectedWh);

            const resData = result.data as any;

            if (result.success && resData?.topMats) {
                const dates = [];
                const d = new Date(resData.startDate);
                for (let i = 0; i < 30; i++) {
                    dates.push(`${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`);
                    d.setDate(d.getDate() + 1);
                }

                const allMatNames = resData.topMats.map((t: any) => t.material_name);

                const series = allMatNames.map((mat: string) => {
                    const data = [];
                    const startDateObj = new Date(resData.startDate);
                    for (let i = 0; i < 30; i++) {
                        const yyyy = startDateObj.getFullYear();
                        const mm = String(startDateObj.getMonth() + 1).padStart(2, '0');
                        const dd = String(startDateObj.getDate()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd}`;

                        const dailyRec = resData.dailyData.find(
                            (dd: any) => dd.material_name === mat && dd.date_val === dateStr
                        );
                        data.push(dailyRec ? Number(dailyRec.total_qty) : 0);
                        startDateObj.setDate(startDateObj.getDate() + 1);
                    }
                    return { name: mat, data };
                });

                setChartData({ dates, series, allMatNames });
            } else {
                setChartData({ dates: [], series: [], allMatNames: [] });
            }
        };

        loadData();
    }, [selectedWh]);

    // Filter series based on selected material
    const filteredSeries = useMemo(() => {
        if (selectedMaterial === 'all') {
            // Default: show only Top 10 materials
            return chartData.series.slice(0, 10);
        }
        return chartData.series.filter((s) => s.name === selectedMaterial);
    }, [selectedMaterial, chartData]);

    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: 'line',
            fontFamily: 'inherit',
            foreColor: '#7C8FAC',
            height: 310,
            width: '100%',
            offsetX: -20,
        },
        colors: [
            '#008FFB',
            '#00E396',
            '#FEB019',
            '#FF4560',
            '#775DD0',
            '#3F51B5',
            '#546E7A',
            '#D4526E',
            '#8D5B4C',
            '#F86624',
        ],
        stroke: {
            curve: 'smooth',
            width: 2,
        },
        dataLabels: { enabled: false },
        legend: {
            show: false,
        },
        grid: { borderColor: 'rgba(0,0,0,0.1)', strokeDashArray: 3 },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
            tickAmount: 10,
        },
        yaxis: {
            tickAmount: 5,
        },
        tooltip: {
            theme: 'dark',
            shared: true,
            intersect: false,
        },
    };

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
                    <h5 className="card-title">Out Material by Day (Last 30 Days)</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Trend of materials usage
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

                    <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select Material" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Top 10 Materials</SelectItem>
                            {chartData.allMatNames.map((mat) => (
                                <SelectItem key={mat} value={mat}>
                                    {mat}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Chart
                options={ChartOptions}
                series={filteredSeries}
                type="line"
                height={350}
                width="100%"
            />
        </CardBox>
    );
};

export default OutMaterialLineChart;
