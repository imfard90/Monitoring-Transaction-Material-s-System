'use client';

import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { toast } from 'sonner';
import AuthCard from '@/app/auth/components/AuthCard';
import AuthLayout from '@/app/auth/components/AuthLayout';
import OtpInput from '@/app/auth/components/OtpInput';
import { Button } from '@/components/ui/button';

import { authClient } from '@/lib/auth-client';

interface MFAPageProps {
    mode?: 'setup' | 'verify';
    userId?: string;
    onSuccess?: () => void;
}

export default function MFAPage({ mode = 'verify', userId, onSuccess }: MFAPageProps) {
    const [otpCode, setOtpCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // For setup mode: QR code from server
    const [qrCode] = useState<string | null>(null);
    const [secret] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otpCode || otpCode.length < 6) return;

        setIsLoading(true);
        setError(null);

        try {
            let result;
            if (mode === 'setup') {
                result = await authClient.twoFactor.verifyTotp({ code: otpCode });
            } else {
                result = await authClient.twoFactor.verifyTotp({ code: otpCode });
            }

            if (result.error) {
                throw new Error(result.error.message || 'Verifikasi gagal');
            }

            toast.success(mode === 'setup' ? 'MFA berhasil diaktifkan' : 'Verifikasi berhasil');
            onSuccess?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Verifikasi gagal';
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout formPosition="right">
            <AuthCard
                title={mode === 'setup' ? 'Setup Autentikasi Dua Faktor' : 'Verifikasi OTP'}
                description={
                    mode === 'setup'
                        ? 'Pindai QR code dengan Google Authenticator atau aplikasi autentikator lainnya'
                        : 'Masukkan kode 6 digit dari aplikasi autentikator Anda'
                }
            >
                {error && (
                    <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {mode === 'setup' && qrCode && (
                        <div className="mb-6">
                            <div className="flex justify-center mb-4">
                                <div className="bg-white p-4 rounded-lg border">
                                    <Image
                                        src={qrCode}
                                        alt="QR Code MFA"
                                        width={192}
                                        height={192}
                                        className="w-48 h-48"
                                    />
                                </div>
                            </div>
                            <p className="text-sm text-center text-muted-foreground mb-2">
                                Buka Google Authenticator atau Microsoft Authenticator lalu pindai
                                QR code ini.
                            </p>
                            {secret && (
                                <p className="text-xs text-center text-muted-foreground">
                                    Atau masukkan kode manual:{' '}
                                    <span className="font-mono font-bold">{secret}</span>
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mb-6">
                        <OtpInput length={6} onComplete={setOtpCode} disabled={isLoading} />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || otpCode.length < 6}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Memverifikasi...
                            </>
                        ) : mode === 'setup' ? (
                            'Aktifkan MFA'
                        ) : (
                            'Verifikasi'
                        )}
                    </Button>
                </form>
            </AuthCard>
        </AuthLayout>
    );
}
