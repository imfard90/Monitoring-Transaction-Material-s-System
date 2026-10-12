'use client';

import { Icon } from '@iconify/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mtms_announcement_minimized';

export const SidebarAnnouncement = () => {
    const shouldReduceMotion = useReducedMotion();
    const [isMinimized, setIsMinimized] = useState<boolean>(false);
    const [mounted, setMounted] = useState(false);

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
            <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-2.5 text-xs text-muted-foreground">
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            </div>
        );
    }

    return (
        <aside aria-label="Pengumuman Integritas MTMS" className="relative select-none w-full">
            <AnimatePresence mode="wait" initial={false}>
                {isMinimized ? (
                    <motion.button
                        key="minimized"
                        type="button"
                        onClick={toggleMinimized}
                        aria-expanded={false}
                        aria-label="Tampilkan komitmen integritas MTMS"
                        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                        whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
                        className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border/80 dark:border-border/60 bg-card/80 dark:bg-card/40 p-2 text-left shadow-2xs backdrop-blur-xs hover:border-primary/40 hover:bg-card transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <div className="flex items-center gap-2 overflow-hidden min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon icon="solar:shield-check-bold" width="14" height="14" />
                            </div>
                            <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                Integritas MTMS
                            </span>
                        </div>
                        <Icon
                            icon="solar:alt-arrow-up-linear"
                            width="14"
                            height="14"
                            className="text-muted-foreground/70 group-hover:text-primary transition-colors shrink-0"
                            aria-hidden="true"
                        />
                    </motion.button>
                ) : (
                    <motion.div
                        key="expanded"
                        id="announcement-content"
                        role="region"
                        aria-label="Konten pengumuman integritas"
                        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        transition={{ duration: 0.2 }}
                        className="relative overflow-hidden rounded-xl border border-border/80 dark:border-border/60 bg-card/90 dark:bg-card/60 p-3 shadow-2xs backdrop-blur-xs hover:border-primary/30 transition-colors"
                    >
                        {/* Header row with minimize button */}
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/50">
                            <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                    KOMITMEN
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={toggleMinimized}
                                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors cursor-pointer"
                                aria-expanded={true}
                                aria-label="Kecilkan widget pengumuman"
                                title="Kecilkan pengumuman"
                            >
                                <Icon icon="solar:minimize-square-linear" width="13" height="13" />
                            </button>
                        </div>

                        {/* Title row */}
                        <div className="my-2 flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon icon="solar:shield-check-bold" width="16" height="16" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">
                                    Integritas & Kepatuhan
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Budaya Operasional MTMS
                                </p>
                            </div>
                        </div>

                        {/* Message body */}
                        <div className="rounded-lg border border-border/50 bg-muted/40 p-2.5">
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Jalankan setiap alur MTMS dengan{' '}
                                <span className="font-medium text-foreground">
                                    penuh integritas
                                </span>
                                . Ketelitian dan kejujuran data adalah fondasi operasional logistik
                                kita.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </aside>
    );
};

export default SidebarAnnouncement;
