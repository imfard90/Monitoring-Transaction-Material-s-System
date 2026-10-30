'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';
import { Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { useQuery } from '@tanstack/react-query';
import { getDashboardKpis } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { Card } from '@/components/ui/card';

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
        queryKey: ['dashboardKpis'],
        queryFn: async () => {
            const res = await getDashboardKpis();
            if (res.success && res.data) return res.data as TopCardsCarouselProps['kpis'];
            return initialKpis;
        },
        initialData: initialKpis,
        refetchInterval: 10000, // Poll every 10 seconds
    });

    const kpis = data || initialKpis;

    return (
        <div>
            <Swiper
                slidesPerView={6}
                spaceBetween={24}
                loop={true}
                freeMode={true}
                grabCursor={true}
                speed={5000}
                autoplay={{
                    delay: 0,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                }}
                modules={[Autoplay]}
                breakpoints={{
                    0: {
                        slidesPerView: 1,
                        spaceBetween: 10,
                    },
                    640: {
                        slidesPerView: 2,
                        spaceBetween: 14,
                    },
                    768: {
                        slidesPerView: 3,
                        spaceBetween: 16,
                    },
                    1030: {
                        slidesPerView: 4,
                        spaceBetween: 16,
                    },
                    1200: {
                        slidesPerView: 6,
                        spaceBetween: 20,
                    },
                }}
                className="mySwiper"
            >
                {kpiConfig.map((item) => {
                    const rawValue = kpis[item.key as KpiKey] ?? 0;
                    const { formatted, full } = formatKpiDisplay(item.key, rawValue);

                    return (
                        <SwiperSlide key={item.key} className="py-1">
                            <Link href={item.url} className="block group">
                                <Card
                                    className={`relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 motion-reduce:transition-none ${item.bgcolor} w-full border border-white/20 dark:border-white/5 py-3.5 px-4 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0`}
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
                                                {formatted}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        </SwiperSlide>
                    );
                })}
            </Swiper>
        </div>
    );
}
