import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import type React from 'react';
import './css/globals.css';
import ServiceWorkerRegister from '@/app/components/service-worker/ServiceWorkerRegister';
import { Providers } from './providers';

const dmSans = DM_Sans({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-dm-sans',
});

export const metadata: Metadata = {
    title: {
        template: "%s | Monitoring Transaction Material's System",
        default: "Monitoring Transaction Material's System",
    },
    description:
        'Sistem manajemen terintegrasi untuk pemantauan transaksi material (MTMS) secara real-time, memberikan efisiensi operasional dan visibilitas akurat.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#5d87ff" />
            </head>
            <body className={`${dmSans.className}`}>
                <Providers>
                    <ServiceWorkerRegister />
                    {children}
                </Providers>
            </body>
        </html>
    );
}
