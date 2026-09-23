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
        <div className="hidden lg:flex lg:w-[65%] relative items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-background dark:from-primary/20 dark:via-primary/10 dark:to-background overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-30">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148, 163, 184) 1px, transparent 0)`,
                        backgroundSize: '32px 32px',
                    }}
                />
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
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />

            {/* Brand */}
            <div className="absolute top-8 left-8">
                <Link href="/" className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-foreground tracking-widest drop-shadow-lg">
                        MTMS
                    </span>
                </Link>
            </div>
        </div>
    );

    const formPanel = (
        <div className="w-full lg:w-[35%] flex flex-col justify-between p-6 sm:p-8 lg:p-12 min-h-screen overflow-y-auto bg-background dark:bg-background">
            <div className="flex-1 flex items-center justify-center w-full">
                <div className="w-full max-w-md">
                    {/* Mobile Brand */}
                    <div className="lg:hidden mb-8 text-center">
                        <Link href="/" className="inline-flex items-center gap-2">
                            <span className="text-2xl font-bold text-foreground tracking-widest">
                                MTMS
                            </span>
                        </Link>
                    </div>
                    {children}
                </div>
            </div>
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
