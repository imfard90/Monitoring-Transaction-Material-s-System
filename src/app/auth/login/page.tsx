'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import TurnstileWidget from '@/app/auth/components/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FloatingInput } from '@/components/ui/floating-input';
import { Label } from '@/components/ui/label';
import { ModalDialog } from '@/components/ui/modal-dialog';

import { authClient } from '@/lib/auth-client';

const LoginSchema = z.object({
    email: z.string().min(1, 'Email wajib diisi').email('Email tidak valid'),
    password: z.string().min(1, 'Password wajib diisi'),
    remember: z.boolean(),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

const LoginForm = () => {
    const _router = useRouter();
    const searchParams = useSearchParams();
    const [showPassword, setShowPassword] = useState(false);
    const [errorMsg, setErrorMsg] = useState<{ type: 'error' | 'warning'; text: string } | null>(
        null
    );
    const [pendingLogin, setPendingLogin] = useState<LoginFormValues | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileError, setTurnstileError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(LoginSchema),
        defaultValues: { email: '', password: '', remember: false },
    });

    const remember = watch('remember');

    useEffect(() => {
        if (searchParams.get('reason') === 'idle') {
            toast.info('Anda telah logout otomatis setelah 1 jam tanpa aktivitas.');
        }
    }, [searchParams]);

    const handleTurnstileToken = useCallback((token: string) => {
        setTurnstileToken(token);
        setTurnstileError(null);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken('');
    }, []);

    const handleTurnstileError = useCallback((code: string) => {
        setTurnstileToken('');
        setTurnstileError(
            'Verifikasi keamanan gagal dimuat. Silakan muat ulang halaman untuk mencoba lagi.'
        );
        // `code` is intentionally not surfaced to end-users to avoid leaking
        // internal Cloudflare error families.
        if (process.env.NODE_ENV !== 'production') {
            // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
            console.warn('[Turnstile] widget error', code);
        }
    }, []);

    const onSubmit = async (data: LoginFormValues) => {
        setErrorMsg(null);

        // 0. Cloudflare Turnstile — server-side validation.
        //    Fail-closed: missing token or failed verification blocks login.
        if (!turnstileToken) {
            setErrorMsg({
                type: 'error',
                text: 'Mohon selesaikan verifikasi keamanan (CAPTCHA) terlebih dahulu.',
            });
            return;
        }

        try {
            // 1. Lakukan pre-check terlebih dahulu
            const { precheckLogin } = await import('./_actions/login-actions');
            const precheck = await precheckLogin(data.email, turnstileToken);

            if (precheck.status === 'turnstile_failed') {
                setErrorMsg({
                    type: 'error',
                    text: 'Verifikasi keamanan gagal. Silakan coba lagi.',
                });
                setTurnstileToken('');
                const resetFn = (window as unknown as { __turnstileReset?: () => void })
                    .__turnstileReset;
                resetFn?.();
                return;
            }
            if (precheck.status === 'not_found') {
                setErrorMsg({ type: 'error', text: 'User tidak terdaftar' });
                return;
            }
            if (precheck.status === 'inactive') {
                setErrorMsg({ type: 'warning', text: 'User belum aktif / diblokir' });
                return;
            }

            if (precheck.status === 'active_session_exists') {
                setPendingLogin(data);
                return;
            }

            // 2. Lanjut ke otentikasi Better Auth
            const result = await authClient.signIn.email({
                email: data.email,
                password: data.password,
                rememberMe: data.remember,
                fetchOptions: { headers: { 'x-captcha-response': turnstileToken } },
            });

            if (result.error) {
                if (result.error.code === 'EMAIL_NOT_VERIFIED') {
                    setErrorMsg({
                        type: 'warning',
                        text: 'Email Anda belum diverifikasi. Silakan periksa inbox email Anda untuk memverifikasi akun.',
                    });
                } else {
                    setErrorMsg({
                        type: 'error',
                        text: result.error.message || 'Username dan password salah',
                    });
                }
                return;
            }

            toast.success('Berhasil masuk');
            window.location.href = '/';
        } catch (_err) {
            setErrorMsg({ type: 'error', text: 'Terjadi kesalahan sistem, silakan coba lagi' });
        }
    };

    const handleRevokeAndLogin = async () => {
        if (!pendingLogin) return;
        setIsRevoking(true);
        setErrorMsg(null);

        try {
            const { revokeAllUserSessions } = await import('./_actions/login-actions');
            await revokeAllUserSessions(pendingLogin.email);

            const token =
                (window as Window & { __mtmsTurnstileToken?: string }).__mtmsTurnstileToken ||
                turnstileToken;
            if (!token) {
                setErrorMsg({
                    type: 'error',
                    text: 'Silakan selesaikan verifikasi CAPTCHA kembali.',
                });
                return;
            }

            const result = await authClient.signIn.email({
                email: pendingLogin.email,
                password: pendingLogin.password,
                rememberMe: pendingLogin.remember,
                fetchOptions: { headers: { 'x-captcha-response': token } },
            });

            if (result.error) {
                if (result.error.code === 'EMAIL_NOT_VERIFIED') {
                    setErrorMsg({
                        type: 'warning',
                        text: 'Email Anda belum diverifikasi. Silakan periksa inbox email Anda untuk memverifikasi akun.',
                    });
                } else {
                    setErrorMsg({
                        type: 'error',
                        text: result.error.message || 'Username dan password salah',
                    });
                }
                return;
            }

            toast.success('Sesi lama telah diputuskan. Berhasil masuk');
            window.location.href = '/';
        } catch (_err) {
            setErrorMsg({ type: 'error', text: 'Gagal memutuskan sesi lama' });
        } finally {
            setIsRevoking(false);
            setPendingLogin(null);
        }
    };

    return (
        <AuthLayout formPosition="right">
            <AuthCard title="Masuk" description="Selamat datang kembali di MTMS">
                {errorMsg && (
                    <div
                        className={`mb-4 p-3 text-sm rounded-lg border ${
                            errorMsg.type === 'error'
                                ? 'text-destructive bg-destructive/10 border-destructive/20'
                                : 'text-warning bg-warning/10 border-warning/20 dark:text-warning dark:bg-warning/10 dark:border-warning/30'
                        }`}
                    >
                        {errorMsg.text}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                    <div>
                        <FloatingInput
                            id="email"
                            type="email"
                            label="Alamat Email"
                            {...register('email')}
                            disabled={isSubmitting}
                            error={errors.email?.message}
                            startIcon={<Mail className="size-4" />}
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <FloatingInput
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            label="Kata Sandi"
                            {...register('password')}
                            disabled={isSubmitting}
                            error={errors.password?.message}
                            startIcon={<Lock className="size-4" />}
                            autoComplete="current-password"
                            endIcon={
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={
                                        showPassword ? 'Sembunyikan password' : 'Tampilkan password'
                                    }
                                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                                >
                                    {showPassword ? (
                                        <EyeOff className="size-4" />
                                    ) : (
                                        <Eye className="size-4" />
                                    )}
                                </button>
                            }
                        />
                    </div>

                    <div className="flex flex-wrap gap-4 items-center justify-between pt-1 pb-1">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="remember"
                                aria-label="Ingat perangkat ini"
                                checked={remember}
                                onCheckedChange={(checked) =>
                                    setValue('remember', checked as boolean)
                                }
                            />
                            <Label
                                className="font-normal text-sm cursor-pointer select-none"
                                htmlFor="remember"
                            >
                                Ingat perangkat ini
                            </Label>
                        </div>
                        <Link
                            href="/auth/forgot-password"
                            className="text-sm font-semibold text-primary hover:underline hover:text-primary/90 transition-colors"
                        >
                            Lupa Password?
                        </Link>
                    </div>

                    <TurnstileWidget
                        onToken={handleTurnstileToken}
                        onExpire={handleTurnstileExpire}
                        onError={handleTurnstileError}
                        action="login"
                        className="my-3"
                    />

                    <Button
                        type="submit"
                        className="w-full h-12 text-sm sm:text-base font-semibold tracking-wide rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
                        disabled={isSubmitting || !turnstileToken || !!turnstileError}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Memverifikasi & Masuk...
                            </>
                        ) : (
                            'Masuk ke Sistem MTMS'
                        )}
                    </Button>
                </form>

                <div className="flex items-center gap-2 justify-center mt-6 flex-wrap">
                    <p className="text-sm text-muted-foreground">Belum punya akun?</p>
                    <Link
                        href="/auth/register"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Daftar Sekarang
                    </Link>
                </div>
            </AuthCard>

            <ModalDialog
                isOpen={!!pendingLogin}
                onClose={() => setPendingLogin(null)}
                title="Sesi Aktif Ditemukan"
            >
                <p className="text-sm text-muted-foreground">
                    Akun Anda terdeteksi masih login di perangkat atau browser lain. Apakah Anda
                    ingin memutuskan sesi tersebut dan login di sini?
                </p>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                    <Button
                        variant="outline"
                        onClick={() => setPendingLogin(null)}
                        disabled={isRevoking}
                    >
                        Batal
                    </Button>
                    <Button onClick={handleRevokeAndLogin} disabled={isRevoking}>
                        {isRevoking ? (
                            <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Memproses...
                            </>
                        ) : (
                            'Ya, Putuskan Sesi'
                        )}
                    </Button>
                </div>
            </ModalDialog>
        </AuthLayout>
    );
};

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <AuthLayout>
                    <AuthCard title="Masuk" description="Memuat data...">
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="size-8 animate-spin text-primary" />
                        </div>
                    </AuthCard>
                </AuthLayout>
            }
        >
            <LoginForm />
        </Suspense>
    );
}
