'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { StockRunoutItem } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateId } from '@/lib/formatters';
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type WarehouseOption = { id: number; name: string };

export const StockRunoutForecast: React.FC<{
    isStaff: boolean;
    warehouses: WarehouseOption[];
}> = ({ isStaff, warehouses }) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const targetWh = isStaff ? 'all' : selectedWh;

    const { data: runoutData = [], isLoading } = useQuery<StockRunoutItem[]>({
        queryKey: queryKeys.dashboard.stockRunout(targetWh),
        queryFn: async () => {
            const { getStockRunoutForecast } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getStockRunoutForecast(targetWh, 7);
            return res.success && res.data ? res.data : [];
        },
        staleTime: 60 * 1000,
    });

    const criticalCount = useMemo(
        () => runoutData.filter((item) => item.status === 'critical').length,
        [runoutData]
    );

    const latestPolicyUpdate = useMemo(() => {
        let maxDate: string | null = null;
        for (const item of runoutData) {
            if (item.policy_updated_at) {
                if (!maxDate || item.policy_updated_at > maxDate) {
                    maxDate = item.policy_updated_at;
                }
            }
        }
        return maxDate;
    }, [runoutData]);

    const chartData = useMemo(() => {
        const categories = runoutData.map((item) => {
            const name = item.material_name;
            const truncated = name.length > 24 ? `${name.slice(0, 22)}...` : name;
            return targetWh === 'all' ? `${truncated} (${item.warehouse_name})` : truncated;
        });

        const seriesValues = runoutData.map((item) => item.days_of_supply);

        return { categories, seriesValues };
    }, [runoutData, targetWh]);

    const chartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: 'bar',
                fontFamily: 'inherit',
                foreColor: 'var(--color-muted-foreground, #7C8FAC)',
                toolbar: { show: false },
                animations: { enabled: true, speed: 450 },
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    borderRadius: 4,
                    barHeight: '52%',
                    distributed: true,
                    dataLabels: {
                        position: 'top',
                    },
                },
            },
            colors: runoutData.map((item) => {
                if (item.days_of_supply < 7) return '#EF4444'; // Red
                if (item.days_of_supply <= 14) return '#F59E0B'; // Amber
                return '#10B981'; // Green
            }),
            dataLabels: {
                enabled: true,
                offsetX: 16,
                style: {
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    colors: ['var(--foreground)'],
                },
                formatter: (val, opts) => {
                    const idx = opts?.dataPointIndex ?? -1;
                    if (idx < 0) return '';
                    const item = runoutData[idx];
                    if (!item) return '';
                    return `${Number(val)} Hari (sisa ${item.qty_stock.toLocaleString('id-ID')} ${item.material_unit})`;
                },
            },
            legend: { show: false },
            grid: {
                borderColor: 'var(--color-border, rgba(0,0,0,0.08))',
                strokeDashArray: 3,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: false } },
            },
            xaxis: {
                categories: chartData.categories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                title: { text: 'Estimasi Sisa Hari Sebelum Stok Habis (Days of Supply)' },
                labels: {
                    style: { fontSize: '10px', fontFamily: 'monospace' },
                    formatter: (val) => `${Number(val)}h`,
                },
            },
            yaxis: {
                labels: {
                    style: { fontSize: '11px', fontFamily: 'inherit' },
                },
            },
            tooltip: {
                theme: 'dark',
                custom: ({ dataPointIndex }) => {
                    const item = runoutData[dataPointIndex];
                    if (!item) return '';
                    const badgeBg =
                        item.status === 'critical'
                            ? '#ef4444'
                            : item.status === 'warning'
                              ? '#f59e0b'
                              : '#10b981';

                    return `
                        <div style="background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); border-radius: 10px; padding: 10px 14px; min-width: 230px; font-family: inherit;">
                            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 6px;">
                                <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">${item.warehouse_name}</span>
                                <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; background: ${badgeBg}; color: #ffffff;">
                                    ${item.status === 'critical' ? 'KRITIS' : item.status === 'warning' ? 'WASPADA' : 'AMAN'}
                                </span>
                            </div>
                            <div style="padding: 8px 0 6px 0;">
                                <div style="font-weight: 600; font-size: 12px; line-height: 1.35; color: #ffffff;">${item.material_name}</div>
                                <div style="font-size: 10px; color: #94a3b8; font-family: monospace; margin-top: 2px;">${item.material_code}</div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #94a3b8;">Sisa Stok Fisik:</span>
                                    <span style="font-weight: 600; color: #ffffff; font-family: monospace;">${item.qty_stock.toLocaleString('id-ID')} ${item.material_unit}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #94a3b8;">Konsumsi Harian:</span>
                                    <span style="font-weight: 600; color: #ffffff; font-family: monospace;">${item.daily_demand.toLocaleString('id-ID')} ${item.material_unit}/hari</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 2px;">
                                    <span style="color: #cbd5e1; font-weight: 600;">Estimasi Ketahanan:</span>
                                    <span style="font-weight: 700; color: ${badgeBg}; font-family: monospace; font-size: 13px;">${item.days_of_supply} Hari</span>
                                </div>
                            </div>
                        </div>
                    `;
                },
            },
        }),
        [runoutData, chartData.categories]
    );

    return (
        <Card className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl p-3.5 sm:p-4 h-full w-full relative overflow-hidden flex flex-col justify-between">
            <div
                className="absolute top-0 left-0 w-full h-20 bg-linear-to-b from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            {/* Header */}
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5 pb-2.5 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                        <Icon icon="solar:battery-charge-minimalistic-bold-duotone" width={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Ketahanan Stok Gudang
                            </h2>
                            {criticalCount > 0 && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] uppercase font-mono px-1.5 py-0 border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10"
                                >
                                    {criticalCount} Kritis
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>
                                Estimasi sisa hari sebelum stok habis (Days of Supply) berdasarkan
                                laju konsumsi policy
                            </span>
                            {latestPolicyUpdate && (
                                <span className="inline-flex items-center text-[11px] text-muted-foreground/80 font-mono">
                                    • Update Policy: {formatDateId(latestPolicyUpdate)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Legend chips */}
                    <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/40 px-2 py-1 rounded-md border border-border/40">
                        <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            {'<7h (Kritis)'}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            {'7-14h (Waspada)'}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {'>14h (Aman)'}
                        </span>
                    </div>

                    {!isStaff && (
                        <Select value={selectedWh} onValueChange={setSelectedWh}>
                            <SelectTrigger className="w-[125px] sm:w-[135px] h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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
                </div>
            </div>

            {/* Chart Area */}
            <div className="relative z-10 -mx-2 flex-1" aria-busy={isLoading}>
                {isLoading ? (
                    <div className="space-y-2 py-6 px-4">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                    </div>
                ) : runoutData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 h-[260px] text-center text-xs text-muted-foreground">
                        <Icon
                            icon="solar:check-circle-linear"
                            width={32}
                            className="text-emerald-500 mb-1"
                        />
                        <span>Seluruh material memiliki ketahanan stok yang aman</span>
                    </div>
                ) : (
                    <Chart
                        options={chartOptions}
                        series={[{ name: 'Days of Supply', data: chartData.seriesValues }]}
                        type="bar"
                        height={270}
                        width="100%"
                    />
                )}
            </div>
        </Card>
    );
};
