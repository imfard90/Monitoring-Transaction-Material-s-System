'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';
import { Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { useQuery } from '@tanstack/react-query';
import { getDashboardKpis } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import CardBox from '../shared/CardBox';

interface TopCardsCarouselProps {
    kpis: {
        onlineUsers: number;
        requestTag: number;
        transitTag: number;
        closeTag: number;
        returnTek: number;
        intechOpen: number;
        intechClose: number;
    };
}

const kpiConfig = [
    {
        key: 'onlineUsers',
        title: 'Online Users',
        icon: 'solar:users-group-rounded-bold-duotone',
        bgcolor: 'bg-primary/10 dark:bg-primary/10',
        iconColor: 'text-primary',
        url: '#',
    },
    {
        key: 'requestTag',
        title: 'Request Tag',
        icon: 'solar:document-add-bold-duotone',
        bgcolor: 'bg-info/10 dark:bg-info/10',
        iconColor: 'text-info',
        url: '/apps/inout-tag',
    },
    {
        key: 'transitTag',
        title: 'Transit Tag',
        icon: 'solar:routing-2-bold-duotone',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/inout-tag',
    },
    {
        key: 'closeTag',
        title: 'Close Tag',
        icon: 'solar:check-read-bold-duotone',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/inout-tag',
    },
    {
        key: 'returnTek',
        title: 'Return Tek',
        icon: 'solar:refresh-circle-bold-duotone',
        bgcolor: 'bg-secondary/10 dark:bg-secondary/10',
        iconColor: 'text-secondary',
        url: '/apps/return-material',
    },
    {
        key: 'intechOpen',
        title: 'Intech Open',
        icon: 'solar:box-bold-duotone',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/out-sap',
    },
    {
        key: 'intechClose',
        title: 'Intech Close',
        icon: 'solar:check-circle-bold-duotone',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/out-sap',
    },
] as const;

type KpiKey = (typeof kpiConfig)[number]['key'];

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
                        spaceBetween: 18,
                    },
                    1030: {
                        slidesPerView: 4,
                        spaceBetween: 18,
                    },
                    1200: {
                        slidesPerView: 6,
                        spaceBetween: 24,
                    },
                }}
                className="mySwiper"
            >
                {kpiConfig.map((item) => (
                    <SwiperSlide key={item.key} className="py-2">
                        <Link href={item.url} className="block group">
                            <CardBox
                                className={`relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${item.bgcolor} w-full border border-white/20 dark:border-white/5 py-6 group-hover:-translate-y-1`}
                            >
                                {/* Decorative gradient blob */}
                                <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/20 dark:bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />

                                <div className="relative z-10 flex items-center gap-4">
                                    <div
                                        className={`rounded-2xl p-3 bg-white/50 dark:bg-black/20 backdrop-blur-sm shadow-sm border border-white/40 dark:border-white/10 group-hover:scale-110 transition-transform duration-300`}
                                    >
                                        <Icon
                                            icon={item.icon}
                                            width={32}
                                            height={32}
                                            className={item.iconColor}
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="text-sm text-muted-foreground font-medium mb-0.5">
                                            {item.title}
                                        </p>
                                        <h4
                                            className={`text-2xl font-bold tracking-tight ${item.iconColor}`}
                                        >
                                            {kpis[item.key as KpiKey]?.toLocaleString() ?? 0}
                                        </h4>
                                    </div>
                                </div>
                            </CardBox>
                        </Link>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
}
