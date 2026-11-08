'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type WarehouseOption = { id: number; name: string };
type TimeframeOption = 7 | 14 | 30;

type MaterialOption = {
    code: string;
    name: string;
    label: string;
    unit: string;
    total30d: number;
};

type SeriesItem = {
    name: string;
    code: string;
    originalName: string;
    unit: string;
    realData: number[];
    data: number[];
};

type ChartDataResult = {
    dates: string[];
    series: SeriesItem[];
    materials: MaterialOption[];
};

function formatUnit(unit?: string | null): string {
    switch (unit?.toUpperCase()) {
        case 'M':
            return 'Meter';
        case 'PC':
            return 'Pcs';
        case 'BTG':
            return 'Batang';
        case 'SET':
            return 'Set';
        default:
            return unit || 'Unit';
    }
}

const OutMaterialLineChart: React.FC<{ isStaff: boolean; warehouses: WarehouseOption[] }> = ({
    isStaff,
    warehouses,
}) => {
    const cardRef = useScrollReveal();
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('all');
    const [timeframe, setTimeframe] = useState<TimeframeOption>(30);

    const targetWh = isStaff ? 'all' : selectedWh;

    const { data: chartData = { dates: [], series: [], materials: [] } } =
        useQuery<ChartDataResult>({
            queryKey: queryKeys.dashboard.outMaterialLine(targetWh, 30),
            queryFn: async () => {
                const { getOutMaterialLineChartData } = await import(
                    '@/app/(DashboardLayout)/_actions/dashboard-actions'
                );
                const result = await getOutMaterialLineChartData(targetWh);

                const resData = result.data as {
                    topMats: {
                        material_code: string;
                        material_name: string;
                        material_unit?: string | null;
                        total_qty: number;
                    }[];
                    dailyData: {
                        material_code: string;
                        material_name: string;
                        material_unit?: string | null;
                        date_val: string;
                        total_qty: number;
                    }[];
                    startDate: Date | string;
                };

                if (result.success && resData?.topMats) {
                    const dates: string[] = [];
                    const startDate = new Date(resData.startDate);
                    for (let i = 0; i < 30; i++) {
                        const d = new Date(startDate);
                        d.setDate(startDate.getDate() + i);
                        dates.push(
                            `${d.getDate()} ${d.toLocaleString('id-ID', { month: 'short' })}`
                        );
                    }

                    const dailyQtyByMaterialAndDate = new Map<string, number>();
                    for (const row of resData.dailyData) {
                        dailyQtyByMaterialAndDate.set(
                            `${row.material_code}|${row.date_val}`,
                            Number(row.total_qty)
                        );
                    }

                    // Detect duplicate descriptions to disambiguate labels
                    const descCount = new Map<string, number>();
                    resData.topMats.forEach((m) => {
                        const desc = m.material_name || m.material_code;
                        descCount.set(desc, (descCount.get(desc) || 0) + 1);
                    });

                    const materials: MaterialOption[] = resData.topMats.map((t) => {
                        const isDuplicate = (descCount.get(t.material_name) || 0) > 1;
                        return {
                            code: t.material_code,
                            name: t.material_name,
                            label: isDuplicate
                                ? `${t.material_name} (${t.material_code})`
                                : t.material_name,
                            unit: formatUnit(t.material_unit),
                            total30d: Number(t.total_qty ?? 0),
                        };
                    });

                    const series: SeriesItem[] = materials.map((mat) => {
                        const matCode = mat.code;
                        const realData: number[] = [];
                        const data: number[] = [];
                        const startDateObj = new Date(resData.startDate);
                        for (let i = 0; i < 30; i++) {
                            const yyyy = startDateObj.getFullYear();
                            const mm = String(startDateObj.getMonth() + 1).padStart(2, '0');
                            const dd = String(startDateObj.getDate()).padStart(2, '0');
                            const dateStr = `${yyyy}-${mm}-${dd}`;

                            const realVal =
                                dailyQtyByMaterialAndDate.get(`${matCode}|${dateStr}`) ?? 0;
                            realData.push(realVal);

                            // Skalakan AC-OF-SM-1-3SL visual 1:10 agar tidak mendominasi garis komparasi lain
                            const visualVal = matCode === 'AC-OF-SM-1-3SL' ? realVal / 10 : realVal;
                            data.push(visualVal);

                            startDateObj.setDate(startDateObj.getDate() + 1);
                        }
                        const displayName =
                            matCode === 'AC-OF-SM-1-3SL' ? `${mat.label} (x10)` : mat.label;
                        return {
                            name: displayName,
                            code: matCode,
                            originalName: mat.name,
                            unit: mat.unit,
                            realData,
                            data,
                        };
                    });

                    return { dates, series, materials };
                }
                return { dates: [], series: [], materials: [] };
            },
            staleTime: 60 * 1000,
        });

    // Timeframe slice (last 7, 14, or 30 days)
    const { slicedDates, slicedSeries } = useMemo(() => {
        const total = chartData.dates.length;
        const offset = Math.max(0, total - timeframe);
        const dates = chartData.dates.slice(offset);

        const series = chartData.series.map((s) => ({
            ...s,
            realData: s.realData.slice(offset),
            data: s.data.slice(offset),
        }));

        return { slicedDates: dates, slicedSeries: series };
    }, [chartData, timeframe]);

    // Filter series based on selected material code
    const filteredSeries = useMemo(() => {
        if (selectedMaterial === 'all') {
            return slicedSeries.slice(0, 10);
        }
        return slicedSeries.filter((s) => s.code === selectedMaterial);
    }, [selectedMaterial, slicedSeries]);

    // Ringkasan KPI material aktif
    const activeMaterialStats = useMemo(() => {
        if (selectedMaterial !== 'all') {
            const current = chartData.materials.find((m) => m.code === selectedMaterial);
            if (!current) return null;
            const s = slicedSeries.find((item) => item.code === selectedMaterial);
            let peakVal = 0;
            let peakDate = '-';
            let periodTotal = 0;
            if (s) {
                s.realData.forEach((val, idx) => {
                    periodTotal += val;
                    if (val > peakVal) {
                        peakVal = val;
                        peakDate = slicedDates[idx] || '-';
                    }
                });
            }
            const avgDaily = Math.round((periodTotal / timeframe) * 10) / 10;
            return {
                mode: 'single' as const,
                title: current.name,
                code: current.code,
                unit: current.unit,
                periodTotal,
                peakVal,
                peakDate,
                avgDaily,
            };
        }

        const top1 = chartData.materials[0];
        return {
            mode: 'all' as const,
            count: Math.min(chartData.series.length, 10),
            top1Name: top1 ? top1.label : '-',
            top1Qty: top1 ? top1.total30d : 0,
            top1Unit: top1 ? top1.unit : 'Unit',
        };
    }, [selectedMaterial, chartData, slicedSeries, slicedDates, timeframe]);

    const isSingle = selectedMaterial !== 'all';

    const ChartOptions: ApexOptions = {
        chart: {
            toolbar: { show: false },
            type: isSingle ? 'area' : 'line',
            fontFamily: 'inherit',
            foreColor: 'var(--color-muted-foreground, #7C8FAC)',
            height: 295,
            width: '100%',
            offsetX: -12,
            animations: { enabled: true, speed: 450 },
        },
        colors: [
            '#0085db',
            '#13deb9',
            '#745ff2',
            '#f59e0b',
            '#e11d48',
            '#06b6d4',
            '#10b981',
            '#8b5cf6',
            '#ec4899',
            '#64748b',
        ],
        dataLabels: { enabled: false },
        stroke: {
            curve: 'smooth',
            width: isSingle ? 3 : 2,
        },
        fill: {
            type: isSingle ? 'gradient' : 'solid',
            gradient: {
                shade: 'dark',
                type: 'vertical',
                shadeIntensity: 0.5,
                opacityFrom: 0.28,
                opacityTo: 0.02,
                stops: [0, 95, 100],
            },
        },
        legend: {
            show: selectedMaterial === 'all',
            position: 'top',
            horizontalAlign: 'right',
            fontSize: '11px',
            fontWeight: 500,
            labels: { colors: 'var(--muted-foreground, #7C8FAC)' },
            markers: { size: 5, shape: 'circle' },
            itemMargin: { horizontal: 6, vertical: 0 },
        },
        grid: {
            borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
            strokeDashArray: 3,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
        },
        markers: {
            size: isSingle ? 4 : 3,
            strokeWidth: 2,
            hover: {
                size: 7,
                sizeOffset: 3,
            },
        },
        xaxis: {
            categories: slicedDates,
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
            shared: false,
            intersect: true,
            theme: 'dark',
            custom: ({ seriesIndex, dataPointIndex, w }) => {
                const s = filteredSeries[seriesIndex];
                if (!s) return '';
                const date = slicedDates[dataPointIndex] || '';
                const realVal = s.realData[dataPointIndex] ?? 0;
                const chartVal = s.data[dataPointIndex] ?? 0;
                const unit = s.unit;
                const isScaled = s.code === 'AC-OF-SM-1-3SL';
                const color = w.globals.colors[seriesIndex] || '#0085db';

                return `
                    <div style="background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); border-radius: 10px; padding: 10px 14px; min-width: 210px; font-family: inherit;">
                        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 6px;">
                            <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">${date}</span>
                            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; box-shadow: 0 0 8px ${color};"></span>
                        </div>
                        <div style="padding: 8px 0 6px 0;">
                            <div style="font-weight: 600; font-size: 12px; line-height: 1.35; color: #ffffff;">${s.originalName}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-family: monospace; margin-top: 2px;">${s.code}</div>
                        </div>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08);">
                            <span style="font-size: 11px; color: #94a3b8;">Pengeluaran:</span>
                            <div style="text-align: right;">
                                <span style="font-size: 15px; font-weight: 700; color: ${color}; font-family: monospace;">${realVal.toLocaleString('id-ID')}</span>
                                <span style="font-size: 11px; color: #cbd5e1; margin-left: 3px;">${unit}</span>
                            </div>
                        </div>
                        ${
                            isScaled
                                ? `<div style="font-size: 9.5px; color: #f59e0b; padding-top: 4px; text-align: right; font-style: italic;">(Skala grafik: ${Math.round(chartVal).toLocaleString('id-ID')} [÷10])</div>`
                                : ''
                        }
                    </div>
                `;
            },
        },
    };

    return (
        <Card
            ref={cardRef}
            className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 motion-reduce:transition-none pb-1 h-full w-full relative overflow-hidden flex flex-col justify-between"
        >
            <div
                className="absolute top-0 left-0 w-full h-20 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 sm:flex items-center justify-between mb-2 gap-3">
                <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Out Material per Hari ({timeframe} Hari Terakhir)
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Tren konsumsi material harian
                    </p>
                </div>

                <div className="sm:mt-0 mt-2 flex items-center gap-1.5 flex-wrap">
                    {/* Timeframe quick toggle */}
                    <div className="inline-flex rounded-md border border-border/70 p-0.5 bg-background/80 shrink-0">
                        <button
                            type="button"
                            onClick={() => setTimeframe(7)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                timeframe === 7
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            7 Hari
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimeframe(14)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                timeframe === 14
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            14 Hari
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimeframe(30)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                timeframe === 30
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            30 Hari
                        </button>
                    </div>

                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-28 sm:w-32 h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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
                        <SelectTrigger className="w-36 sm:w-44 h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
                            <SelectValue placeholder="Pilih Material" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">10 Material Teratas</SelectItem>
                            {chartData.materials.map((mat) => (
                                <SelectItem key={mat.code} value={mat.code}>
                                    {mat.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {activeMaterialStats && (
                <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5 px-2.5 bg-muted/30 rounded-lg border border-border/40 text-xs mb-1">
                    {activeMaterialStats.mode === 'single' ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Total {timeframe} Hari:
                                </span>
                                <span className="font-semibold text-foreground font-mono tabular-nums">
                                    {activeMaterialStats.periodTotal.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground text-[10px]">
                                        {activeMaterialStats.unit}
                                    </span>
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Puncak Harian:
                                </span>
                                <span className="font-semibold text-foreground font-mono tabular-nums">
                                    {activeMaterialStats.peakVal.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground text-[10px]">
                                        {activeMaterialStats.unit}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                        ({activeMaterialStats.peakDate})
                                    </span>
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Rata-rata:
                                </span>
                                <span className="font-semibold text-foreground font-mono tabular-nums">
                                    {activeMaterialStats.avgDaily.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground text-[10px]">
                                        {activeMaterialStats.unit}/hari
                                    </span>
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Komparasi:
                                </span>
                                <span className="font-semibold text-foreground">
                                    Top {activeMaterialStats.count} Material
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Terbanyak:
                                </span>
                                <span className="font-semibold text-foreground font-mono truncate max-w-50">
                                    {activeMaterialStats.top1Name}
                                </span>
                                <span className="text-muted-foreground text-[11px]">
                                    ({activeMaterialStats.top1Qty.toLocaleString('id-ID')}{' '}
                                    {activeMaterialStats.top1Unit})
                                </span>
                            </div>
                            <span className="text-border hidden md:inline">|</span>
                            <span className="text-[10px] text-muted-foreground/80 italic hidden md:inline">
                                Sorot titik garis untuk melihat detail per material
                            </span>
                        </>
                    )}
                </div>
            )}

            <div className="relative z-10 -mx-2 flex-1">
                <Chart
                    options={ChartOptions}
                    series={filteredSeries}
                    type={isSingle ? 'area' : 'line'}
                    height={280}
                    width="100%"
                />
            </div>
        </Card>
    );
};

export default OutMaterialLineChart;
