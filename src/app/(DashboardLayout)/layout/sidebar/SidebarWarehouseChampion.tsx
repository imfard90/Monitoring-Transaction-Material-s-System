'use client';

import { Icon } from '@iconify/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
    getWarehouseLeaderboard,
    type WarehouseChampionResponse,
} from '../../_actions/dashboard-actions';

const STORAGE_KEY = 'mtms_champion_widget_minimized';

export const SidebarWarehouseChampion = () => {
    const shouldReduceMotion = useReducedMotion();
    const [isMinimized, setIsMinimized] = useState<boolean>(false);
    const [mounted, setMounted] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState<WarehouseChampionResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'true') {
                setIsMinimized(true);
            }
        } catch {
            // Ignore localStorage errors
        }

        let isSubscribed = true;
        const fetchChampion = async () => {
            try {
                const res = await getWarehouseLeaderboard();
                if (isSubscribed) {
                    if (res.success && res.data) {
                        setLeaderboardData(res.data);
                    } else {
                        setHasError(true);
                    }
                }
            } catch {
                if (isSubscribed) setHasError(true);
            } finally {
                if (isSubscribed) setIsLoading(false);
            }
        };

        void fetchChampion();

        return () => {
            isSubscribed = false;
        };
    }, []);

    const toggleMinimized = () => {
        setIsMinimized((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                // Ignore localStorage errors
            }
            return next;
        });
    };

    if (!mounted) {
        return (
            <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
                <div className="h-4 w-32 rounded bg-amber-500/10 animate-pulse" />
            </div>
        );
    }

    const champion = leaderboardData?.champion;
    const leaderboard = leaderboardData?.leaderboard || [];

    // Trophy Halo Animated Icon Component
    const GoldenTrophyHalo = ({ isMini = false }: { isMini?: boolean }) => {
        const sizeClass = isMini ? 'w-7 h-7' : 'w-10 h-10';
        const iconSize = isMini ? 15 : 22;

        return (
            <div
                className={cn(
                    'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 via-yellow-500/15 to-amber-600/10 border border-amber-400/40 shadow-xs shrink-0 select-none',
                    sizeClass
                )}
            >
                {/* 1. Breathing Glow Radial Aura */}
                <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl bg-gradient-to-tr from-amber-400/40 to-yellow-300/30 blur-xs pointer-events-none"
                    animate={
                        shouldReduceMotion
                            ? { opacity: 0.5 }
                            : {
                                  scale: [1, 1.2, 1],
                                  opacity: [0.35, 0.75, 0.35],
                              }
                    }
                    transition={{
                        duration: 3.2,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: 'easeInOut',
                    }}
                />

                {/* 2. Shimmer Sweep Effect across container */}
                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                    <motion.div
                        aria-hidden="true"
                        className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-25deg]"
                        animate={
                            shouldReduceMotion
                                ? {}
                                : {
                                      x: ['-160%', '260%'],
                                  }
                        }
                        transition={{
                            duration: 2.6,
                            repeat: Number.POSITIVE_INFINITY,
                            repeatDelay: 2.5,
                            ease: 'easeInOut',
                        }}
                    />
                </div>

                {/* 3. Micro Sparkle Stars */}
                {!isMini && (
                    <>
                        <motion.div
                            aria-hidden="true"
                            className="absolute -top-1.5 -right-1 text-amber-300 dark:text-amber-200 pointer-events-none drop-shadow-xs"
                            animate={
                                shouldReduceMotion
                                    ? {}
                                    : {
                                          scale: [0, 1.15, 0],
                                          rotate: [0, 90, 180],
                                          opacity: [0, 1, 0],
                                      }
                            }
                            transition={{
                                duration: 2,
                                repeat: Number.POSITIVE_INFINITY,
                                repeatDelay: 1.5,
                                ease: 'easeInOut',
                            }}
                        >
                            <Icon icon="solar:stars-minimalistic-bold" width="13" height="13" />
                        </motion.div>
                        <motion.div
                            aria-hidden="true"
                            className="absolute -bottom-1 -left-1 text-yellow-400 pointer-events-none drop-shadow-xs"
                            animate={
                                shouldReduceMotion
                                    ? {}
                                    : {
                                          scale: [0, 1, 0],
                                          rotate: [0, -90, -180],
                                          opacity: [0, 1, 0],
                                      }
                            }
                            transition={{
                                duration: 2.2,
                                delay: 1,
                                repeat: Number.POSITIVE_INFINITY,
                                repeatDelay: 1.8,
                                ease: 'easeInOut',
                            }}
                        >
                            <Icon icon="solar:star-bold" width="9" height="9" />
                        </motion.div>
                    </>
                )}

                {/* The Golden Trophy Icon */}
                <Icon
                    icon="solar:cup-star-bold"
                    width={iconSize}
                    height={iconSize}
                    className="relative z-10 text-amber-500 dark:text-amber-400 drop-shadow-[0_1px_2px_rgba(217,119,6,0.3)] transition-transform duration-200 group-hover:scale-105"
                />
            </div>
        );
    };

    return (
        <aside aria-label="Widget Juara Gudang MTMS" className="relative select-none w-full">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <AnimatePresence mode="wait" initial={false}>
                    {isMinimized ? (
                        <motion.button
                            key="minimized"
                            type="button"
                            onClick={toggleMinimized}
                            aria-expanded={false}
                            aria-label="Tampilkan detail Juara Gudang MTMS"
                            initial={
                                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                            whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
                            className="group flex w-full items-center justify-between gap-2 rounded-xl border border-amber-500/30 dark:border-amber-400/25 bg-gradient-to-r from-amber-500/10 via-card to-card p-2 text-left shadow-2xs backdrop-blur-xs hover:border-amber-500/50 hover:bg-card transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
                        >
                            <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                <GoldenTrophyHalo isMini />
                                <div className="min-w-0 flex-1 truncate">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                            Juara #1
                                        </span>
                                        {champion && (
                                            <span className="text-[10px] font-extrabold text-foreground tabular-nums">
                                                {champion.score}%
                                            </span>
                                        )}
                                    </div>
                                    <p className="truncate text-xs font-semibold text-foreground group-hover:text-amber-500 transition-colors">
                                        {champion?.name || 'Klasemen Gudang'}
                                    </p>
                                </div>
                            </div>
                            <Icon
                                icon="solar:alt-arrow-up-linear"
                                width="14"
                                height="14"
                                className="text-muted-foreground/70 group-hover:text-amber-500 transition-colors shrink-0"
                                aria-hidden="true"
                            />
                        </motion.button>
                    ) : (
                        <motion.div
                            key="expanded"
                            role="region"
                            aria-label="Konten Juara Gudang MTMS"
                            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                            transition={{ duration: 0.2 }}
                            className="relative overflow-hidden rounded-xl border border-amber-500/35 dark:border-amber-400/30 bg-gradient-to-b from-amber-500/10 via-card/95 to-card p-3 shadow-2xs backdrop-blur-xs hover:border-amber-500/50 transition-colors"
                        >
                            {/* Header row with Title, Podium Button, and Minimize button */}
                            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/50">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                                    </span>
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">
                                        JUARA GUDANG
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {/* Dialog Trigger to view full leaderboard podium */}
                                    <DialogTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex h-5 w-5 items-center justify-center rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 transition-colors cursor-pointer"
                                            title="Lihat Klasemen Seluruh Gudang"
                                            aria-label="Buka popup klasemen gudang"
                                        >
                                            <Icon
                                                icon="solar:ranking-bold"
                                                width="13"
                                                height="13"
                                            />
                                        </button>
                                    </DialogTrigger>

                                    <button
                                        type="button"
                                        onClick={toggleMinimized}
                                        className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors cursor-pointer"
                                        aria-expanded={true}
                                        aria-label="Kecilkan widget Juara Gudang"
                                        title="Kecilkan widget"
                                    >
                                        <Icon
                                            icon="solar:minimize-square-linear"
                                            width="13"
                                            height="13"
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Main Content Area */}
                            {isLoading ? (
                                <div className="py-2.5 space-y-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 animate-pulse" />
                                        <div className="space-y-1 flex-1">
                                            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                                            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
                                </div>
                            ) : hasError ? (
                                <p className="py-3 text-center text-[11px] text-destructive">
                                    Data performa tidak dapat dimuat.
                                </p>
                            ) : champion ? (
                                <div className="mt-2 space-y-2">
                                    {/* Champion Card Top: Trophy & Info */}
                                    <div className="flex items-center gap-2.5">
                                        <GoldenTrophyHalo />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight">
                                                    Peringkat #1
                                                </span>
                                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold text-[11px] border border-amber-500/30 tabular-nums">
                                                    {champion.score}%
                                                </span>
                                            </div>
                                            <p
                                                className="truncate text-xs font-bold text-foreground hover:text-amber-500 transition-colors"
                                                title={champion.name}
                                            >
                                                {champion.name}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Progress Bar of Composite Score (using CSS progress() with Baseline 2026 support) */}
                                    <div className="h-1.5 w-full bg-muted/70 rounded-full overflow-hidden">
                                        <div
                                            className="champion-score-meter h-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 transition-all duration-500 ease-out"
                                            style={
                                                {
                                                    '--score-val': Math.min(
                                                        100,
                                                        Math.max(0, champion.score)
                                                    ),
                                                    width: `${Math.min(100, Math.max(0, champion.score))}%`,
                                                } as React.CSSProperties
                                            }
                                            aria-hidden="true"
                                        />
                                    </div>

                                    {/* 3 Metric Breakdown Chips */}
                                    <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/40 text-[9.5px]">
                                        <div
                                            className="flex flex-col items-center justify-center p-1 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors text-center"
                                            title={`Out Lensa HI: ${champion.outLensa.completed}/${champion.outLensa.total} (${champion.outLensa.percentage}%)`}
                                        >
                                            <span className="text-muted-foreground/80 font-medium">
                                                Out HI
                                            </span>
                                            <span className="font-bold text-foreground tabular-nums">
                                                {champion.outLensa.percentage}%
                                            </span>
                                        </div>
                                        <div
                                            className="flex flex-col items-center justify-center p-1 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors text-center"
                                            title={`Rekon Lensa: ${champion.rekonLensa.completed}/${champion.rekonLensa.total} (${champion.rekonLensa.percentage}%)`}
                                        >
                                            <span className="text-muted-foreground/80 font-medium">
                                                Rekon
                                            </span>
                                            <span className="font-bold text-foreground tabular-nums">
                                                {champion.rekonLensa.percentage}%
                                            </span>
                                        </div>
                                        <div
                                            className="flex flex-col items-center justify-center p-1 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors text-center"
                                            title={`Intech vs MTMS: ${champion.intechLensaVsMtms.completed}/${champion.intechLensaVsMtms.total} (${champion.intechLensaVsMtms.percentage}%)`}
                                        >
                                            <span className="text-muted-foreground/80 font-medium">
                                                Intech
                                            </span>
                                            <span className="font-bold text-foreground tabular-nums">
                                                {champion.intechLensaVsMtms.percentage}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Link to Full Leaderboard */}
                                    <DialogTrigger asChild>
                                        <button
                                            type="button"
                                            className="w-full mt-1 py-1 px-2 flex items-center justify-center gap-1.5 rounded-lg text-[10.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.99] transition-all cursor-pointer border border-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
                                        >
                                            <Icon icon="solar:podium-bold" width="12" height="12" />
                                            <span>Lihat Klasemen Gudang</span>
                                        </button>
                                    </DialogTrigger>
                                </div>
                            ) : (
                                <p className="py-3 text-center text-[11px] text-muted-foreground">
                                    Belum ada transaksi hari ini.
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Dialog Content: Podium & Full Warehouse Leaderboard */}
                <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-5 overflow-hidden">
                    <DialogHeader className="pb-2 border-b border-border/50">
                        <div className="flex items-center gap-2 text-amber-500">
                            <Icon icon="solar:cup-star-bold" width="22" height="22" />
                            <DialogTitle className="text-lg font-bold text-foreground">
                                Klasemen Performa Gudang MTMS
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Penilaian seimbang berdasarkan rata-rata Performa Out Lensa HI, Rekon
                            Lensa, dan Intech Lensa vs MTMS.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Top 3 Podium Visual Display */}
                    {leaderboard.length >= 2 && (
                        <div className="py-2.5 px-2 bg-muted/20 rounded-xl border border-border/50">
                            <div className="grid grid-cols-3 gap-2 items-end pt-1">
                                {/* Runner Up #2 (Silver) */}
                                {leaderboard[1] && (
                                    <div className="flex flex-col items-center text-center p-2 rounded-lg bg-card border border-slate-300 dark:border-slate-700 shadow-2xs">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 mb-1">
                                            <Icon
                                                icon="solar:medal-star-circle-bold"
                                                width="20"
                                                height="20"
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                            #2 Perak
                                        </span>
                                        <p
                                            className="text-xs font-semibold text-foreground truncate w-full"
                                            title={leaderboard[1].name}
                                        >
                                            {leaderboard[1].name}
                                        </p>
                                        <span className="text-xs font-extrabold text-foreground tabular-nums mt-0.5">
                                            {leaderboard[1].score}%
                                        </span>
                                    </div>
                                )}

                                {/* Champion #1 (Gold) */}
                                {leaderboard[0] && (
                                    <div className="flex flex-col items-center text-center p-2.5 rounded-lg bg-gradient-to-b from-amber-500/15 via-card to-card border-2 border-amber-500/50 shadow-md -translate-y-1">
                                        <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-500 mb-1 animate-pulse">
                                            <Icon
                                                icon="solar:cup-star-bold"
                                                width="24"
                                                height="24"
                                            />
                                        </div>
                                        <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                            👑 #1 Juara
                                        </span>
                                        <p
                                            className="text-xs font-bold text-foreground truncate w-full"
                                            title={leaderboard[0].name}
                                        >
                                            {leaderboard[0].name}
                                        </p>
                                        <span className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                                            {leaderboard[0].score}%
                                        </span>
                                    </div>
                                )}

                                {/* Runner Up #3 (Bronze) */}
                                {leaderboard[2] && (
                                    <div className="flex flex-col items-center text-center p-2 rounded-lg bg-card border border-amber-700/30 dark:border-amber-700/40 shadow-2xs">
                                        <div className="w-8 h-8 rounded-full bg-amber-700/20 flex items-center justify-center text-amber-700 dark:text-amber-500 mb-1">
                                            <Icon
                                                icon="solar:medal-ribbons-star-bold"
                                                width="20"
                                                height="20"
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase">
                                            #3 Perunggu
                                        </span>
                                        <p
                                            className="text-xs font-semibold text-foreground truncate w-full"
                                            title={leaderboard[2].name}
                                        >
                                            {leaderboard[2].name}
                                        </p>
                                        <span className="text-xs font-extrabold text-foreground tabular-nums mt-0.5">
                                            {leaderboard[2].score}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Detailed Leaderboard Table */}
                    <div
                        className="flex-1 overflow-y-auto min-h-[220px] max-h-[340px] pr-1 mt-2 border rounded-lg border-border/60 [overflow-anchor:auto]"
                        data-scroll-anchor="true"
                    >
                        <table className="w-full text-xs text-left">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-border/60 font-semibold">
                                <tr>
                                    <th className="py-2 px-3 text-center w-12">Rank</th>
                                    <th className="py-2 px-3">Gudang</th>
                                    <th className="py-2 px-2 text-center">Out HI</th>
                                    <th className="py-2 px-2 text-center">Rekon</th>
                                    <th className="py-2 px-2 text-center">Intech</th>
                                    <th className="py-2 px-3 text-right">Skor Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {leaderboard.map((row, idx) => {
                                    const isChamp = idx === 0;
                                    const isTop3 = idx < 3;

                                    return (
                                        <tr
                                            key={row.key}
                                            className={cn(
                                                'transition-colors hover:bg-muted/40',
                                                isChamp ? 'bg-amber-500/5 font-semibold' : ''
                                            )}
                                        >
                                            <td className="py-2 px-3 text-center font-bold">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px]',
                                                        idx === 0
                                                            ? 'bg-amber-500 text-amber-950 font-extrabold'
                                                            : idx === 1
                                                              ? 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                                                              : idx === 2
                                                                ? 'bg-amber-700/30 text-amber-800 dark:text-amber-300'
                                                                : 'text-muted-foreground'
                                                    )}
                                                >
                                                    #{idx + 1}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className="text-foreground truncate max-w-[140px]"
                                                        title={row.name}
                                                    >
                                                        {row.name}
                                                    </span>
                                                    {isChamp && (
                                                        <Icon
                                                            icon="solar:cup-star-bold"
                                                            width="13"
                                                            height="13"
                                                            className="text-amber-500 shrink-0"
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2 px-2 text-center tabular-nums text-muted-foreground">
                                                {row.outLensa.percentage}%
                                            </td>
                                            <td className="py-2 px-2 text-center tabular-nums text-muted-foreground">
                                                {row.rekonLensa.percentage}%
                                            </td>
                                            <td className="py-2 px-2 text-center tabular-nums text-muted-foreground">
                                                {row.intechLensaVsMtms.percentage}%
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums',
                                                        isTop3
                                                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                                            : 'bg-muted text-foreground'
                                                    )}
                                                >
                                                    {row.score}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </DialogContent>
            </Dialog>
        </aside>
    );
};
