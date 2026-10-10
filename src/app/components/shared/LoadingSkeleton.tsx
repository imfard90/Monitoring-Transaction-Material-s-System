'use client';

import type { TableHTMLAttributes } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type LoadingSkeletonProps = {
    rows?: number;
    showHeader?: boolean;
    columns?: number;
    className?: string;
};

export function LoadingSkeleton({
    rows = 5,
    showHeader = true,
    columns = 4,
    className,
}: LoadingSkeletonProps) {
    return (
        <div className={cn('space-y-3', className)}>
            {showHeader && (
                <div className="flex gap-4">
                    {Array.from({ length: columns }).map((_, i) => (
                        <Skeleton key={`header-${i}`} className="h-10 w-full" />
                    ))}
                </div>
            )}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={`row-${rowIndex}`} className="flex gap-4">
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-12 w-full" />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function LoadingCardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('space-y-3 rounded-lg border p-4', className)}>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-20" />
        </div>
    );
}

export function LoadingTableRowSkeleton({ columns = 4 }: { columns?: number }) {
    return (
        <div className="flex items-center gap-4 border-b py-3">
            {Array.from({ length: columns }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
            ))}
        </div>
    );
}
