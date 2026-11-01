'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { IntechAgingData } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
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

type WarehouseOption = { id: number; name: string };

interface IntechAgingPanelProps {
    isStaff: boolean;
    warehouses: WarehouseOption[];
}

export const IntechAgingPanel: React.FC<IntechAgingPanelProps> = ({ isStaff, warehouses }) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const [activeSecondaryView, setActiveSecondaryView] = useState<'material' | 'technician'>(
        'material'
    );

    const targetWh = isStaff ? 'all' : selectedWh;

    const defaultData: IntechAgingData = {
        totalRecords: 0,
        totalQty: 0,
        tiers: [
            {
                key: 'under_7d',
                label: '< 7 Hari',
                description: 'Normal / Baru',
                count: 0,
                qty: 0,
                percentage: 0,
                color: '#10B981',
            },
            {
                key: 'd7_to_14d',
                label: '7–14 Hari',
                description: 'Waspada / Perlu Monitoring',
                count: 0,
                qty: 0,
                percentage: 0,
                color: '#F59E0B',
            },
            {
                key: 'over_14d',
                label: '> 14 Hari',
                description: 'Kritis / Segera Rekon',
                count: 0,
                qty: 0,
                percentage: 0,
                color: '#EF4444',
            },
        ],
        topMaterials: [],
        topTechnicians: [],
    };

    const { data = defaultData, isLoading } = useQuery<IntechAgingData>({
        queryKey: queryKeys.dashboard.intechAging(targetWh),
        queryFn: async () => {
            const { getIntechAgingData } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getIntechAgingData(targetWh);
            return res.success && res.data ? res.data : defaultData;
        },
        staleTime: 60 * 1000,
    });

    // 1. Donut Chart Options (Aging Tiers)
    const donutSeries = useMemo(() => {
        if (!data.tiers || data.tiers.length === 0 || data.totalRecords === 0) {
            return [1, 0, 0];
        }
        return data.tiers.map((t) => t.count);
    }, [data.tiers, data.totalRecords]);

    const donutOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: 'donut',
                fontFamily: 'inherit',
                foreColor: 'var(--muted-foreground, #7C8FAC)',
                toolbar: { show: false },
                animations: { enabled: true, speed: 500 },
            },
            labels: data.tiers.map((t) => t.label),
            colors: ['#10B981', '#F59E0B', '#EF4444'],
            stroke: {
                width: 2,
                colors: ['var(--card, #ffffff)'],
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '72%',
                        labels: {
                            show: true,
                            name: {
                                show: true,
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                fontWeight: 500,
                                color: 'var(--muted-foreground)',
                                offsetY: -2,
                            },
                            value: {
                                show: true,
                                fontSize: '18px',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: 'var(--foreground)',
                                offsetY: 4,
                                formatter: (val) => `${Number(val).toLocaleString('id-ID')}`,
                            },
                            total: {
                                show: true,
                                label: 'Total Intech',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                fontWeight: 600,
                                color: 'var(--muted-foreground)',
                                formatter: () => `${data.totalRecords.toLocaleString('id-ID')} item`,
                            },
                        },
                    },
                },
            },
            dataLabels: { enabled: false },
            legend: { show: false },
            tooltip: {
                theme: 'dark',
                y: {
                    formatter: (val, opts) => {
                        const tier =
                            opts?.seriesIndex != null
                                ? data.tiers[opts.seriesIndex]
                                : undefined;
                        const count = Number(val).toLocaleString('id-ID');
                        const qty = tier ? tier.qty.toLocaleString('id-ID') : '0';
                        return `${count} transaksi (${qty} qty)`;
                    },
                },
            },
        }),
        [data.tiers, data.totalRecords]
    );

    // 2. Bar Chart Options (Top Material or Top Technician)
    const barSeriesData = useMemo(() => {
        if (activeSecondaryView === 'material') {
            return {
                categories: data.topMaterials.map((m) =>
                    m.description.length > 28
                        ? `${m.description.slice(0, 26)}...`
                        : m.description
                ),
                rawCategories: data.topMaterials.map((m) => m.description),
                codes: data.topMaterials.map((m) => m.code),
                units: data.topMaterials.map((m) => m.unit),
                series: [{ name: 'Qty Intech', data: data.topMaterials.map((m) => m.qty_intech) }],
            };
        }
        return {
            categories: data.topTechnicians.map((t) => t.name),
            rawCategories: data.topTechnicians.map((t) => t.name),
            codes: data.topTechnicians.map((t) => t.nik),
            units: data.topTechnicians.map(() => 'item'),
            series: [{ name: 'Qty Intech', data: data.topTechnicians.map((t) => t.qty_intech) }],
        };
    }, [activeSecondaryView, data.topMaterials, data.topTechnicians]);

    const barOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: 'bar',
                fontFamily: 'inherit',
                foreColor: 'var(--muted-foreground, #7C8FAC)',
                toolbar: { show: false },
                animations: { enabled: true, speed: 500 },
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    borderRadius: 4,
                    barHeight: '44%',
                    dataLabels: {
                        position: 'top',
                    },
                },
            },
            colors: [activeSecondaryView === 'material' ? '#0EA5E9' : '#8B5CF6'],
            dataLabels: {
                enabled: true,
                offsetX: 18,
                style: {
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    colors: ['var(--foreground)'],
                },
                formatter: (val, opts) => {
                    const idx = opts?.dataPointIndex;
                    const unit = idx != null ? barSeriesData.units[idx] || '' : '';
                    return `${Number(val).toLocaleString('id-ID')} ${unit}`;
                },
            },
            grid: {
                borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
                strokeDashArray: 3,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: false } },
            },
            xaxis: {
                categories: barSeriesData.categories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: {
                    style: { fontSize: '10px', fontFamily: 'monospace' },
                    formatter: (val) => `${Number(val).toLocaleString('id-ID')}`,
                },
            },
            yaxis: {
                labels: {
                    style: { fontSize: '11px', fontFamily: 'inherit' },
                },
            },
            tooltip: {
                theme: 'dark',
                y: {
                    formatter: (val, opts) => {
                        const idx = opts?.dataPointIndex;
                        const unit = idx != null ? barSeriesData.units[idx] || '' : '';
                        const code = idx != null ? barSeriesData.codes[idx] || '' : '';
                        return `${Number(val).toLocaleString('id-ID')} ${unit} [${code}]`;
                    },
                },
            },
        }),
        [activeSecondaryView, barSeriesData]
    );

    return (
        <Card className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl p-3.5 sm:p-4 transition-shadow duration-200 hover:shadow-sm relative overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-warning/10 text-warning border border-warning/20 shrink-0">
                        <Icon icon="solar:clock-circle-bold-duotone" width={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Aging Stok Intech
                            </h2>
                            <Badge
                                variant="outline"
                                className="text-[10px] uppercase font-mono px-1.5 py-0 border-border/80 text-muted-foreground"
                            >
                                Status Intech
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            Distribusi durasi material tertahan teknisi & identifikasi stok kritis
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[125px] sm:w-[140px] h-7.5 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7.5 text-xs gap-1 border-border/70 hover:border-primary/50 hover:bg-primary/5"
                        asChild
                    >
                        <Link href="/stock-intech">
                            <span>Detail Table</span>
                            <Icon icon="solar:arrow-right-linear" width={14} />
                        </Link>
                    </Button>
                </div>
            </div>

            {/* KPI Summary Mini-Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3.5">
                {/* Tier < 7 Hari */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {'< 7 Hari (Normal)'}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-base font-bold font-mono tabular-nums text-foreground">
                                {data.tiers[0]?.count.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">transaksi</span>
                        </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                        {data.tiers[0]?.percentage}%
                    </span>
                </div>

                {/* Tier 7 - 14 Hari */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            7–14 Hari (Waspada)
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-base font-bold font-mono tabular-nums text-foreground">
                                {data.tiers[1]?.count.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">transaksi</span>
                        </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                        {data.tiers[1]?.percentage}%
                    </span>
                </div>

                {/* Tier > 14 Hari */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            {'> 14 Hari (Kritis)'}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-base font-bold font-mono tabular-nums text-foreground">
                                {data.tiers[2]?.count.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">transaksi</span>
                        </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                        {data.tiers[2]?.percentage}%
                    </span>
                </div>

                {/* Total Tertahan */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-muted/40">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <Icon icon="solar:box-minimalistic-linear" width={12} />
                            Total Volume Tertahan
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-base font-bold font-mono tabular-nums text-foreground">
                                {data.totalQty.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">qty satuan</span>
                        </div>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded-md border border-border/60">
                        {data.totalRecords} item
                    </span>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                {/* Grafik 1: Donut Breakdown Aging */}
                <div className="lg:col-span-5 flex flex-col p-3 rounded-lg border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold tracking-tight text-foreground">
                            Komposisi Usia Transaksi
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                            {data.totalRecords} Transaksi
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center h-[230px]">
                            <Skeleton className="h-36 w-36 rounded-full" />
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 justify-between">
                            <div className="flex items-center justify-center my-auto py-1">
                                <Chart
                                    options={donutOptions}
                                    series={donutSeries}
                                    type="donut"
                                    height={205}
                                    width="100%"
                                />
                            </div>

                            {/* Legend pills */}
                            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border/50 text-[11px]">
                                {data.tiers.map((tier) => (
                                    <div
                                        key={tier.key}
                                        className="flex flex-col p-1.5 rounded-md bg-card border border-border/50 text-center"
                                    >
                                        <div className="flex items-center justify-center gap-1 mb-0.5">
                                            <span
                                                className="h-2 w-2 rounded-full shrink-0"
                                                style={{ backgroundColor: tier.color }}
                                            />
                                            <span className="text-[10px] font-medium text-muted-foreground truncate">
                                                {tier.label}
                                            </span>
                                        </div>
                                        <span className="font-mono font-bold text-foreground text-xs tabular-nums">
                                            {tier.count.toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Grafik 2: Top Material Tertahan di Intech */}
                <div className="lg:col-span-7 flex flex-col p-3 rounded-lg border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <div>
                            <span className="text-xs font-semibold tracking-tight text-foreground">
                                {activeSecondaryView === 'material'
                                    ? 'Top 5 Material Tertahan di Intech'
                                    : 'Top 5 Teknisi Hold Intech'}
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                                Urutan kuantitas tertinggi yang belum direkon
                            </p>
                        </div>

                        {/* View toggle button */}
                        <div className="inline-flex rounded-md border border-border/70 p-0.5 bg-background shrink-0">
                            <button
                                type="button"
                                onClick={() => setActiveSecondaryView('material')}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                    activeSecondaryView === 'material'
                                        ? 'bg-primary text-primary-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Material
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSecondaryView('technician')}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                                    activeSecondaryView === 'technician'
                                        ? 'bg-primary text-primary-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Teknisi
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-2 py-4">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : barSeriesData.categories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 h-[220px] text-center text-xs text-muted-foreground">
                            <Icon
                                icon="solar:inbox-line-linear"
                                width={32}
                                className="text-muted-foreground/40 mb-1"
                            />
                            <span>Tidak ada material tertahan pada status Intech</span>
                        </div>
                    ) : (
                        <div className="flex-1 -mx-2">
                            <Chart
                                options={barOptions}
                                series={barSeriesData.series}
                                type="bar"
                                height={220}
                                width="100%"
                            />
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};
