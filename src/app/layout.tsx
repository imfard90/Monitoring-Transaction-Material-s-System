import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type React from 'react';
import './css/globals.css';
import ServiceWorkerRegister from '@/app/components/service-worker/ServiceWorkerRegister';
import { WebVitalsReporter } from '@/components/analytics/WebVitalsReporter';
import { Providers } from './providers';

const plusJakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-plus-jakarta',
});

export const metadata: Metadata = {
    title: {
        template: "%s | Monitoring Transaction Material's System",
        default: "Monitoring Transaction Material's System",
    },
    description:
        'Sistem manajemen terintegrasi untuk pemantauan transaksi material (MTMS) secara real-time, memberikan efisiensi operasional dan visibilitas akurat.',
    icons: {
        icon: '/favicon.svg',
        apple: '/icons/apple-touch-icon.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id" data-scroll-behavior="smooth" suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
                <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#5d87ff" />
            </head>
            <body className={`${plusJakarta.className} antialiased`}>
                <Providers>
                    <ServiceWorkerRegister />
                    <WebVitalsReporter />
                    {children}
                </Providers>
            </body>
        </html>
    );
}
