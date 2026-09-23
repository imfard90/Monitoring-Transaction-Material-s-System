'use client';

import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [isValidating, setIsValidating] = useState(true);
    const [isValidToken, setIsValidToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        const validateToken = async () => {
            if (!token) {
                setIsValidToken(false);
                setTokenError('Token tidak ditemukan atau sudah kedaluwarsa');
                setIsValidating(false);
                return;
            }
            // TODO: validate token via Better Auth
            // const result = await authClient.verifyEmail({ query: { token } });
            await new Promise((res) => setTimeout(res, 500));
            setIsValidToken(true);
            setIsValidating(false);
        };
        validateToken();
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (newPassword.length < 8) {
            setFormError('Password minimal 8 karakter');
            return;
        }
        if (newPassword !== confirmPassword) {
            setFormError('Password tidak cocok');
            return;
        }

        setIsLoading(true);
        try {
            const result = await authClient.resetPassword({
                newPassword,
                token: token || undefined,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Gagal mereset password');
            }
            setIsSuccess(true);
            toast.success('Password berhasil direset');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
            setFormError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isValidating) {
        return (
            <AuthLayout>
                <AuthCard title="Reset Password" description="Memvalidasi token...">
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="size-8 animate-spin text-primary" />
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    if (!isValidToken) {
        return (
            <AuthLayout>
                <AuthCard
                    title="Token Tidak Valid"
                    description={tokenError ?? 'Token sudah kedaluwarsa'}
                >
                    <div className="space-y-3">
                        <Link href="/auth/forgot-password">
                            <Button className="w-full">Minta Link Baru</Button>
                        </Link>
                        <Link href="/auth/login">
                            <Button variant="outline" className="w-full">
                                Kembali ke Login
                            </Button>
                        </Link>
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    if (isSuccess) {
        return (
            <AuthLayout>
                <AuthCard
                    title="Password Berhasil Direset"
                    description="Silahkan login dengan password baru Anda"
                >
                    <Link href="/auth/login">
                        <Button className="w-full">Masuk Sekarang</Button>
                    </Link>
                </AuthCard>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout formPosition="right">
            <AuthCard title="Reset Password" description="Masukkan password baru Anda">
                {formError && (
                    <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                        {formError}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <Label htmlFor="new-password" className="font-medium">
                            Password Baru
                        </Label>
                        <div className="relative mt-1">
                            <Input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Min. 8 karakter"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={isLoading}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <Label htmlFor="confirm-password" className="font-medium">
                            Konfirmasi Password
                        </Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            placeholder="Ulangi password baru"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={isLoading}
                            className="mt-1"
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Menyimpan...
                            </>
                        ) : (
                            'Reset Password'
                        )}
                    </Button>
                </form>

                <div className="flex justify-center mt-6">
                    <Link
                        href="/auth/login"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Kembali ke Login
                    </Link>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <AuthLayout>
                    <AuthCard title="Reset Password" description="Loading...">
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="size-8 animate-spin text-primary" />
                        </div>
                    </AuthCard>
                </AuthLayout>
            }
        >
            <ResetPasswordForm />
        </Suspense>
    );
}
