'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * Error boundary untuk seluruh layout dashboard MTMS.
 * Menangani error runtime dan mengarahkan otomatis ke /auth/login jika sesi habis/invalid.
 */
export default function DashboardError({ error, reset }: ErrorProps) {
    const router = useRouter();

    const isAuthError =
        error.name === 'AuthenticationError' ||
        error.message?.toLowerCase().includes('authentication') ||
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('sesi') ||
        (typeof document !== 'undefined' &&
            !document.cookie.includes('better-auth.session_token') &&
            !document.cookie.includes('__Secure-better-auth.session_token'));

    useEffect(() => {
        if (isAuthError) {
            // Sesi invalid atau habis, arahkan otomatis ke login
            window.location.replace('/auth/login');
        }
    }, [isAuthError]);

    if (isAuthError) {
        return (
            <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
                <Card className="w-full max-w-md border-primary/20 shadow-lg text-center">
                    <CardHeader>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                            <Icon icon="solar:shield-warning-bold-duotone" className="h-6 w-6" />
                        </div>
                        <CardTitle className="text-xl">Sesi Anda Telah Berakhir</CardTitle>
                        <CardDescription>
                            Mengarahkan Anda kembali ke halaman login...
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Jika peramban Anda tidak beralih otomatis dalam beberapa detik, silakan klik tombol di bawah.
                        </p>
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button
                            onClick={() => {
                                window.location.replace('/auth/login');
                            }}
                            className="gap-2"
                        >
                            <Icon icon="solar:login-2-bold" className="h-4 w-4" />
                            Masuk Kembali
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
            <Card className="w-full max-w-md border-destructive/20 shadow-lg text-center">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                        <Icon icon="solar:danger-triangle-bold-duotone" className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-xl">Terjadi Kesalahan</CardTitle>
                    <CardDescription>
                        {error.message || 'Terjadi gangguan tak terduga saat memuat data.'}
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center gap-3">
                    <Button variant="outline" onClick={() => reset()} className="gap-2">
                        <Icon icon="solar:restart-bold" className="h-4 w-4" />
                        Coba Lagi
                    </Button>
                    <Button onClick={() => router.push('/')} className="gap-2">
                        <Icon icon="solar:home-2-bold" className="h-4 w-4" />
                        Kembali ke Dashboard
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
