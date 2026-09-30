'use client';

import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
                    <div className="py-2 space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Silahkan cek inbox email untuk melanjutkan reset password. Jika tidak
                            ada, cek folder spam.
                        </p>
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

    return (
        <AuthLayout formPosition="right">
            <AuthCard title="Lupa Password" description="Masukkan email Anda untuk reset password">
                {error && (
                    <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <Label htmlFor="fp-email" className="font-medium">
                            Email
                        </Label>
                        <Input
                            id="fp-email"
                            type="email"
                            placeholder="nama@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                            className="mt-1"
                        />
                        <p className="text-sm text-muted-foreground mt-2">
                            Kami akan mengirimkan link reset password ke email Anda.
                        </p>
                    </div>

                    <Button
                        type="submit"
                        className="w-full relative overflow-hidden group h-10"
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
                                    Mengirim...
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-full h-full">
                                <Send className="size-4 mr-2 transition-transform duration-300 group-hover:translate-x-2 group-hover:-translate-y-2" />
                                <span>Kirim Link Reset</span>
                            </div>
                        )}
                    </Button>
                </form>

                <div className="flex items-center gap-2 justify-center mt-6 flex-wrap">
                    <p className="text-sm text-muted-foreground">Ingat password?</p>
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
