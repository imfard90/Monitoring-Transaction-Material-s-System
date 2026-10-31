'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-input';
import { authClient } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;

        if (!email.includes('@')) {
            setError('Format email tidak valid');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // biome-ignore lint/suspicious/noExplicitAny: authClient type doesn't include requestPasswordReset yet
            const result = await (authClient as any).requestPasswordReset({
                email,
                redirectTo: '/auth/reset-password',
            });

            if (result.error) {
                throw new Error(result.error.message || 'Gagal mengirim email reset');
            }

            setIsSubmitted(true);
            toast.success('Link reset password telah dikirim ke email Anda');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <AuthLayout formPosition="right">
                <AuthCard
                    title="Email Terkirim"
                    description="Instruksi reset password telah dikirim ke email Anda"
                >
                    <div className="py-4 space-y-6 text-center">
                        <div className="mx-auto size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-xs">
                            <CheckCircle2 className="size-8" />
                        </div>
                        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                            Silahkan periksa kotak masuk (
                            <span className="font-semibold text-foreground">{email}</span>) untuk
                            melanjutkan pemulihan kata sandi. Jika belum ada, periksa folder spam.
                        </p>
                        <Link href="/auth/login" className="block">
                            <Button variant="outline" className="w-full h-11 rounded-xl">
                                <ArrowLeft className="size-4 mr-2" /> Kembali ke Login
                            </Button>
                        </Link>
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout formPosition="right">
            <AuthCard
                title="Lupa Password"
                description="Masukkan alamat email terdaftar untuk menerima instruksi pemulihan kata sandi"
            >
                {error && (
                    <div className="mb-5 p-3.5 text-sm text-destructive bg-destructive/10 rounded-xl border border-destructive/20 font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div>
                        <FloatingInput
                            id="fp-email"
                            type="email"
                            label="Alamat Email Terdaftar"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                            startIcon={<Mail className="size-4" />}
                            autoComplete="email"
                        />
                        <p className="text-xs text-muted-foreground mt-2 font-normal leading-relaxed">
                            Tautan pengaturan ulang sandi akan dikirimkan secara aman ke email Anda.
                        </p>
                    </div>

                    <Button
                        type="submit"
                        className="w-full h-12 text-sm sm:text-base font-semibold tracking-wide rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99] relative overflow-hidden group"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <div className="flex items-center justify-center w-full h-full relative">
                                <motion.div
                                    className="absolute"
                                    initial={{ left: '-10%', y: 10, opacity: 0 }}
                                    animate={{ left: '110%', y: -10, opacity: [0, 1, 1, 0] }}
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: 'easeInOut',
                                    }}
                                >
                                    <Send className="size-5" />
                                </motion.div>
                                <span className="z-10 bg-primary/80 px-2 rounded backdrop-blur-sm">
                                    Mengirimkan Link...
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-full h-full">
                                <Send className="size-4 mr-2 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                                <span>Kirim Link Reset Password</span>
                            </div>
                        )}
                    </Button>
                </form>

                <div className="flex items-center gap-2 justify-center mt-7 flex-wrap">
                    <p className="text-sm text-muted-foreground">Sudah ingat password?</p>
                    <Link
                        href="/auth/login"
                        className="text-sm font-semibold text-primary hover:underline hover:text-primary/90 transition-colors"
                    >
                        Masuk Disini
                    </Link>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}
