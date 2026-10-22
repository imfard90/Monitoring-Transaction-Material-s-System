'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StockStatusBadgeProps {
    status: 'critical' | 'low' | 'normal' | 'overstock';
    className?: string;
}

const statusConfig = {
    critical: {
        label: 'Kritis',
        className: 'bg-destructive/10 text-destructive border-destructive/20',
        icon: '🔴',
    },
    low: {
        label: 'Rendah',
        className: 'bg-warning/10 text-warning border-warning/20',
        icon: '🟡',
    },
    normal: {
        label: 'Normal',
        className: 'bg-success/10 text-success border-success/20',
        icon: '🟢',
    },
    overstock: {
        label: 'Overstock',
        className: 'bg-primary/10 text-primary border-primary/20',
        icon: '🔵',
    },
};

export function StockStatusBadge({ status, className }: StockStatusBadgeProps) {
    const config = statusConfig[status];
    return (
        <Badge variant="outline" className={cn(config.className, className)}>
            {config.label}
        </Badge>
    );
}

export function getStatusConfig(status: 'critical' | 'low' | 'normal' | 'overstock') {
    return statusConfig[status];
}
