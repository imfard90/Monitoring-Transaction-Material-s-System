'use client';

import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
import Image from 'next/image';
import Header from './layout/header/Header';
import Sidebar from './layout/sidebar/Sidebar';

export default function Layout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex w-full h-[100dvh] overflow-hidden">
            <PresenceHeartbeat />
            {/* Premium UI/UX: skip-to-content link for keyboard & screen-reader users (SKILL §2.3). */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
            >
                Lewati ke konten utama
            </a>
            <div className="page-wrapper flex w-full">
                {/* Header/sidebar */}
                <div className="xl:block hidden">
                    <Sidebar />
                </div>
                <div className="body-wrapper relative w-full bg-background flex flex-col h-[100dvh] overflow-hidden">
                    {/* Fixed watermark background */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
                    >
                        <Image
                            src="/images/backgrounds/branch_lamongan.png"
                            alt=""
                            fill
                            priority
                            sizes="(max-width: 1280px) 100vw, calc(100vw - 270px)"
                            className="object-cover object-center opacity-[0.035] dark:opacity-[0.05] transition-opacity duration-300"
                        />
                    </div>

                    {/* Top Header */}
                    <Header />
                    {/* Body Content */}
                    <main
                        id="main-content"
                        className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex-1 flex flex-col overflow-y-auto min-w-0 relative z-[1]"
                    >
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
