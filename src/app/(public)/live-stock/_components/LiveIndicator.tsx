'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface LiveIndicatorProps {
    dataUpdatedAt: number;
    intervalMs: number;
    className?: string;
}

const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

export function LiveIndicator({ dataUpdatedAt, intervalMs, className }: LiveIndicatorProps) {
    const [remaining, setRemaining] = useState(intervalMs);

    useEffect(() => {
        const tick = () => setRemaining(Math.max(0, intervalMs - (Date.now() - dataUpdatedAt)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [dataUpdatedAt, intervalMs]);

    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');

    return (
        <div
            className={cn(
                'inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1',
                className
            )}
        >
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-mono text-xs text-muted-foreground">
                Live · {formatTime(dataUpdatedAt)} · refresh {minutes}:{seconds}
            </span>
        </div>
    );
}
