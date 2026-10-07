'use client';

import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
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
            <div className="page-wrapper flex w-full">
                {/* Header/sidebar */}
                <div className="xl:block hidden">
                    <Sidebar />
                </div>
                <div className="body-wrapper w-full bg-background flex flex-col h-[100dvh] overflow-hidden">
                    {/* Top Header  */}
                    <Header />
                    {/* Body Content  */}
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex-1 flex flex-col overflow-y-auto min-w-0">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
