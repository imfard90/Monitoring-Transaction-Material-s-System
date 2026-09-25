'use client';

import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';

interface LoadingOverlayProps {
    isVisible: boolean;
    text?: string;
}

export function LoadingOverlay({ isVisible, text = 'Memuat Data...' }: LoadingOverlayProps) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <div className="relative flex flex-col items-center justify-center">
                        <motion.svg
                            width="120"
                            height="120"
                            viewBox="0 0 100 100"
                            className="text-blue-500 overflow-visible drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                        >
                            {/* Track background */}
                            <path
                                d="M 30,50 C 30,20 70,80 70,50 C 70,20 30,80 30,50"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />
                            {/* Animated infinite drawing path */}
                            <motion.path
                                d="M 30,50 C 30,20 70,80 70,50 C 70,20 30,80 30,50"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="6"
                                strokeLinecap="round"
                                initial={{ pathLength: 0, pathOffset: 0 }}
                                animate={{
                                    pathLength: [0, 1, 1],
                                    pathOffset: [0, 0, 1],
                                }}
                                transition={{
                                    duration: 2.5,
                                    ease: 'easeInOut',
                                    repeat: Infinity,
                                }}
                            />
                        </motion.svg>

                        <motion.div
                            className="mt-6 text-white text-lg font-semibold tracking-wide"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            {text}
                            <motion.span
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                            >
                                ...
                            </motion.span>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
