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
            <div className="w-full rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <div className="h-4 w-24 rounded bg-primary/10 animate-pulse" />
            </div>
        );
    }

    return (
        <aside
            aria-label="Pengumuman Integritas MTMS"
            className="relative select-none w-full"
        >
            <AnimatePresence mode="wait" initial={false}>
                {isMinimized ? (
                    <motion.button
                        key="minimized"
                        type="button"
                        onClick={toggleMinimized}
                        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                        whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                        className="animate-border-blink group flex w-full items-center justify-between gap-2 rounded-lg border border-primary/40 bg-card/90 p-2 text-left shadow-sm backdrop-blur-sm hover:bg-card hover:shadow-md transition-all duration-200 cursor-pointer"
                        title="Tampilkan pengumuman lengkap"
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className="relative flex h-2 w-2 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                <Icon icon="lucide:shield-check" width="14" className="text-primary" />
                                Integritas MTMS
                            </span>
                        </div>
                        <Icon
                            icon="lucide:chevron-up"
                            width="14"
                            className="text-muted-foreground group-hover:text-foreground transition-transform duration-200"
                            aria-hidden="true"
                        />
                    </motion.button>
                ) : (
                    <motion.div
                        key="expanded"
                        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="animate-border-blink relative overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 via-card/95 to-card p-3 shadow-sm backdrop-blur-sm transition-shadow duration-300"
                    >
                        {/* Ambient decorative aura */}
                        <div
                            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/15 blur-2xl"
                            aria-hidden="true"
                        />
                        <div
                            className="pointer-events-none absolute -left-6 -bottom-6 h-20 w-20 rounded-full bg-primary/10 blur-xl"
                            aria-hidden="true"
                        />

                        {/* Top header row */}
                        <div className="relative flex items-center justify-between gap-2 pb-2">
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                    PENGUMUMAN
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={toggleMinimized}
                                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary transition-colors cursor-pointer"
                                aria-label="Kecilkan widget pengumuman"
                                title="Kecilkan pengumuman"
                            >
                                <Icon icon="lucide:minus" width="12" />
                            </button>
                        </div>

                        {/* Badge / icon row */}
                        <div className="relative my-1 flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-xs">
                                <Icon icon="lucide:shield-check" width="16" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">
                                    Komitmen & Integritas
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Budaya Operasional MTMS
                                </p>
                            </div>
                        </div>

                        {/* Message body */}
                        <div className="relative mt-2 rounded-lg border border-border/60 bg-background/70 p-2.5 backdrop-blur-xs">
                            <Icon
                                icon="lucide:quote"
                                width="14"
                                className="mb-1 text-primary/40"
                                aria-hidden="true"
                            />
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Terima kasih sudah berkontribusi dengan menjalankan proses MTMS ini dengan{' '}
                                <span className="font-medium text-foreground">penuh integritas</span>,{' '}
                                Sebaik apapun <span className="font-medium text-foreground">TOOL nya</span> jika tidak disiplin dan berintegritas,{' '}
                                <span className="font-semibold text-primary">Tidak akan ada artinya</span>.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </aside>
    );
};

export default SidebarAnnouncement;
