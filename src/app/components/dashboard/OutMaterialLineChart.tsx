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

type WarehouseOption = { id: number; name: string };

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
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('all');

    const targetWh = isStaff ? 'all' : selectedWh;

    const { data: chartData = { dates: [], series: [], materials: [] } } = useQuery<ChartDataResult>({
        queryKey: queryKeys.dashboard.outMaterialLine(targetWh),
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
                startDate: Date;
            };

            if (result.success && resData?.topMats) {
                const dates: string[] = [];
                const d = new Date(resData.startDate);
                for (let i = 0; i < 30; i++) {
                    dates.push(`${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`);
                    d.setDate(d.getDate() + 1);
                }

                // Hitung frekuensi nama material untuk mendeteksi duplikasi deskripsi (misal: Subduct HB & non-HB)
                const nameCounts = new Map<string, number>();
                for (const t of resData.topMats) {
                    nameCounts.set(t.material_name, (nameCounts.get(t.material_name) ?? 0) + 1);
                }

                const materials: MaterialOption[] = resData.topMats.map((t) => {
                    const isDuplicate = (nameCounts.get(t.material_name) ?? 0) > 1;
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

                const dailyQtyByMaterialAndDate = new Map<string, number>();
                for (const record of resData.dailyData) {
                    dailyQtyByMaterialAndDate.set(
                        `${record.material_code}|${record.date_val}`,
                        Number(record.total_qty)
                    );
                }

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

                        const realVal = dailyQtyByMaterialAndDate.get(`${matCode}|${dateStr}`) ?? 0;
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

    // Filter series based on selected material code
    const filteredSeries = useMemo(() => {
        if (selectedMaterial === 'all') {
            // Default: show only Top 10 materials
            return chartData.series.slice(0, 10);
        }
        return chartData.series.filter((s) => s.code === selectedMaterial);
    }, [selectedMaterial, chartData]);

    // Ringkasan KPI material aktif
    const activeMaterialStats = useMemo(() => {
        if (selectedMaterial !== 'all') {
            const current = chartData.materials.find((m) => m.code === selectedMaterial);
            if (!current) return null;
            const s = chartData.series.find((item) => item.code === selectedMaterial);
            let peakVal = 0;
            let peakDate = '-';
            if (s) {
                s.realData.forEach((val, idx) => {
                    if (val > peakVal) {
                        peakVal = val;
                        peakDate = chartData.dates[idx] || '-';
                    }
                });
            }
            const avgDaily = Math.round((current.total30d / 30) * 10) / 10;
            return {
                mode: 'single' as const,
                title: current.name,
                code: current.code,
                unit: current.unit,
                total30d: current.total30d,
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
            hover: {
                size: 5,
                sizeOffset: 2,
            },
        },
        dataLabels: { enabled: false },
        legend: {
            show: false,
        },
        grid: {
            borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
            strokeDashArray: 3,
            xaxis: {
                lines: { show: false },
            },
        },
        xaxis: {
            categories: chartData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false },
            tickAmount: 10,
            crosshairs: {
                show: true,
                stroke: {
                    color: 'var(--color-border, #CBD5E1)',
                    width: 1,
                    dashArray: 3,
                },
            },
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
            enabled: true,
            shared: false,
            intersect: false,
            followCursor: true,
            theme: 'dark',
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                if (seriesIndex < 0 || dataPointIndex < 0) return '';
                const s = filteredSeries[seriesIndex];
                if (!s) return '';

                const color = w.globals.colors[seriesIndex] || '#0085db';
                const dateStr = chartData.dates[dataPointIndex] || '';
                const realVal = s.realData[dataPointIndex] ?? 0;
                const chartVal = series[seriesIndex]?.[dataPointIndex] ?? 0;
                const isScaled = s.code === 'AC-OF-SM-1-3SL';
                const unit = s.unit;

                return `
                    <div style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #f8fafc; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4); font-size: 12px; min-width: 220px; font-family: inherit;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 11px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; display: inline-block;"></span>
                                <span style="font-weight: 600; color: #f8fafc;">${dateStr}</span>
                            </div>
                            <span style="font-size: 10px; text-transform: uppercase; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); color: #cbd5e1; font-family: monospace;">${unit}</span>
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
        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none pb-0 h-full w-full relative overflow-hidden">
            <div
                className="absolute top-0 left-0 w-full h-28 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 sm:flex items-center justify-between mb-3">
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
                            <SelectTrigger className="w-32.5 sm:w-35 h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
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
                        <SelectTrigger className="w-40 sm:w-43.75 h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
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
                <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 px-3 bg-muted/40 rounded-lg border border-border/40 text-xs mb-2">
                    {activeMaterialStats.mode === 'single' ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Total 30 Hari:</span>
                                <span className="font-semibold text-foreground font-mono">
                                    {activeMaterialStats.total30d.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground">
                                        {activeMaterialStats.unit}
                                    </span>
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Puncak Harian:</span>
                                <span className="font-semibold text-foreground font-mono">
                                    {activeMaterialStats.peakVal.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground">
                                        {activeMaterialStats.unit}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground ml-1">
                                        ({activeMaterialStats.peakDate})
                                    </span>
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Rata-rata:</span>
                                <span className="font-semibold text-foreground font-mono">
                                    {activeMaterialStats.avgDaily.toLocaleString('id-ID')}{' '}
                                    <span className="font-normal text-muted-foreground">
                                        {activeMaterialStats.unit}/hari
                                    </span>
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Komparasi:</span>
                                <span className="font-semibold text-foreground">
                                    Top {activeMaterialStats.count} Material
                                </span>
                            </div>
                            <span className="text-border hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Terbanyak:</span>
                                <span className="font-semibold text-foreground font-mono truncate max-w-[240px]">
                                    {activeMaterialStats.top1Name}
                                </span>
                                <span className="text-muted-foreground">
                                    ({activeMaterialStats.top1Qty.toLocaleString('id-ID')}{' '}
                                    {activeMaterialStats.top1Unit})
                                </span>
                            </div>
                            <span className="text-border hidden md:inline">|</span>
                            <span className="text-[11px] text-muted-foreground/80 italic hidden md:inline">
                                Sorot titik garis untuk melihat detail per material
                            </span>
                        </>
                    )}
                </div>
            )}

            <div className="relative z-10 -mx-2">
                <Chart
                    options={ChartOptions}
                    series={filteredSeries}
                    type="line"
                    height={295}
                    width="100%"
                />
            </div>
        </Card>
    );
};

export default OutMaterialLineChart;
