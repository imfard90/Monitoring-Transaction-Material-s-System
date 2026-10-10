'use client';

import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
    title?: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
};

export function EmptyState({
    title = 'No data available',
    description = 'There is nothing to display at the moment.',
    icon,
    action,
    className,
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex min-h-[400px] flex-col items-center justify-center p-8 text-center',
                className
            )}
        >
            <div className="rounded-full bg-muted p-4">
                {icon ?? (
                    <Icon icon="mdi:inbox-outline" className="h-10 w-10 text-muted-foreground" />
                )}
            </div>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}
