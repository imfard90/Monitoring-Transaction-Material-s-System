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
        icon: 'solar:users-group-rounded-linear',
        bgcolor: 'bg-primary/10 dark:bg-primary/10',
        iconColor: 'text-primary',
        url: '#',
    },
    {
        key: 'requestTag',
        title: 'Request Tag',
        icon: 'solar:document-add-linear',
        bgcolor: 'bg-info/10 dark:bg-info/10',
        iconColor: 'text-info',
        url: '/apps/inout-tag',
    },
    {
        key: 'transitTag',
        title: 'Transit Tag',
        icon: 'solar:routing-2-linear',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/inout-tag',
    },
    {
        key: 'closeTag',
        title: 'Close Tag',
        icon: 'solar:check-read-linear',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/inout-tag',
    },
    {
        key: 'returnTek',
        title: 'Return Tek',
        icon: 'solar:refresh-circle-linear',
        bgcolor: 'bg-secondary/10 dark:bg-secondary/10',
        iconColor: 'text-secondary',
        url: '/apps/return-material',
    },
    {
        key: 'intechOpen',
        title: 'Intech Open',
        icon: 'solar:box-linear',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/out-sap',
    },
    {
        key: 'intechClose',
        title: 'Intech Close',
        icon: 'solar:check-circle-linear',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/out-sap',
    },
] as const;

type KpiKey = (typeof kpiConfig)[number]['key'];

export function TopCardsCarousel({ kpis: initialKpis }: TopCardsCarouselProps) {
    const { data } = useQuery({
        queryKey: ['dashboardKpis'],
        queryFn: async () => {
            const res = await getDashboardKpis();
            if (res.success && res.data) return res.data;
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
                    <SwiperSlide key={item.key}>
                        <Link href={item.url}>
                            <CardBox className={`shadow-none ${item.bgcolor} w-full border-none!`}>
                                <div className="flex items-center gap-3 hover:scale-105 transition-all ease-in-out">
                                    <div className={`rounded-full p-2.5 ${item.bgcolor}`}>
                                        <Icon
                                            icon={item.icon}
                                            width={28}
                                            height={28}
                                            className={item.iconColor}
                                        />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-medium">
                                            {item.title}
                                        </p>
                                        <h4 className={`text-xl font-bold ${item.iconColor}`}>
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
