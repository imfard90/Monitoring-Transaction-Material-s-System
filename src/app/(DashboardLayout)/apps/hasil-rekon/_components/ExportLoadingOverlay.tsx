'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FileSpreadsheet, Loader2, Sparkles } from 'lucide-react';

interface ExportLoadingOverlayProps {
    isVisible: boolean;
    periodLabel?: string;
}

export default function ExportLoadingOverlay({
    isVisible,
    periodLabel,
}: ExportLoadingOverlayProps) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    key="export-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    role="status"
                    aria-live="polite"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 dark:bg-dark/80 backdrop-blur-md p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-sm rounded-2xl border border-border/80 bg-card p-6 text-card-foreground shadow-2xl overflow-hidden"
                    >
                        {/* Shimmering Top Accent Line */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-emerald-500 via-primary to-emerald-400 animate-pulse" />

                        <div className="flex flex-col items-center text-center space-y-4">
                            {/* Animated Glowing Icon Badge */}
                            <div className="relative">
                                <motion.div
                                    animate={{
                                        scale: [1, 1.08, 1],
                                        opacity: [0.6, 0.9, 0.6],
                                    }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 2.2,
                                        ease: 'easeInOut',
                                    }}
                                    className="absolute -inset-2 rounded-full bg-emerald-500/20 blur-md pointer-events-none"
                                />
                                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500/15 to-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm">
                                    <FileSpreadsheet className="h-8 w-8" />
                                </div>
                            </div>

                            {/* Status Typography */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
                                    <span>Mengekspor Data Excel</span>
                                    <Sparkles className="h-4 w-4 text-emerald-500 animate-spin" />
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {periodLabel
                                        ? `Mengambil & memproses data rekon periode ${periodLabel}...`
                                        : 'Sedang menyiapkan berkas .xlsx...'}
                                </p>
                            </div>

                            {/* Indeterminate Animated Progress Bar */}
                            <div className="w-full space-y-1.5 pt-1">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <motion.div
                                        animate={{
                                            x: ['-100%', '100%'],
                                        }}
                                        transition={{
                                            repeat: Infinity,
                                            duration: 1.4,
                                            ease: 'easeInOut',
                                        }}
                                        className="h-full w-1/2 rounded-full bg-linear-to-r from-emerald-500 to-primary"
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin text-emerald-600 dark:text-emerald-400" />
                                    <span>Mohon tunggu sejenak, jangan tutup halaman ini</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
