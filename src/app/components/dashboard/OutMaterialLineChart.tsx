'use client';

import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
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

const OutMaterialLineChart: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('all');

    const [chartData, setChartData] = useState<{
        dates: string[];
        series: { name: string; originalName: string; data: number[] }[];
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
            const result = await getOutMaterialLineChartData(isStaff ? 'all' : selectedWh);

            const resData = result.data as {
                topMats: { material_code: string; material_name: string; total_qty: number }[];
                dailyData: {
                    material_code: string;
                    material_name: string;
                    date_val: string;
                    total_qty: number;
                }[];
                startDate: Date;
            };

            if (result.success && resData?.topMats) {
                const dates = [];
                const d = new Date(resData.startDate);
                for (let i = 0; i < 30; i++) {
                    dates.push(`${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`);
                    d.setDate(d.getDate() + 1);
                }

                const allMatNames = resData.topMats.map(
                    (t: { material_code: string; material_name: string; total_qty: number }) =>
                        t.material_name
                );
                const allMatCodes = resData.topMats.map(
                    (t: { material_code: string; material_name: string; total_qty: number }) =>
                        t.material_code
                );

                const dailyQtyByMaterialAndDate = new Map<string, number>();
                for (const record of resData.dailyData) {
                    dailyQtyByMaterialAndDate.set(
                        `${record.material_code}|${record.date_val}`,
                        Number(record.total_qty)
                    );
                }

                const series = allMatNames.map((mat: string, idx: number) => {
                    const matCode = allMatCodes[idx];
                    const data = [];
                    const startDateObj = new Date(resData.startDate);
                    for (let i = 0; i < 30; i++) {
                        const yyyy = startDateObj.getFullYear();
                        const mm = String(startDateObj.getMonth() + 1).padStart(2, '0');
                        const dd = String(startDateObj.getDate()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd}`;

                        let val = dailyQtyByMaterialAndDate.get(`${matCode}|${dateStr}`) ?? 0;

                        // Scale down AC-OF-SM-1-3SL by 10 for better comparison
                        if (matCode === 'AC-OF-SM-1-3SL') {
                            val = val / 10;
                        }

                        data.push(val);
                        startDateObj.setDate(startDateObj.getDate() + 1);
                    }
                    const displayName = matCode === 'AC-OF-SM-1-3SL' ? `${mat} (x10)` : mat;
                    return { name: displayName, originalName: mat, data };
                });

                setChartData({ dates, series, allMatNames });
            } else {
                setChartData({ dates: [], series: [], allMatNames: [] });
            }
        };

        loadData();
    }, [selectedWh, isStaff]);

    // Filter series based on selected material
    const filteredSeries = useMemo(() => {
        if (selectedMaterial === 'all') {
            // Default: show only Top 10 materials
            return chartData.series.slice(0, 10);
        }
        return chartData.series.filter((s) => s.originalName === selectedMaterial);
    }, [selectedMaterial, chartData]);

    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: 'line',
            fontFamily: 'inherit',
            foreColor: 'var(--color-muted-foreground, #7C8FAC)',
            height: 316,
            width: '100%',
            offsetX: -20,
        },
        colors: [
            '#0085db',
            '#13deb9',
            '#745ff2',
            '#f59e0b',
            '#ef4444',
            '#06b6d4',
            '#84cc16',
            '#ec4899',
            '#8b5cf6',
            '#64748b',
        ],
        stroke: {
            curve: 'smooth',
            width: 2.5,
        },
        markers: {
            size: 0,
            hover: { size: 4 },
        },
        dataLabels: { enabled: false },
        legend: {
            show: false,
        },
        grid: { borderColor: 'var(--color-border, rgba(0,0,0,0.08))', strokeDashArray: 3 },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
            tickAmount: 10,
            labels: {
                style: { fontSize: '11px' },
            },
        },
        yaxis: {
            tickAmount: 5,
            labels: {
                style: { fontSize: '11px' },
                formatter: (val) => `${Math.round(val)}`,
            },
        },
        tooltip: {
            theme: 'dark',
            shared: true,
            intersect: false,
        },
    };

    return (
        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none pb-0 h-full w-full relative overflow-hidden">
            <div
                className="absolute top-0 left-0 w-full h-28 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 sm:flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Out Material per Hari (30 Hari Terakhir)
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Tren penggunaan material harian
                    </p>
                </div>
                <div className="sm:mt-0 mt-3 flex items-center gap-2">
                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[130px] sm:w-[140px] h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
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

                    <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                        <SelectTrigger className="w-[160px] sm:w-[175px] h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
                            <SelectValue placeholder="Pilih Material" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">10 Material Teratas</SelectItem>
                            {chartData.allMatNames.map((mat) => (
                                <SelectItem key={mat} value={mat}>
                                    {mat}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="relative z-10 -mx-2">
                <Chart
                    options={ChartOptions}
                    series={filteredSeries}
                    type="line"
                    height={316}
                    width="100%"
                />
            </div>
        </Card>
    );
};

export default OutMaterialLineChart;
