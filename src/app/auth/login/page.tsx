'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { authClient } from '@/lib/auth-client';

const LoginSchema = z.object({
    email: z.string().min(1, 'Email wajib diisi').email('Email tidak valid'),
    password: z.string().min(1, 'Password wajib diisi'),
    remember: z.boolean(),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

const LoginForm = () => {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const onSubmit = async (data: LoginFormValues) => {
        setError(null);
        try {
            const result = await authClient.signIn.email({
                email: data.email,
                password: data.password,
                rememberMe: data.remember,
            });

            if (result.error) {
                throw new Error(result.error.message || 'Login gagal');
            }

            toast.success('Berhasil masuk');
            window.location.href = '/';
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Email atau password salah';
            setError(message);
            toast.error(message);
        }
    };

    return (
        <AuthLayout formPosition="right">
            <AuthCard title="Masuk" description="Selamat datang kembali di MTMS">
                {error && (
                    <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="mb-4">
                        <Label htmlFor="email" className="font-medium">
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="nama@email.com"
                            {...register('email')}
                            disabled={isSubmitting}
                            className="mt-1"
                        />
                        {errors.email && (
                            <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="mb-4">
                        <Label htmlFor="password" className="font-medium">
                            Password
                        </Label>
                        <div className="relative mt-1">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Masukkan password"
                                {...register('password')}
                                disabled={isSubmitting}
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
                        {errors.password && (
                            <p className="text-sm text-destructive mt-1">
                                {errors.password.message}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-6 items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="remember"
                                checked={remember}
                                onCheckedChange={(checked) =>
                                    setValue('remember', checked as boolean)
                                }
                            />
                            <Label className="font-normal text-sm" htmlFor="remember">
                                Ingat perangkat ini
                            </Label>
                        </div>
                        <Link
                            href="/auth/forgot-password"
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Lupa Password?
                        </Link>
                    </div>

                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Masuk...
                            </>
                        ) : (
                            'Masuk'
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
        </AuthLayout>
    );
};

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <AuthLayout>
                    <AuthCard title="Masuk" description="Loading...">
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
