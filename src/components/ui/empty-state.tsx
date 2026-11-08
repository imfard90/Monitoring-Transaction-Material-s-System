import type * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

function EmptyState({
    icon,
    title,
    description,
    action,
    className,
    ...props
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 py-12 px-4 text-center',
                className
            )}
            role="status"
            aria-live="polite"
            {...props}
        >
            {icon && (
                <div
                    className="flex items-center justify-center rounded-xl bg-muted/50 p-3 text-muted-foreground"
                    aria-hidden="true"
                >
                    {icon}
                </div>
            )}
            <div className="space-y-1.5 max-w-sm">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {title}
                </h3>
                {description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export { EmptyState, type EmptyStateProps };
