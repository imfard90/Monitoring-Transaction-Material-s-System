'use client';

import Header from './layout/header/Header';
import Sidebar from './layout/sidebar/Sidebar';

export default function Layout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex w-full h-screen overflow-hidden">
            <div className="page-wrapper flex w-full">
                {/* Header/sidebar */}
                <div className="xl:block hidden">
                    <Sidebar />
                </div>
                <div className="body-wrapper w-full bg-background flex flex-col h-screen overflow-hidden">
                    {/* Top Header  */}
                    <Header />
                    {/* Body Content  */}
                    <div className="container mx-auto px-6 py-6 flex-1 flex flex-col overflow-y-auto">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
