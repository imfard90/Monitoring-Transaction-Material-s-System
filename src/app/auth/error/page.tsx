'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';

const getErrorMessage = (error: string | null): string => {
    switch (error) {
        case 'OAuthAccountNotLinked':
            return 'Email sudah terdaftar dengan metode login lain. Silahkan gunakan metode login yang sama.';
        case 'OAuthSignin':
        case 'OAuthCallback':
        case 'OAuthCreateAccount':
            return 'Terjadi kesalahan saat login dengan Google. Silahkan coba lagi.';
        case 'CredentialsSignin':
            return 'Email atau password salah. Silahkan coba lagi.';
        case 'AccessDenied':
            return 'Akses ditolak. Anda tidak memiliki izin untuk mengakses halaman ini.';
        case 'ACCOUNT_NOT_ACTIVE':
            return 'Akun Anda belum diaktivasi. Silahkan hubungi administrator.';
        default:
            if (error) {
                try {
                    return decodeURIComponent(error);
                } catch {
                    return error;
                }
            }
            return 'Terjadi kesalahan saat autentikasi. Silahkan coba lagi.';
    }
};

const AuthErrorContent = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    return (
        <AuthCard title="" className="w-full max-w-md">
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
                <div className="rounded-full bg-destructive/10 p-4">
                    <AlertTriangle className="size-8 text-destructive" />
                </div>
            </div>

            {/* Error Title */}
            <div className="text-center mb-4">
                <h1 className="text-xl font-semibold">Autentikasi Gagal</h1>
            </div>

            {/* Error Message */}
            <div className="text-center mb-6">
                <p className="text-muted-foreground text-sm">{getErrorMessage(error)}</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
                <Button className="w-full" onClick={() => router.push('/auth/login')}>
                    Kembali ke Login
                </Button>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/auth/register')}
                >
                    Daftar Akun Baru
                </Button>
            </div>
        </AuthCard>
    );
};

export default function AuthErrorPage() {
    return (
        <AuthLayout formPosition="right">
            <Suspense
                fallback={
                    <AuthCard title="Memuat..." className="w-full max-w-md">
                        <div className="animate-pulse space-y-4">
                            <div className="h-12 bg-muted rounded mx-auto w-12 rounded-full" />
                            <div className="h-6 bg-muted rounded w-1/2 mx-auto" />
                            <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                            <div className="h-10 bg-muted rounded" />
                            <div className="h-10 bg-muted rounded" />
                        </div>
                    </AuthCard>
                }
            >
                <AuthErrorContent />
            </Suspense>
        </AuthLayout>
    );
}
