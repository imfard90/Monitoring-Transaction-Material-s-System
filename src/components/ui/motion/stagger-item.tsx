'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { staggerItemVariants } from '@/lib/animation/stagger';
import { cn } from '@/lib/utils';

interface StaggerItemProps {
    children: ReactNode;
    className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
    return (
        <motion.div className={cn(className)} variants={staggerItemVariants}>
            {children}
        </motion.div>
    );
}
