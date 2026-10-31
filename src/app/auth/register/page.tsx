'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    IdCard,
    Loader2,
    Lock,
    Mail,
    User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { checkEmployeeNik } from '@/app/auth/actions/auth-actions';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import TurnstileWidget from '@/app/auth/components/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-input';
import { authClient } from '@/lib/auth-client';

const NikSchema = z.object({
    nik: z.string().min(1, 'NIK wajib diisi'),
});

const passwordSchema = z
    .string()
    .trim()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Z]/, 'Harus ada huruf kapital')
    .regex(/[a-z]/, 'Harus ada huruf kecil')
    .regex(/[0-9]/, 'Harus ada angka')
    .regex(/[^A-Za-z0-9]/, 'Harus ada simbol')
    .refine((val) => !/\s/.test(val), { message: 'Password tidak boleh mengandung spasi' });

const RegisterSchema = z
    .object({
        name: z.string().min(1, 'Nama wajib diisi'),
        email: z.string().min(1, 'Email wajib diisi').email('Email tidak valid'),
        nik: z.string().min(1, 'NIK wajib diisi'),
        password: passwordSchema,
        confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Password tidak cocok',
        path: ['confirmPassword'],
    });

type NikFormValues = z.infer<typeof NikSchema>;
type RegisterFormValues = z.infer<typeof RegisterSchema>;

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState('');
    const [turnstileError, setTurnstileError] = useState<string | null>(null);

    const handleTurnstileToken = useCallback((token: string) => {
        setTurnstileToken(token);
        setTurnstileError(null);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken('');
    }, []);

    const handleTurnstileError = useCallback((_code: string) => {
        setTurnstileToken('');
        setTurnstileError('Verifikasi keamanan gagal dimuat. Silakan muat ulang halaman.');
    }, []);

    // Form Step 1
    const nikForm = useForm<NikFormValues>({
        resolver: zodResolver(NikSchema),
        defaultValues: { nik: '' },
    });

    // Form Step 2
    const registerForm = useForm<RegisterFormValues>({
        resolver: zodResolver(RegisterSchema),
        defaultValues: { name: '', email: '', nik: '', password: '', confirmPassword: '' },
    });

    const onNikSubmit = async (data: NikFormValues) => {
        if (!turnstileToken) {
            toast.error('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
            return;
        }

        try {
            const res = await checkEmployeeNik(data.nik, turnstileToken);
            if (!res.success || !res.data) {
                throw new Error(res.message);
            }

            // Pre-fill Step 2
            registerForm.setValue('nik', res.data.nik || '');
            registerForm.setValue('name', res.data.nama || '');

            toast.success('NIK terverifikasi');
            setTurnstileToken('');
            (window as Window & { __mtmsTurnstileToken?: string }).__mtmsTurnstileToken = '';
            setStep(2);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memverifikasi NIK';
            toast.error(message);
        }
    };

    const onRegisterSubmit = async (data: RegisterFormValues) => {
        if (!turnstileToken) {
            toast.error('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
            return;
        }

        try {
            const result = await authClient.signUp.email({
                name: data.name,
                email: data.email,
                password: data.password,
                // @ts-expect-error - nik is passed as additional field
                nik: data.nik,
                fetchOptions: { headers: { 'x-captcha-response': turnstileToken } },
            });

            if (result.error) {
                throw new Error(result.error.message || 'Pendaftaran gagal');
            }

            toast.success('Pendaftaran berhasil! Silahkan login.');
            router.push('/auth/login?registered=true');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Pendaftaran gagal';
            toast.error(message);
        }
    };

    return (
        <AuthLayout formPosition="left">
            <AuthCard
                title="Daftar Akun"
                description={
                    step === 1
                        ? 'Masukkan NIK Anda untuk verifikasi karyawan'
                        : 'Lengkapi data untuk membuat akun MTMS'
                }
            >
                {/* 2-Step Registration Progress Indicator with CSS progress() */}
                <div className="mb-5 space-y-1.5">
                    <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                        <span>
                            Langkah {step} dari 2: {step === 1 ? 'Verifikasi NIK' : 'Lengkapi Akun'}
                        </span>
                        <span className="font-semibold text-primary tabular-nums">
                            {step === 1 ? '50%' : '100%'}
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted/70 rounded-full overflow-hidden">
                        <div
                            className="css-progress-meter h-full rounded-full bg-primary transition-all duration-300"
                            style={
                                {
                                    '--score-val': step === 1 ? 50 : 100,
                                    width: `${step === 1 ? 50 : 100}%`,
                                } as React.CSSProperties
                            }
                            aria-hidden="true"
                        />
                    </div>
                </div>

                {step === 1 && (
                    <form
                        onSubmit={nikForm.handleSubmit(onNikSubmit)}
                        noValidate
                        className="space-y-4"
                    >
                        <div>
                            <FloatingInput
                                id="nik"
                                type="text"
                                label="Nomor Induk Karyawan (NIK)"
                                {...nikForm.register('nik')}
                                disabled={nikForm.formState.isSubmitting}
                                error={nikForm.formState.errors.nik?.message}
                                startIcon={<IdCard className="size-4" />}
                                autoComplete="username"
                            />
                        </div>

                        <TurnstileWidget
                            onToken={handleTurnstileToken}
                            onExpire={handleTurnstileExpire}
                            onError={handleTurnstileError}
                            action="register-nik"
                            className="my-3"
                        />
                        {turnstileError ? (
                            <p role="alert" className="text-sm text-destructive mb-3">
                                {turnstileError}
                            </p>
                        ) : null}
                        <Button
                            type="submit"
                            className="w-full h-12 text-sm sm:text-base font-semibold tracking-wide rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
                            disabled={
                                nikForm.formState.isSubmitting ||
                                !turnstileToken ||
                                !!turnstileError
                            }
                        >
                            {nikForm.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin mr-2" />
                                    Memverifikasi NIK...
                                </>
                            ) : (
                                <>
                                    Verifikasi NIK <ArrowRight className="size-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>
                )}

                {step === 2 && (
                    <form
                        onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                        noValidate
                        className="space-y-4"
                    >
                        <TurnstileWidget
                            onToken={handleTurnstileToken}
                            onExpire={handleTurnstileExpire}
                            onError={handleTurnstileError}
                            action="register"
                            className="my-2"
                        />
                        {turnstileError ? (
                            <p role="alert" className="text-sm text-destructive mb-3">
                                {turnstileError}
                            </p>
                        ) : null}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <FloatingInput
                                    id="reg-nik"
                                    type="text"
                                    label="NIK (Terverifikasi)"
                                    {...registerForm.register('nik')}
                                    readOnly
                                    startIcon={<CheckCircle2 className="size-4 text-emerald-500" />}
                                />
                            </div>

                            <div>
                                <FloatingInput
                                    id="name"
                                    type="text"
                                    label="Nama Lengkap"
                                    {...registerForm.register('name')}
                                    readOnly
                                    startIcon={<User className="size-4 text-muted-foreground" />}
                                    error={registerForm.formState.errors.name?.message}
                                />
                            </div>
                        </div>

                        <div>
                            <FloatingInput
                                id="reg-email"
                                type="email"
                                label="Alamat Email"
                                {...registerForm.register('email')}
                                disabled={registerForm.formState.isSubmitting}
                                error={registerForm.formState.errors.email?.message}
                                startIcon={<Mail className="size-4" />}
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <FloatingInput
                                id="reg-password"
                                type={showPassword ? 'text' : 'password'}
                                label="Kata Sandi"
                                {...registerForm.register('password')}
                                disabled={registerForm.formState.isSubmitting}
                                error={registerForm.formState.errors.password?.message}
                                startIcon={<Lock className="size-4" />}
                                autoComplete="new-password"
                                endIcon={
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={
                                            showPassword
                                                ? 'Sembunyikan password'
                                                : 'Tampilkan password'
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

                        <div>
                            <FloatingInput
                                id="confirmPassword"
                                type={showConfirm ? 'text' : 'password'}
                                label="Konfirmasi Kata Sandi"
                                {...registerForm.register('confirmPassword')}
                                disabled={registerForm.formState.isSubmitting}
                                error={registerForm.formState.errors.confirmPassword?.message}
                                startIcon={<Lock className="size-4" />}
                                autoComplete="new-password"
                                endIcon={
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        aria-label={
                                            showConfirm
                                                ? 'Sembunyikan konfirmasi password'
                                                : 'Tampilkan konfirmasi password'
                                        }
                                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                                    >
                                        {showConfirm ? (
                                            <EyeOff className="size-4" />
                                        ) : (
                                            <Eye className="size-4" />
                                        )}
                                    </button>
                                }
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-12 text-sm sm:text-base font-semibold tracking-wide rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
                            disabled={
                                registerForm.formState.isSubmitting ||
                                !turnstileToken ||
                                !!turnstileError
                            }
                        >
                            {registerForm.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin mr-2" />
                                    Mendaftarkan Akun...
                                </>
                            ) : (
                                'Daftar Sekarang'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full mt-2"
                            onClick={() => {
                                setTurnstileToken('');
                                (
                                    window as Window & { __mtmsTurnstileToken?: string }
                                ).__mtmsTurnstileToken = '';
                                setStep(1);
                            }}
                            disabled={registerForm.formState.isSubmitting}
                        >
                            Kembali
                        </Button>
                    </form>
                )}

                <div className="flex items-center gap-2 justify-center mt-6 flex-wrap">
                    <p className="text-sm text-muted-foreground">Sudah punya akun?</p>
                    <Link
                        href="/auth/login"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Masuk Disini
                    </Link>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}
