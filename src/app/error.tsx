'use client';

import { Icon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
    error: Error & { digest?: string; code?: string; statusCode?: number };
    reset: () => void;
}

/**
 * Root error boundary untuk aplikasi MTMS.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
    const router = useRouter();

    const isAbortError =
        error.name === 'AbortError' ||
        error.code === 'ECONNRESET' ||
        error.digest === '511400414' ||
        error.message?.includes('aborted') ||
        error.digest?.includes('NEXT_REDIRECT');

    const isAuthError =
        !isAbortError &&
        (error.name === 'AuthenticationError' ||
            error.statusCode === 401 ||
            error.code === 'AUTHENTICATION_ERROR' ||
            error.message === 'Authentication required');

    useEffect(() => {
        if (isAbortError) {
            reset();
            return;
        }

        if (isAuthError) {
            window.location.replace('/auth/login?reason=expired');
        }
    }, [isAbortError, isAuthError, reset]);

    if (isAbortError) {
        return null;
    }

    if (isAuthError) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center p-4 bg-background">
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
                            Jika peramban Anda tidak beralih otomatis dalam beberapa detik, silakan
                            klik tombol di bawah.
                        </p>
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button
                            onClick={() => {
                                window.location.replace('/auth/login?reason=expired');
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
        <div className="flex min-h-screen w-full items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md border-destructive/20 shadow-lg text-center">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                        <Icon icon="solar:danger-triangle-bold-duotone" className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-xl">Terjadi Kesalahan Sistem</CardTitle>
                    <CardDescription>
                        {error.message || 'Terjadi gangguan saat memproses permintaan Anda.'}
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center gap-3">
                    <Button variant="outline" onClick={() => reset()} className="gap-2">
                        <Icon icon="solar:restart-bold" className="h-4 w-4" />
                        Coba Lagi
                    </Button>
                    <Button onClick={() => router.push('/')} className="gap-2">
                        <Icon icon="solar:home-2-bold" className="h-4 w-4" />
                        Ke Beranda
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
