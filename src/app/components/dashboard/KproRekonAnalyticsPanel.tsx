'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type React from 'react';
import { useId, useMemo, useState } from 'react';
import {
    getKproRekonAnalytics,
    type KproRekonAnalyticsData,
} from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const defaultData: KproRekonAnalyticsData = {
    summary: {
        totalOrders: 0,
        totalRekonLensa: 0,
        totalBelumRekon: 0,
        persentaseRekon: 0,
    },
    districtRollup: [],
    dailyTrend: [],
    districts: [],
    selectedDistrict: 'all',
    selectedDays: 30,
};

export const KproRekonAnalyticsPanel: React.FC = () => {
    const [selectedDays, setSelectedDays] = useState<number>(30);
    const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
    const chartId = useId();

    const { data = defaultData, isLoading } = useQuery<KproRekonAnalyticsData>({
        queryKey: queryKeys.dashboard.kproRekon(selectedDays, selectedDistrict),
        queryFn: async () => {
            const res = await getKproRekonAnalytics({
                days: selectedDays,
                district: selectedDistrict,
            });
            return res.success && res.data ? res.data : defaultData;
        },
        staleTime: 60 * 1000,
    });

    const { summary, districtRollup, dailyTrend, districts } = data;

    // Series untuk Grafik Combo (Column: Orders & Rekon, Line: % Kepatuhan)
    const chartCategories = useMemo(() => {
        return dailyTrend.map((item) => {
            // Format YYYY-MM-DD -> DD/MM
            const parts = item.tgl.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}`;
            }
            return item.tgl;
        });
    }, [dailyTrend]);

    const chartSeries = useMemo(() => {
        return [
            {
                name: 'Total Order (K-PRO)',
                type: 'column',
                data: dailyTrend.map((item) => Number(item.total_orders)),
            },
            {
                name: 'Terekon Lensa',
                type: 'column',
                data: dailyTrend.map((item) => Number(item.total_rekon_lensa)),
            },
            {
                name: 'Kepatuhan (%)',
                type: 'line',
                data: dailyTrend.map((item) => Number(item.persentase_rekon)),
            },
        ];
    }, [dailyTrend]);

    const chartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                id: chartId,
                type: 'line',
                fontFamily: 'inherit',
                foreColor: 'var(--color-muted-foreground, #7C8FAC)',
                toolbar: { show: false },
                animations: { enabled: true, speed: 450 },
            },
            stroke: {
                width: [0, 0, 3],
                curve: 'smooth',
            },
            plotOptions: {
                bar: {
                    columnWidth: '50%',
                    borderRadius: 3,
                },
            },
            colors: ['#3B82F6', '#10B981', '#F59E0B'],
            fill: {
                opacity: [0.85, 0.95, 1],
            },
            dataLabels: {
                enabled: false,
            },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                fontSize: '11px',
                fontWeight: 500,
                labels: {
                    colors: 'var(--color-foreground, #2A3547)',
                },
                markers: {
                    size: 5,
                    shape: 'circle',
                },
                itemMargin: { horizontal: 8, vertical: 0 },
            },
            grid: {
                borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
                strokeDashArray: 3,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: true } },
            },
            xaxis: {
                categories: chartCategories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: {
                    style: { fontSize: '10px', fontFamily: 'monospace' },
                    rotate: -45,
                    rotateAlways: dailyTrend.length > 15,
                },
            },
            yaxis: [
                {
                    title: {
                        text: 'Volume Order',
                        style: { fontSize: '11px', fontWeight: 500 },
                    },
                    labels: {
                        style: { fontSize: '10px', fontFamily: 'monospace' },
                        formatter: (val) => `${Number(val).toLocaleString('id-ID')}`,
                    },
                },
                {
                    opposite: true,
                    min: 0,
                    max: 100,
                    title: {
                        text: '% Kepatuhan',
                        style: { fontSize: '11px', fontWeight: 500 },
                    },
                    labels: {
                        style: { fontSize: '10px', fontFamily: 'monospace' },
                        formatter: (val) => `${Number(val).toFixed(0)}%`,
                    },
                },
            ],
            tooltip: {
                theme: 'dark',
                shared: true,
                intersect: false,
                y: {
                    formatter: (val, opts) => {
                        if (val === undefined || val === null) return '-';
                        if (opts?.seriesIndex === 2) {
                            return `${Number(val).toFixed(2)}%`;
                        }
                        return `${Number(val).toLocaleString('id-ID')} order`;
                    },
                },
            },
        }),
        [chartId, chartCategories, dailyTrend.length]
    );

    // Rasio warna badge kepatuhan keseluruhan
    const complianceBadgeColor = useMemo(() => {
        if (summary.persentaseRekon >= 80) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30';
        if (summary.persentaseRekon >= 50) return 'text-amber-600 bg-amber-500/10 border-amber-500/30';
        return 'text-rose-600 bg-rose-500/10 border-rose-500/30';
    }, [summary.persentaseRekon]);

    return (
        <Card className="p-4 sm:p-5 border-border/80 bg-card rounded-2xl shadow-sm flex flex-col gap-4">
            {/* Header: Title, Controls, and Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                        <Icon icon="solar:chart-square-bold-duotone" width={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-semibold text-foreground tracking-tight">
                                Analisis Kepatuhan Rekon K-PRO
                            </h2>
                            <Badge
                                variant="outline"
                                className="text-[10px] h-5 px-1.5 font-normal border-primary/30 text-primary bg-primary/5"
                            >
                                OLAP Data Mart
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Monitoring sinkronisasi Work Order K-PRO terhadap Material Lensa Rekon
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
                    {/* Filter Rentang Hari */}
                    <Select
                        value={String(selectedDays)}
                        onValueChange={(val) => setSelectedDays(Number(val))}
                    >
                        <SelectTrigger className="h-8 text-xs w-32 border-border/80">
                            <SelectValue placeholder="Rentang Waktu" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="14" className="text-xs">
                                14 Hari Terakhir
                            </SelectItem>
                            <SelectItem value="30" className="text-xs">
                                30 Hari Terakhir
                            </SelectItem>
                            <SelectItem value="60" className="text-xs">
                                60 Hari Terakhir
                            </SelectItem>
                            <SelectItem value="90" className="text-xs">
                                90 Hari Terakhir
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Filter Distrik */}
                    <Select
                        value={selectedDistrict}
                        onValueChange={(val) => setSelectedDistrict(val)}
                    >
                        <SelectTrigger className="h-8 text-xs w-36 border-border/80">
                            <SelectValue placeholder="Semua Distrik" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">
                                Semua Distrik
                            </SelectItem>
                            {districts.map((d) => (
                                <SelectItem key={d} value={d} className="text-xs">
                                    {d}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Tombol Tautan ke Data K-PRO Reference */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 border-border/80 hover:border-primary/50 hover:bg-primary/5"
                        asChild
                    >
                        <Link href="/reference/data-kpro-ref">
                            <span>Tabel K-PRO</span>
                            <Icon icon="solar:arrow-right-linear" width={14} />
                        </Link>
                    </Button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            {isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {['kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'].map((id) => (
                        <Skeleton key={id} className="h-20 rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Card 1: Total Orders */}
                    <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                            <span className="text-[11px] font-medium">Total Work Order</span>
                            <Icon icon="solar:clipboard-list-bold-duotone" width={16} />
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1">
                            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                                {summary.totalOrders.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">order</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                            {selectedDistrict === 'all' ? 'Seluruh Distrik' : selectedDistrict}
                        </span>
                    </div>

                    {/* Card 2: Sudah Rekon */}
                    <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                            <span className="text-[11px] font-medium">Tervalidasi Rekon Lensa</span>
                            <Icon icon="solar:check-circle-bold-duotone" width={16} />
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1">
                            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                                {summary.totalRekonLensa.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">order</span>
                        </div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                            Terekonsiliasi material
                        </span>
                    </div>

                    {/* Card 3: Belum Rekon */}
                    <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                            <span className="text-[11px] font-medium">Belum Terekon</span>
                            <Icon icon="solar:clock-circle-bold-duotone" width={16} />
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1">
                            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                                {summary.totalBelumRekon.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">order</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                            Menunggu penyelesaian
                        </span>
                    </div>

                    {/* Card 4: Rasio Kepatuhan */}
                    <div className="p-3 rounded-xl border border-border/80 bg-muted/40 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-foreground">
                            <span className="text-[11px] font-medium text-muted-foreground">
                                Rasio Kepatuhan
                            </span>
                            <Icon icon="solar:pie-chart-2-bold-duotone" width={16} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                                {summary.persentaseRekon}%
                            </span>
                            <span
                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${complianceBadgeColor}`}
                            >
                                {summary.persentaseRekon >= 80
                                    ? 'Tinggi'
                                    : summary.persentaseRekon >= 50
                                      ? 'Sedang'
                                      : 'Rendah'}
                            </span>
                        </div>
                        {/* Mini progress bar */}
                        <div className="w-full bg-muted rounded-full h-1.5 mt-1 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    summary.persentaseRekon >= 80
                                        ? 'bg-emerald-500'
                                        : summary.persentaseRekon >= 50
                                          ? 'bg-amber-500'
                                          : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, summary.persentaseRekon)}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content: Chart (Left) + District Leaderboard (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                {/* Tren Harian (7 Cols) */}
                <div className="lg:col-span-7 flex flex-col rounded-xl border border-border/70 p-3 sm:p-4 bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <Icon icon="solar:graph-bold" width={16} className="text-primary" />
                            <h3 className="text-xs font-semibold text-foreground">
                                Tren Harian Order vs Rekon (
                                {selectedDistrict === 'all' ? 'Semua Distrik' : selectedDistrict})
                            </h3>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                            {dailyTrend.length} hari terdata
                        </span>
                    </div>

                    <div className="flex-1 min-h-[280px]">
                        {isLoading ? (
                            <Skeleton className="w-full h-full min-h-[280px] rounded-lg" />
                        ) : dailyTrend.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground text-xs gap-2">
                                <Icon icon="solar:inbox-line-linear" width={32} />
                                <span>Tidak ada data tren untuk filter yang dipilih</span>
                            </div>
                        ) : (
                            <Chart
                                options={chartOptions}
                                series={chartSeries}
                                type="line"
                                height={280}
                                width="100%"
                            />
                        )}
                    </div>
                </div>

                {/* District Leaderboard (5 Cols) */}
                <div className="lg:col-span-5 flex flex-col rounded-xl border border-border/70 p-3 sm:p-4 bg-muted/10">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <Icon icon="solar:ranking-bold" width={16} className="text-primary" />
                            <h3 className="text-xs font-semibold text-foreground">
                                Peringkat Distrik ({selectedDays} Hari)
                            </h3>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                            Klik distrik untuk filter
                        </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[290px] pr-1">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={`skel-row-${i}`} className="h-11 rounded-lg" />
                            ))
                        ) : districtRollup.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground text-xs gap-2">
                                <Icon icon="solar:inbox-line-linear" width={28} />
                                <span>Tidak ada data distrik</span>
                            </div>
                        ) : (
                            districtRollup.map((row) => {
                                const isSelected = selectedDistrict === row.district_tif;
                                const pct = Number(row.persentase_rekon);
                                return (
                                    <button
                                        type="button"
                                        key={row.district_tif}
                                        onClick={() =>
                                            setSelectedDistrict(
                                                isSelected ? 'all' : row.district_tif
                                            )
                                        }
                                        className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary/10 shadow-xs'
                                                : 'border-border/60 hover:border-primary/40 bg-card hover:bg-muted/40'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                                {row.district_tif}
                                                {isSelected && (
                                                    <span className="text-[9px] px-1 py-0.2 rounded bg-primary text-primary-foreground font-semibold">
                                                        Aktif
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono font-bold text-foreground">
                                                    {Number(row.total_rekon_lensa).toLocaleString('id-ID')}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    / {Number(row.total_orders).toLocaleString('id-ID')}
                                                </span>
                                                <span
                                                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                                                        pct >= 80
                                                            ? 'text-emerald-600 bg-emerald-500/10'
                                                            : pct >= 50
                                                              ? 'text-amber-600 bg-amber-500/10'
                                                              : 'text-rose-600 bg-rose-500/10'
                                                    }`}
                                                >
                                                    {pct}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-1 mt-2 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${
                                                    pct >= 80
                                                        ? 'bg-emerald-500'
                                                        : pct >= 50
                                                          ? 'bg-amber-500'
                                                          : 'bg-rose-500'
                                                }`}
                                                style={{ width: `${Math.min(100, pct)}%` }}
                                            />
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Note */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1 border-t border-border/40">
                <span className="flex items-center gap-1">
                    <Icon icon="solar:database-bold" width={11} className="text-primary/70" />
                    Sumber: Materialized View <code className="font-mono text-foreground/80">analytics.mv_kpro_rekon_summary</code> (Sinkronisasi berkala per jam)
                </span>
                <span>Response query &lt; 1ms (OLAP Data Mart)</span>
            </div>
        </Card>
    );
};
