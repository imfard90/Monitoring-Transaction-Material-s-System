'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type WarehouseMetric = {
    key: number;
    name: string;
    total: number;
    completed: number;
    percentage: number;
};

type LensaMetrics = {
    outLensa: WarehouseMetric[];
    rekonLensa: WarehouseMetric[];
    intechLensaVsMtms: WarehouseMetric[];
};

function calculatePercentage(completed: number, total: number): number {
    return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function getMetricStyling(percentage: number) {
    if (percentage < 50) {
        return {
            barColor: 'bg-rose-500',
            badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        };
    }
    if (percentage < 95) {
        return {
            barColor: 'bg-amber-500',
            badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
    }
    return {
        barColor: 'bg-emerald-500',
        badgeClass:
            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    };
}

function sortByCompletion(rows: WarehouseMetric[]): WarehouseMetric[] {
    return [...rows].sort(
        (left, right) =>
            calculatePercentage(right.completed, right.total) -
                calculatePercentage(left.completed, left.total) ||
            right.total - left.total ||
            left.name.localeCompare(right.name)
    );
}

function MetricCard({
    title,
    description,
    rows,
    isLoading,
    hasError,
    ratioLabel = 'Selesai / Total (Persentase)',
}: {
    title: string;
    description: string;
    rows: WarehouseMetric[];
    isLoading: boolean;
    hasError: boolean;
    ratioLabel?: string;
}) {
    const sortedRows = sortByCompletion(rows);

    return (
        <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none w-full relative overflow-hidden flex flex-col">
            <div
                className="pointer-events-none absolute right-0 top-0 h-28 w-28 bg-gradient-to-bl from-primary/5 to-transparent"
                aria-hidden="true"
            />

            {/* Header */}
            <div className="relative z-10 mb-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">{description}</p>
            </div>

            {/* Column Label / Legend */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60">
                <span>Gudang</span>
                <span>{ratioLabel}</span>
            </div>

            {/* Content List */}
            <div className="relative z-10 mt-3 space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {isLoading ? (
                    <div className="space-y-3 py-1" role="status" aria-label={`Memuat ${title}`}>
                        {['lensa-skel-1', 'lensa-skel-2', 'lensa-skel-3'].map((skelId) => (
                            <div key={skelId} className="space-y-1.5">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-4 w-16" />
                                </div>
                                <Skeleton className="h-2 w-full rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : hasError ? (
                    <p className="py-6 text-center text-xs text-destructive">
                        Data performa tidak dapat dimuat saat ini.
                    </p>
                ) : sortedRows.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        Belum ada data transaksi lensa.
                    </p>
                ) : (
                    sortedRows.map((row, index) => {
                        const isTop3 = index < 3;
                        const { barColor, badgeClass } = getMetricStyling(row.percentage);

                        return (
                            <div
                                key={row.key}
                                className="group space-y-1.5 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-muted/40"
                            >
                                {/* Row Top: Rank, Name, Ratio & Badge */}
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={cn(
                                                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0',
                                                isTop3
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-muted text-muted-foreground'
                                            )}
                                            aria-hidden="true"
                                        >
                                            #{index + 1}
                                        </span>
                                        <span
                                            className="font-medium text-foreground truncate text-xs"
                                            title={row.name}
                                        >
                                            {row.name}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                            {Number(row.completed)}/{Number(row.total)}
                                        </span>
                                        <span
                                            className={cn(
                                                'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums',
                                                badgeClass
                                            )}
                                        >
                                            {row.percentage}%
                                        </span>
                                    </div>
                                </div>

                                {/* Modern Linear Progress Bar */}
                                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500 ease-out',
                                            barColor
                                        )}
                                        style={{ width: `${row.percentage}%` }}
                                        aria-hidden="true"
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

export function LensaPerformance() {
    const [metrics, setMetrics] = useState<LensaMetrics>({
        outLensa: [],
        rekonLensa: [],
        intechLensaVsMtms: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isActive = true;
        const loadMetrics = async () => {
            try {
                const { getLensaWarehousePerformance, getIntechLensaWarehousePerformance } =
                    await import('@/app/(DashboardLayout)/_actions/dashboard-actions');
                const [lensaResult, intechResult] = await Promise.all([
                    getLensaWarehousePerformance(),
                    getIntechLensaWarehousePerformance(),
                ]);

                if (isActive) {
                    if (lensaResult.success && lensaResult.data) {
                        setMetrics((prev) => ({
                            ...prev,
                            outLensa: (lensaResult.data?.outLensa ?? []).map((row) => ({
                                ...row,
                                total: Number(row.total),
                                completed: Number(row.completed),
                                percentage: calculatePercentage(
                                    Number(row.completed),
                                    Number(row.total)
                                ),
                            })),
                            rekonLensa: (lensaResult.data?.rekonLensa ?? []).map((row) => ({
                                ...row,
                                total: Number(row.total),
                                completed: Number(row.completed),
                                percentage: calculatePercentage(
                                    Number(row.completed),
                                    Number(row.total)
                                ),
                            })),
                        }));
                    }

                    if (intechResult.success && intechResult.data) {
                        setMetrics((prev) => ({
                            ...prev,
                            intechLensaVsMtms: (intechResult.data ?? []).map((row) => ({
                                ...row,
                                total: Number(row.total),
                                completed: Number(row.completed),
                                percentage: calculatePercentage(
                                    Number(row.completed),
                                    Number(row.total)
                                ),
                            })),
                        }));
                    }

                    if (!lensaResult.success && !intechResult.success) {
                        setHasError(true);
                    }
                }
            } catch {
                if (isActive) setHasError(true);
            } finally {
                if (isActive) setIsLoading(false);
            }
        };
        void loadMetrics();
        return () => {
            isActive = false;
        };
    }, []);

    return (
        <section aria-label="Performa Lensa" className="contents">
            <MetricCard
                title="Performa Out Lensa HI"
                description="Pengeluaran dan transaksi yang telah diproses SAP per gudang."
                rows={metrics.outLensa}
                isLoading={isLoading}
                hasError={hasError}
            />
            <MetricCard
                title="Performa Rekon Lensa"
                description="WO Lensa yang sudah masuk ke Rekon Lensa per gudang."
                rows={metrics.rekonLensa}
                isLoading={isLoading}
                hasError={hasError}
            />
            <MetricCard
                title="Performa Intech Lensa Vs MTMS"
                description="Kesesuaian stok fisik teknisi (Intech Lensa) dengan saldo MTMS per gudang."
                rows={metrics.intechLensaVsMtms}
                isLoading={isLoading}
                hasError={hasError}
                ratioLabel="Match / Total (Persentase)"
            />
        </section>
    );
}
