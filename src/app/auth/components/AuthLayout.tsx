'use client';

import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import { useEffect, useState } from 'react';

interface AuthLayoutProps {
    children: React.ReactNode;
    formPosition?: 'left' | 'right';
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, formPosition = 'right' }) => {
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

    useEffect(() => {
        setCurrentYear(new Date().getFullYear());
    }, []);

    const illustrationPanel = (
        <div className="hidden lg:flex lg:w-[65%] relative items-center justify-center bg-linear-to-br from-primary/10 via-primary/5 to-background dark:from-primary/20 dark:via-primary/10 dark:to-background overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(148,163,184)_1px,transparent_0)] bg-[size:32px_32px]" />
            </div>

            {/* Background illustration */}
            <div className="relative w-full h-full flex items-center justify-center">
                <Image
                    src="/images/backgrounds/background.webp"
                    alt="Background illustration"
                    fill
                    className="object-contain"
                    priority
                />
            </div>

            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-transparent to-transparent" />

            {/* Brand */}
            <div className="absolute top-8 left-8 flex flex-col gap-1 z-10">
                <Link href="/" className="flex items-center gap-2.5">
                    <span className="text-3xl font-black text-foreground tracking-widest drop-shadow-sm">
                        MTMS
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Enterprise
                    </span>
                </Link>
                <p className="text-xs text-muted-foreground font-medium">
                    Monitoring Transaction Material's System
                </p>
            </div>

            {/* Feature Value Props Pills */}
            <div className="absolute bottom-8 left-8 right-8 flex flex-wrap gap-2.5 z-10">
                <div className="px-3 py-1.5 rounded-lg bg-background/75 backdrop-blur-md border border-border/60 text-xs font-medium text-foreground shadow-xs">
                    🛡️ Proteksi Cloudflare WAF
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-background/75 backdrop-blur-md border border-border/60 text-xs font-medium text-foreground shadow-xs">
                    ⚡ Rekonsiliasi Otomatis
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-background/75 backdrop-blur-md border border-border/60 text-xs font-medium text-foreground shadow-xs">
                    🔒 Akses Terotentikasi & Tervalidasi
                </div>
            </div>
        </div>
    );

    const formPanel = (
        <div className="w-full lg:w-[35%] flex flex-col justify-between p-6 sm:p-8 lg:p-12 min-h-screen overflow-y-auto bg-background">
            <main className="flex-1 flex items-center justify-center w-full">
                <div className="w-full max-w-md">
                    {/* Mobile Brand */}
                    <div className="lg:hidden mb-8 text-center">
                        <Link href="/" className="inline-flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-foreground tracking-widest">
                                    MTMS
                                </span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                                    Enterprise
                                </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">
                                Monitoring Transaction Material's System
                            </span>
                        </Link>
                    </div>
                    {children}
                </div>
            </main>
            <footer className="mt-8 text-center text-sm text-muted-foreground">
                {`© ${currentYear} Monitoring Transaction Material's System. All rights reserved.`}
            </footer>
        </div>
    );

    return (
        <div className="min-h-screen flex">
            {formPosition === 'left' ? (
                <>
                    {formPanel}
                    {illustrationPanel}
                </>
            ) : (
                <>
                    {illustrationPanel}
                    {formPanel}
                </>
            )}
        </div>
    );
};

export default AuthLayout;
