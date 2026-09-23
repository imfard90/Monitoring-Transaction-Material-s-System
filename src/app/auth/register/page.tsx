'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { checkEmployeeNik } from '@/app/auth/actions/auth-actions';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        try {
            const res = await checkEmployeeNik(data.nik);
            if (!res.success || !res.data) {
                throw new Error(res.message);
            }

            // Pre-fill Step 2
            registerForm.setValue('nik', res.data.nik || '');
            registerForm.setValue('name', res.data.nama || '');

            toast.success('NIK terverifikasi');
            setStep(2);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memverifikasi NIK';
            toast.error(message);
        }
    };

    const onRegisterSubmit = async (data: RegisterFormValues) => {
        try {
            const result = await authClient.signUp.email({
                name: data.name,
                email: data.email,
                password: data.password,
                // @ts-expect-error - nik is passed as additional field
                nik: data.nik,
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
                {step === 1 && (
                    <form onSubmit={nikForm.handleSubmit(onNikSubmit)} noValidate>
                        <div className="mb-6">
                            <Label htmlFor="nik" className="font-medium">
                                Nomor Induk Karyawan (NIK)
                            </Label>
                            <Input
                                id="nik"
                                type="text"
                                placeholder="Masukkan NIK Anda"
                                {...nikForm.register('nik')}
                                disabled={nikForm.formState.isSubmitting}
                                className="mt-1"
                            />
                            {nikForm.formState.errors.nik && (
                                <p className="text-sm text-destructive mt-1">
                                    {nikForm.formState.errors.nik.message}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={nikForm.formState.isSubmitting}
                        >
                            {nikForm.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin mr-2" />
                                    Memverifikasi...
                                </>
                            ) : (
                                <>
                                    Selanjutnya <ArrowRight className="size-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} noValidate>
                        <div className="mb-4">
                            <Label htmlFor="reg-nik" className="font-medium text-muted-foreground">
                                NIK (Terverifikasi)
                            </Label>
                            <Input
                                id="reg-nik"
                                type="text"
                                {...registerForm.register('nik')}
                                readOnly
                                className="mt-1 bg-muted"
                            />
                        </div>

                        <div className="mb-4">
                            <Label htmlFor="name" className="font-medium">
                                Nama Lengkap
                            </Label>
                            <Input
                                id="name"
                                type="text"
                                {...registerForm.register('name')}
                                disabled={registerForm.formState.isSubmitting}
                                readOnly
                                className="mt-1 bg-muted"
                            />
                            {registerForm.formState.errors.name && (
                                <p className="text-sm text-destructive mt-1">
                                    {registerForm.formState.errors.name.message}
                                </p>
                            )}
                        </div>

                        <div className="mb-4">
                            <Label htmlFor="reg-email" className="font-medium">
                                Email
                            </Label>
                            <Input
                                id="reg-email"
                                type="email"
                                placeholder="nama@email.com"
                                {...registerForm.register('email')}
                                disabled={registerForm.formState.isSubmitting}
                                className="mt-1"
                            />
                            {registerForm.formState.errors.email && (
                                <p className="text-sm text-destructive mt-1">
                                    {registerForm.formState.errors.email.message}
                                </p>
                            )}
                        </div>

                        <div className="mb-4">
                            <Label htmlFor="reg-password" className="font-medium">
                                Password
                            </Label>
                            <div className="relative mt-1">
                                <Input
                                    id="reg-password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Min. 8 karakter, huruf besar, angka & simbol"
                                    {...registerForm.register('password')}
                                    disabled={registerForm.formState.isSubmitting}
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
                            {registerForm.formState.errors.password && (
                                <p className="text-sm text-destructive mt-1">
                                    {registerForm.formState.errors.password.message}
                                </p>
                            )}
                        </div>

                        <div className="mb-6">
                            <Label htmlFor="confirmPassword" className="font-medium">
                                Konfirmasi Password
                            </Label>
                            <div className="relative mt-1">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="Ulangi password"
                                    {...registerForm.register('confirmPassword')}
                                    disabled={registerForm.formState.isSubmitting}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showConfirm ? (
                                        <EyeOff className="size-4" />
                                    ) : (
                                        <Eye className="size-4" />
                                    )}
                                </button>
                            </div>
                            {registerForm.formState.errors.confirmPassword && (
                                <p className="text-sm text-destructive mt-1">
                                    {registerForm.formState.errors.confirmPassword.message}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={registerForm.formState.isSubmitting}
                        >
                            {registerForm.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin mr-2" />
                                    Mendaftar...
                                </>
                            ) : (
                                'Daftar Sekarang'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full mt-2"
                            onClick={() => setStep(1)}
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
