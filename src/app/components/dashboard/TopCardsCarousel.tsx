'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDashboardKpis } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { Card } from '@/components/ui/card';
import {
    Carousel,
    type CarouselApi,
    CarouselContent,
    CarouselItem,
} from '@/components/ui/carousel';
import { useNumberCounter } from '@/hooks/use-number-counter';
import { queryKeys } from '@/lib/query-keys';

interface TopCardsCarouselProps {
    kpis: {
        onlineUsers: number;
        requestTag: number;
        transitTag: number;
        closeTag: number;
        returnTek: number;
        intechOpen: number;
        intechClose: number;
        stockInventoryRp?: number;
        stockIntechRp?: number;
    };
}

const kpiConfig = [
    {
        key: 'onlineUsers',
        title: 'Pengguna Online',
        icon: 'solar:users-group-rounded-bold-duotone',
        bgcolor: 'bg-primary/10 dark:bg-primary/10',
        iconColor: 'text-primary',
        url: '#',
    },
    {
        key: 'stockInventoryRp',
        title: 'Stock Inventory',
        icon: 'solar:box-minimalistic-bold-duotone',
        bgcolor: 'bg-primary/10 dark:bg-primary/10',
        iconColor: 'text-primary',
        url: '/stock-inventory',
    },
    {
        key: 'stockIntechRp',
        title: 'Stock Intech',
        icon: 'solar:hand-money-bold-duotone',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/stock-intech',
    },
    {
        key: 'requestTag',
        title: 'Permintaan Tag',
        icon: 'solar:document-add-bold-duotone',
        bgcolor: 'bg-info/10 dark:bg-info/10',
        iconColor: 'text-info',
        url: '/apps/inout-tag',
    },
    {
        key: 'transitTag',
        title: 'Tag Transit',
        icon: 'solar:routing-2-bold-duotone',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/inout-tag',
    },
    {
        key: 'closeTag',
        title: 'Tag Selesai',
        icon: 'solar:check-read-bold-duotone',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/inout-tag',
    },
    {
        key: 'returnTek',
        title: 'Retur Teknisi',
        icon: 'solar:refresh-circle-bold-duotone',
        bgcolor: 'bg-secondary/10 dark:bg-secondary/10',
        iconColor: 'text-secondary',
        url: '/form/return-material',
    },
    {
        key: 'intechOpen',
        title: 'Intech Terbuka',
        icon: 'solar:box-bold-duotone',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/form/out-sap',
    },
    {
        key: 'intechClose',
        title: 'Intech Selesai',
        icon: 'solar:check-circle-bold-duotone',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/form/out-sap',
    },
] as const;

type KpiKey = (typeof kpiConfig)[number]['key'];

function formatKpiDisplay(key: string, value: number): { formatted: string; full: string } {
    if (key === 'stockInventoryRp' || key === 'stockIntechRp') {
        const full = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        }).format(value || 0);

        if (value >= 1_000_000_000) {
            return {
                formatted: `Rp ${(value / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} M`,
                full,
            };
        }
        if (value >= 1_000_000) {
            return {
                formatted: `Rp ${(value / 1_000_000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Jt`,
                full,
            };
        }
        if (value >= 1_000) {
            return {
                formatted: `Rp ${(value / 1_000).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} Rb`,
                full,
            };
        }
        return { formatted: full, full };
    }

    const val = value ?? 0;
    return {
        formatted: val.toLocaleString('id-ID'),
        full: val.toLocaleString('id-ID'),
    };
}

