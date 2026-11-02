'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
    getPendingNotifications,
    type NotificationPayload,
    type UrgentNotificationItem,
} from '../../_actions/notification-actions';

function formatNotificationTime(time?: string | Date | null): string {
    if (!time) return '-';
    try {
        const d = new Date(time);
        if (Number.isNaN(d.getTime())) return String(time);
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d);
    } catch {
        return '-';
    }
}

export default function NotificationBell() {
    const [open, setOpen] = useState(false);

    const { data, isFetching, refetch } = useQuery<NotificationPayload | undefined>({
        queryKey: queryKeys.notifications.pending(),
        queryFn: async () => {
            const res = await getPendingNotifications();
            if (!res.success) throw new Error(res.error || 'Gagal memuat notifikasi');
            return res.data;
        },
        staleTime: 30000,
        refetchInterval: 60000, // Polling setiap 60 detik
    });

    const total = data?.total ?? 0;
    const categories = data?.categories ?? [];
    const urgentItems = data?.urgentItems ?? [];

    const handleItemClick = () => {
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={
                        total > 0
                            ? `Notifikasi tanggungan transaksi (${total} tanggungan)`
                            : 'Notifikasi tanggungan transaksi'
                    }
                    className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-all duration-200 hover:bg-muted/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    {total > 0 ? (
                        <>
                            <Icon
                                icon="solar:bell-bing-bold-duotone"
                                width="22"
                                className="text-primary transition-transform duration-200 hover:scale-110"
                            />
                            {/* Ping animation indicator */}
                            <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                            </span>
                            {/* Numerical badge */}
                            <span className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                                {total > 99 ? '99+' : total}
                            </span>
                        </>
                    ) : (
                        <Icon
                            icon="solar:bell-linear"
                            width="22"
                            className="text-foreground/70 transition-transform duration-200 hover:scale-110 hover:text-primary"
                        />
                    )}
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[360px] sm:w-[420px] rounded-2xl border-border bg-popover/95 p-0 shadow-2xl backdrop-blur-md overflow-hidden text-popover-foreground"
            >
                {/* Popover Header */}
                <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-muted/30">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon icon="solar:bell-bold-duotone" width="18" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold tracking-tight text-foreground">
                                Tanggungan Transaksi
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                                {total > 0
                                    ? `${total} transaksi memerlukan tindakan`
                                    : 'Tidak ada transaksi tertunda'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={() => refetch()}
                            title="Segarkan notifikasi"
                            aria-label="Segarkan notifikasi"
                            disabled={isFetching}
                        >
                            <Icon
                                icon="solar:restart-bold"
                                width="16"
                                className={cn(
                                    'transition-transform duration-500',
                                    isFetching && 'animate-spin'
                                )}
                            />
                        </Button>
                    </div>
                </div>

                {/* 4 Category Quick Cards Grid */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/15 border-b border-border/60">
                    {categories.map((cat) => {
                        const hasItems = cat.count > 0;
                        return (
                            <Link
                                key={cat.id}
                                href={cat.href}
                                onClick={handleItemClick}
                                className={cn(
                                    'group flex flex-col justify-between rounded-xl border p-2.5 transition-all duration-200',
                                    hasItems
                                        ? 'border-border/80 bg-card hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs cursor-pointer'
                                        : 'border-border/40 bg-muted/20 opacity-70 hover:opacity-100'
                                )}
                            >
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                    <div
                                        className={cn(
                                            'flex h-7 w-7 items-center justify-center rounded-lg bg-muted',
                                            cat.color
                                        )}
                                    >
                                        <Icon icon={cat.icon} width="16" />
                                    </div>
                                    <Badge
                                        variant={cat.badgeVariant}
                                        className={cn(
                                            'text-[10px] px-1.5 py-0 h-4 font-bold',
                                            !hasItems &&
                                                'bg-muted text-muted-foreground border-transparent'
                                        )}
                                    >
                                        {cat.count}
                                    </Badge>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors block truncate">
                                        {cat.title}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground block truncate">
                                        {cat.badgeLabel}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Urgent Items Feed Section */}
                <div className="max-h-[260px] overflow-y-auto">
                    {urgentItems.length > 0 ? (
                        <div>
                            <div className="px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase bg-muted/20">
                                Transaksi Mendesak Terbaru
                            </div>
                            <div className="divide-y divide-border/50">
                                {urgentItems.map((item: UrgentNotificationItem) => (
                                    <Link
                                        key={item.id}
                                        href={item.href}
                                        onClick={handleItemClick}
                                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-xs font-semibold font-mono text-primary truncate group-hover:underline">
                                                    {item.title}
                                                </span>
                                                <Badge
                                                    variant={item.statusVariant}
                                                    className="text-[10px] px-1.5 py-0 shrink-0 font-medium"
                                                >
                                                    {item.statusText}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground truncate leading-snug">
                                                {item.subtitle}
                                            </p>
                                            <span className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 block">
                                                {formatNotificationTime(item.time)}
                                            </span>
                                        </div>
                                        <Icon
                                            icon="solar:alt-arrow-right-linear"
                                            width="16"
                                            className="text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                                        />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-2.5">
                                <Icon icon="solar:check-circle-bold-duotone" width="28" />
                            </div>
                            <h5 className="text-xs font-semibold text-foreground">
                                Semua Tanggungan Selesai
                            </h5>
                            <p className="text-[11px] text-muted-foreground mt-1 max-w-[280px]">
                                Tidak ada transaksi Inout Tag, Retur, Out SAP, atau Rekon Lensa yang
                                tertunda.
                            </p>
                        </div>
                    )}
                </div>

                {/* Popover Footer */}
                <div className="flex items-center justify-between border-t border-border/80 px-4 py-2.5 bg-muted/20 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-mono text-[10px]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Auto-refresh 60s
                    </span>
                    <span className="text-[11px] text-muted-foreground">Klik untuk membuka</span>
                </div>
            </PopoverContent>
        </Popover>
    );
}
