'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface WarehousePerformance {
    key: number;
    name: string;
    trxOut: number;
    trxClose: number;
}

export const ProductPerformance = () => {
    const [warehouseData, setWarehouseData] = useState<WarehousePerformance[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                const { getWarehousePerformance } = await import(
                    '@/app/(DashboardLayout)/_actions/dashboard-actions'
                );
                const result = await getWarehousePerformance();
                if (isMounted && result.success && Array.isArray(result.data)) {
                    setWarehouseData(
                        result.data.map(
                            (d: {
                                key: number;
                                name: string;
                                trxOut: number;
                                trxClose: number;
                            }) => ({
                                key: d.key,
                                name: d.name,
                                trxOut: Number(d.trxOut),
                                trxClose: Number(d.trxClose),
                            })
                        )
                    );
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        loadData();

        return () => {
            isMounted = false;
        };
    }, []);

    // Calculate percentage and sort by percentage descending
    const performanceData = warehouseData
        .map((item) => {
            const percentage =
                item.trxOut === 0 ? 0 : Math.round((item.trxClose / item.trxOut) * 100);
            const clampedPercentage = Math.min(100, Math.max(0, percentage));

            let barColor = 'bg-emerald-500';
            let badgeClass =
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';

            if (percentage < 50) {
                barColor = 'bg-rose-500';
                badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
            } else if (percentage < 95) {
                barColor = 'bg-amber-500';
                badgeClass =
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
            }

            return {
                ...item,
                percentage: clampedPercentage,
                barColor,
                badgeClass,
            };
        })
        .sort((a, b) => b.percentage - a.percentage || b.trxOut - a.trxOut);

    return (
        <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none w-full relative overflow-hidden flex flex-col">
            <div
                className="pointer-events-none absolute right-0 top-0 h-28 w-28 bg-gradient-to-bl from-primary/5 to-transparent"
                aria-hidden="true"
            />

            {/* Header */}
            <div id="product" className="relative z-10 mb-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Performa Pengeluaran Gudang
                </h2>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                    Ringkasan persentase penyelesaian transaksi out material per gudang
                </p>
            </div>

            {/* Column Label / Legend */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60">
                <span>Nama Gudang</span>
                <span>Selesai / Out (Persentase)</span>
            </div>

            {/* Content List */}
            <div className="relative z-10 mt-3 space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
                {isLoading ? (
                    <div
                        className="space-y-3 py-1"
                        role="status"
                        aria-label="Memuat performa gudang"
                    >
                        {['perf-skel-1', 'perf-skel-2', 'perf-skel-3', 'perf-skel-4'].map(
                            (skelId) => (
                                <div key={skelId} className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-4 w-16" />
                                    </div>
                                    <Skeleton className="h-2 w-full rounded-full" />
                                </div>
                            )
                        )}
                    </div>
                ) : performanceData.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                        Belum ada data transaksi gudang.
                    </div>
                ) : (
                    <AnimatePresence>
                        {performanceData.map((item, index) => {
                            const isTop3 = index < 3;
                            return (
                                <motion.div
                                    key={item.key}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: index * 0.02 }}
                                    className="group space-y-1.5 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-muted/40"
                                >
                                    {/* Top Row: Rank, Warehouse Name, Count & Badge */}
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
                                                title={item.name}
                                            >
                                                {item.name}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                                {item.trxClose}/{item.trxOut}
                                            </span>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums',
                                                    item.badgeClass
                                                )}
                                            >
                                                {item.percentage}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Modern Linear Progress Bar */}
                                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-all duration-500 ease-out',
                                                item.barColor
                                            )}
                                            style={{ width: `${item.percentage}%` }}
                                            aria-hidden="true"
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </Card>
    );
};