export function TopCardsCarousel({ kpis: initialKpis }: TopCardsCarouselProps) {
    const { data } = useQuery<TopCardsCarouselProps['kpis']>({
        queryKey: queryKeys.dashboard.kpi(),
        queryFn: async () => {
            const res = await getDashboardKpis();
            if (res.success && res.data) return res.data as TopCardsCarouselProps['kpis'];
            return initialKpis;
        },
        initialData: initialKpis,
        staleTime: 30000,
        refetchInterval: 60000, // Poll every 60 seconds (aligned with 60s Redis TTL)
        refetchOnWindowFocus: false,
    });

    const kpis = data || initialKpis;

    // Create counters at top level (Rules of Hooks)
    const counters = {
        onlineUsers: useNumberCounter(kpis.onlineUsers, (n) =>
            Math.floor(n).toLocaleString('id-ID')
        ),
        stockInventoryRp: useNumberCounter(kpis.stockInventoryRp ?? 0, (n) => {
            const { formatted } = formatKpiDisplay('stockInventoryRp', Math.floor(n));
            return formatted;
        }),
        stockIntechRp: useNumberCounter(kpis.stockIntechRp ?? 0, (n) => {
            const { formatted } = formatKpiDisplay('stockIntechRp', Math.floor(n));
            return formatted;
        }),
        requestTag: useNumberCounter(kpis.requestTag, (n) => Math.floor(n).toLocaleString('id-ID')),
        transitTag: useNumberCounter(kpis.transitTag, (n) => Math.floor(n).toLocaleString('id-ID')),
        closeTag: useNumberCounter(kpis.closeTag, (n) => Math.floor(n).toLocaleString('id-ID')),
        returnTek: useNumberCounter(kpis.returnTek, (n) => Math.floor(n).toLocaleString('id-ID')),
        intechOpen: useNumberCounter(kpis.intechOpen, (n) => Math.floor(n).toLocaleString('id-ID')),
        intechClose: useNumberCounter(kpis.intechClose, (n) =>
            Math.floor(n).toLocaleString('id-ID')
        ),
    };

    const [api, setApi] = useState<CarouselApi>();
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (!api || isHovered) return;
        const prefersReducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const timer = setInterval(() => {
            api.scrollNext();
        }, 4000);

        return () => clearInterval(timer);
    }, [api, isHovered]);

    return (
        <section
            aria-label="Ringkasan KPI"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="w-full"
        >
            <Carousel
                opts={{
                    loop: true,
                    align: 'start',
                }}
                setApi={setApi}
                className="w-full"
            >
                <CarouselContent className="-ml-3">
                    {kpiConfig.map((item) => {
                        const rawValue = kpis[item.key as KpiKey] ?? 0;
                        const { full } = formatKpiDisplay(item.key, rawValue);
                        const { AnimatedNumber } = counters[item.key as KpiKey];

                        return (
                            <CarouselItem
                                key={item.key}
                                className="pl-3 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/6 py-1"
                            >
                                <Link href={item.url} className="block group">
                                    <Card
                                        className={`relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 motion-reduce:transition-none ${item.bgcolor} w-full border border-white/20 dark:border-white/5 py-3.5 px-4 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0`}
                                    >
                                        {/* Decorative gradient blob */}
                                        <div
                                            className="absolute -right-6 -top-6 w-20 h-20 bg-white/20 dark:bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 motion-reduce:transition-none"
                                            aria-hidden="true"
                                        />

                                        <div className="relative z-10 flex items-center gap-3 min-w-0">
                                            <div
                                                className={`rounded-xl p-2.5 shrink-0 bg-white/60 dark:bg-black/25 backdrop-blur-sm shadow-xs border border-white/40 dark:border-white/10 group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none`}
                                            >
                                                <Icon
                                                    icon={item.icon}
                                                    width={24}
                                                    height={24}
                                                    className={item.iconColor}
                                                />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <p className="text-xs text-muted-foreground font-medium mb-0.5 truncate">
                                                    {item.title}
                                                </p>
                                                <p
                                                    title={full}
                                                    className={`text-lg sm:text-xl font-bold tracking-tight tabular-nums truncate ${item.iconColor}`}
                                                >
                                                    <AnimatedNumber />
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            </CarouselItem>
                        );
                    })}
                </CarouselContent>
            </Carousel>
        </section>
    );
}
