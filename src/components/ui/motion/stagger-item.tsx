'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { staggerItemVariants } from '@/lib/animation/stagger';

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
