'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { staggerContainer } from '@/lib/animation/stagger';

interface StaggerContainerProps {
    children: ReactNode;
    className?: string;
    delay?: number;
    staggerDelay?: number;
}

export function StaggerContainer({
    children,
    className,
    delay = 0.04,
    staggerDelay = 0.08,
}: StaggerContainerProps) {
    return (
        <motion.div
            className={cn(className)}
            variants={{
                ...staggerContainer,
                show: {
                    ...staggerContainer.show,
                    transition: {
                        ...(staggerContainer.show as any).transition,
                        delayChildren: delay,
                        staggerChildren: staggerDelay,
                    },
                },
            }}
            initial="hidden"
            animate="show"
        >
            {children}
        </motion.div>
    );
}
