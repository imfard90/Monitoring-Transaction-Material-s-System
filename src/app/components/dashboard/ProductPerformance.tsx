'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export const ProductPerformance = () => {
    const cardRef = useScrollReveal();
    const { data: warehouseData = [], isLoading } = useQuery({
        queryKey: queryKeys.dashboard.leaderboard(),
        queryFn: async () => {
            const { getWarehousePerformance } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getWarehousePerformance();
            if (result.success && Array.isArray(result.data)) {
                return result.data.map(
                    (d: { key: number; name: string; trxOut: number; trxClose: number }) => ({
                        key: d.key,
                        name: d.name,
                        trxOut: Number(d.trxOut),
                        trxClose: Number(d.trxClose),
                    })
                );
            }
            return [];
        },
        staleTime: 60 * 1000,
    });

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
        <Card
            ref={cardRef} className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 motion-reduce:transition-none w-full relative overflow-hidden flex flex-col">
            <div
                className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-linear-to-bl from-primary/5 to-transparent"
                aria-hidden="true"
            />

            {/* Header */}
            <div id="product" className="relative z-10 mb-2.5">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Performa Pengeluaran Gudang
                    </h2>
                    <Icon
                        icon="solar:cup-star-bold-duotone"
                        width={18}
                        className="text-amber-500"
                    />
                </div>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                    Tingkat penyelesaian transaksi out material per gudang
                </p>
            </div>

            {/* Column Label / Legend */}
            <div className="relative z-10 flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border/60">
                <span>Nama Gudang</span>
                <span>Selesai / Out (Persentase)</span>
            </div>

            {/* Content List */}
            <div className="relative z-10 mt-2 space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {isLoading ? (
                    <div
                        className="space-y-2.5 py-1"
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
                                    <Skeleton className="h-1.5 w-full rounded-full" />
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
                            const isGold = index === 0;
                            const isSilver = index === 1;
                            const isBronze = index === 2;

                            return (
                                <motion.div
                                    key={item.key}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: index * 0.02 }}
                                    className="group space-y-1 rounded-lg p-1.5 -mx-1 transition-colors hover:bg-muted/40"
                                >
                                    {/* Top Row: Rank, Warehouse Name, Count & Badge */}
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className={cn(
                                                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 border',
                                                    isGold
                                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                                        : isSilver
                                                          ? 'bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30'
                                                          : isBronze
                                                            ? 'bg-amber-700/15 text-amber-700 dark:text-amber-500 border-amber-700/30'
                                                            : 'bg-muted/60 text-muted-foreground border-border/50'
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
                                            <span className="text-[10px] font-mono font-medium text-muted-foreground tabular-nums">
                                                {item.trxClose}/{item.trxOut}
                                            </span>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border tabular-nums',
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
                                            style={
                                                {
                                                    width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                                                } as React.CSSProperties
                                            }
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
