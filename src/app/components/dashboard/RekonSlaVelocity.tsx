'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { RekonSlaData } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
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
import { queryKeys } from '@/lib/query-keys';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type WarehouseOption = { id: number; name: string };

const defaultData: RekonSlaData = {
    totalOpen: 0,
    avgDays: 0,
    slaRate: 0,
    tiers: [
        {
            key: 'on_time',
            label: '≤ 3 Hari (Sesuai SLA)',
            description: 'Tepat waktu',
            count: 0,
            percentage: 0,
            color: '#10B981',
        },
        {
            key: 'warning',
            label: '4–7 Hari (Waspada)',
            description: 'Mendekati batas',
            count: 0,
            percentage: 0,
            color: '#F59E0B',
        },
        {
            key: 'breached',
            label: '> 7 Hari (Overdue)',
            description: 'Melewati batas',
            count: 0,
            percentage: 0,
            color: '#EF4444',
        },
    ],
};

export const RekonSlaVelocity: React.FC<{
    isStaff: boolean;
    warehouses: WarehouseOption[];
}> = ({ isStaff, warehouses }) => {
    const [selectedWh, setSelectedWh] = useState<string>('all');
    const targetWh = isStaff ? 'all' : selectedWh;

    const { data = defaultData, isLoading } = useQuery<RekonSlaData>({
        queryKey: queryKeys.dashboard.rekonSla(targetWh),
        queryFn: async () => {
            const { getRekonSlaVelocity } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getRekonSlaVelocity(targetWh);
            return res.success && res.data ? res.data : defaultData;
        },
        staleTime: 60 * 1000,
    });

    const donutSeries = useMemo(() => {
        if (!data.tiers || data.totalOpen === 0) return [1, 0, 0];
        return data.tiers.map((t) => t.count);
    }, [data.tiers, data.totalOpen]);

    const chartOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: 'donut',
                fontFamily: 'inherit',
                foreColor: 'var(--muted-foreground)',
                toolbar: { show: false },
                animations: { enabled: true, speed: 500 },
            },
            labels: data.tiers.map((t) => t.label),
            colors: ['#10B981', '#F59E0B', '#EF4444'],
            stroke: {
                width: 2,
                colors: ['var(--card)'],
            },
            dataLabels: { enabled: false },
            legend: { show: false },
            plotOptions: {
                pie: {
                    donut: {
                        size: '58%',
                        background: 'transparent',
                        labels: {
                            show: true,
                            name: {
                                show: true,
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                offsetY: -3,
                                color: 'var(--muted-foreground)',
                            },
                            value: {
                                show: true,
                                fontSize: '17px',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                offsetY: 4,
                                color: 'var(--foreground)',
                                formatter: () => `${data.avgDays} Hari`,
                            },
                            total: {
                                show: true,
                                label: 'Rata-rata',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                fontWeight: 600,
                                color: 'var(--muted-foreground)',
                                formatter: () => `${data.avgDays} Hari`,
                            },
                        },
                    },
                },
            },
            tooltip: {
                theme: 'dark',
                y: {
                    formatter: (val, opts) => {
                        const tier =
                            opts?.seriesIndex == null ? undefined : data.tiers[opts.seriesIndex];
                        const count = Number(val).toLocaleString('id-ID');
                        const pct = tier ? tier.percentage : 0;
                        return `${count} transaksi (${pct}%)`;
                    },
                },
            },
        }),
        [data.tiers, data.avgDays]
    );

    return (
        <Card className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl p-3.5 sm:p-4 h-full w-full relative overflow-hidden flex flex-col justify-between">
            <div
                className="absolute top-0 right-0 w-24 h-24 bg-linear-to-bl from-primary/5 to-transparent pointer-events-none"
                aria-hidden="true"
            />

            {/* Header */}
            <div className="relative z-10 flex items-start justify-between gap-2 mb-2 pb-2.5 border-b border-border/60">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                        <Icon icon="solar:stopwatch-bold-duotone" width={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                SLA Kecepatan Rekon
                            </h2>
                        </div>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            Kepatuhan durasi penyelesaian rekon teknisi
                        </p>
                    </div>
                </div>

                {!isStaff && (
                    <Select value={selectedWh} onValueChange={setSelectedWh}>
                        <SelectTrigger className="w-[115px] h-7 text-xs bg-background/60 backdrop-blur-xs border-border/60 hover:border-primary/50 transition-colors">
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

            {/* Donut Chart Content */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-[175px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <Skeleton className="h-32 w-32 rounded-full" />
                        <Skeleton className="h-3.5 w-24" />
                    </div>
                ) : data.totalOpen === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-4 my-auto text-muted-foreground">
                        <Icon
                            icon="solar:shield-check-linear"
                            width={28}
                            className="text-emerald-500 mb-1"
                        />
                        <p className="text-xs font-semibold">Semua Rekon Selesai</p>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                            Tidak ada transaksi rekon tertahan saat ini.
                        </p>
                    </div>
                ) : (
                    <div className="w-full flex justify-center py-1">
                        <Chart
                            options={chartOptions}
                            series={donutSeries}
                            type="donut"
                            height={185}
                            width="100%"
                        />
                    </div>
                )}
            </div>

            {/* SLA Tiers Mini Strip */}
            <div className="relative z-10 mt-1 space-y-1.5 pt-2 border-t border-border/60">
                {data.tiers.map((tier) => (
                    <div
                        key={tier.key}
                        className="flex items-center justify-between text-xs p-1.5 rounded-md bg-muted/30 border border-border/40"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: tier.color }}
                            />
                            <span className="text-[11px] font-medium text-foreground truncate">
                                {tier.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                                {tier.count.toLocaleString('id-ID')}
                            </span>
                            <span
                                className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded"
                                style={{
                                    backgroundColor: `${tier.color}15`,
                                    color: tier.color,
                                }}
                            >
                                {tier.percentage}%
                            </span>
                        </div>
                    </div>
                ))}

                {/* Score Banner */}
                <div className="flex items-center justify-between pt-1 text-xs px-0.5">
                    <span className="text-[11px] text-muted-foreground font-medium">
                        Kepatuhan SLA (≤3 Hari):
                    </span>
                    <Badge
                        variant="outline"
                        className={`text-[10px] font-mono font-bold px-1.5 py-0 ${
                            data.slaRate >= 70
                                ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                                : data.slaRate >= 50
                                  ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                                  : 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10'
                        }`}
                    >
                        {data.slaRate}% On-Time
                    </Badge>
                </div>
            </div>
        </Card>
    );
};
