'use client';

import Header from './layout/header/Header';
import Sidebar from './layout/sidebar/Sidebar';

export default function Layout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex w-full min-h-screen">
            <div className="page-wrapper flex w-full">
                {/* Header/sidebar */}
                <div className="xl:block hidden">
                    <Sidebar />
                </div>
                <div className="body-wrapper w-full bg-background">
                    {/* Top Header  */}
                    <Header />
                    {/* Body Content  */}
                    <div className={`container mx-auto px-6 py-30`}>{children}</div>
                </div>
            </div>
            {/* vercel button */}
            <a
                href="https://vercel.com/new/clone?repository-url=https://github.com/Tailwind-Admin/free-tailwind-admin-dashboard-template&root-directory=tailwind-admin-nextjs-free/package"
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-5 py-2.5 bg-black text-white rounded-full shadow-2xl border border-border transition-all duration-200 hover:bg-black/90 hover:scale-105 active:scale-95"
            >
                <svg
                    viewBox="0 0 76 65"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 fill-white"
                >
                    <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                <span className="text-sm font-semibold tracking-tight">Deploy to Vercel</span>
            </a>
        </div>
    );
}
