'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle,
    Check,
    Copy,
    KeyRound,
    Loader2,
    QrCode,
    ShieldCheck,
    Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from '@/components/ui/input-otp';

export interface MfaModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'verify' | 'setup';
    totpUri?: string;
    secretKey?: string;
    title?: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    allowCancel?: boolean;
    onVerify: (code: string) => Promise<{ success: boolean; error?: string }>;
    onSuccess?: () => void;
}

export function MfaModal({
    isOpen,
    onClose,
    mode = 'verify',
    totpUri,
    secretKey: initialSecretKey,
    title,
    description,
    confirmText,
    cancelText = 'Batal',
    allowCancel = true,
    onVerify,
    onSuccess,
}: MfaModalProps) {
    const [otpCode, setOtpCode] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [secretKey, setSecretKey] = useState<string | null>(initialSecretKey || null);
    const [showManualKey, setShowManualKey] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [shakeKey, setShakeKey] = useState(0);

    // Parse secret key from URI if not provided explicitly
    useEffect(() => {
        if (totpUri) {
            try {
                const parsedUrl = new URL(totpUri);
                const secret = parsedUrl.searchParams.get('secret');
                if (secret) {
                    setSecretKey(secret);
                }
            } catch {
                // If not standard URL format, fallback to initialSecretKey
            }

            // Generate high-contrast QR Code data URL
            QRCode.toDataURL(totpUri, {
                width: 180,
                margin: 1,
                color: {
                    dark: '#0f172a',
                    light: '#ffffff',
                },
                errorCorrectionLevel: 'M',
            })
                .then((url) => setQrDataUrl(url))
                .catch(() => setQrDataUrl(null));
        } else if (initialSecretKey) {
            setSecretKey(initialSecretKey);
        }
    }, [totpUri, initialSecretKey]);

    // Reset fields on modal open
    useEffect(() => {
        if (isOpen) {
            setOtpCode('');
            setErrorMessage(null);
            setIsLoading(false);
            setCopied(false);
            setShowManualKey(false);
        }
    }, [isOpen]);

    const handleCopySecret = async () => {
        if (!secretKey) return;
        try {
            await navigator.clipboard.writeText(secretKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard fallback
        }
    };

    const handleVerify = async (codeToVerify?: string) => {
        const code = (codeToVerify ?? otpCode).trim();
        if (code.length !== 6 || isLoading) return;

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const result = await onVerify(code);
            if (result.success) {
                if (onSuccess) {
                    onSuccess();
                } else {
                    onClose();
                }
            } else {
                setErrorMessage(result.error || 'Kode OTP tidak valid atau telah kadaluarsa.');
                setShakeKey((prev) => prev + 1);
                setOtpCode('');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memverifikasi OTP.';
            setErrorMessage(msg);
            setShakeKey((prev) => prev + 1);
            setOtpCode('');
        } finally {
            setIsLoading(false);
        }
    };

    // Auto submit when 6 digits entered
    const handleOtpChange = (value: string) => {
        setOtpCode(value);
        if (errorMessage) {
            setErrorMessage(null);
        }
        if (value.length === 6) {
            handleVerify(value);
        }
    };

    const defaultTitle =
        mode === 'setup'
            ? 'Aktivasi Authenticator (MFA)'
            : 'Verifikasi Dua Langkah';

    const defaultDesc =
        mode === 'setup'
            ? 'Pindai QR code berikut dengan Google Authenticator atau Microsoft Authenticator untuk mendaftarkan akun Anda.'
            : 'Masukkan 6-digit kode keamanan dari aplikasi Authenticator di ponsel Anda.';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && allowCancel && onClose()}>
            <DialogContent className="max-w-[420px] p-6 sm:rounded-2xl border-border/60 bg-background/95 backdrop-blur-md shadow-2xl">
                <DialogHeader className="flex flex-col items-center text-center space-y-2">
                    {/* Top Icon with subtle glow */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="relative flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary border border-primary/20 shadow-inner"
                    >
                        {mode === 'setup' ? (
                            <QrCode className="w-6 h-6" />
                        ) : (
                            <ShieldCheck className="w-6 h-6" />
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        </span>
                    </motion.div>

                    <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                        {title || defaultTitle}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                        {description || defaultDesc}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-4 py-2">
                    {/* Setup Mode: QR Code & Manual Key */}
                    {mode === 'setup' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center space-y-3 w-full"
                        >
                            <div className="relative p-2.5 rounded-xl bg-white border border-border/80 shadow-md">
                                {qrDataUrl ? (
                                    <img
                                        src={qrDataUrl}
                                        alt="TOTP QR Code"
                                        className="w-40 h-40 object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="w-40 h-40 flex items-center justify-center bg-muted/40 rounded-lg">
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                )}
                            </div>

                            {/* Manual Key Accordion / Helper */}
                            {secretKey && (
                                <div className="w-full flex flex-col items-center text-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualKey(!showManualKey)}
                                        className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 hover:cursor-pointer transition-colors"
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        {showManualKey ? 'Sembunyikan Kunci Manual' : 'Tidak bisa scan? Gunakan Kunci Manual'}
                                    </button>

                                    <AnimatePresence>
                                        {showManualKey && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-2 w-full max-w-xs p-2 rounded-lg bg-muted/50 border border-border/60 text-xs flex items-center justify-between overflow-hidden"
                                            >
                                                <span className="font-mono text-[11px] tracking-wider select-all truncate">
                                                    {secretKey}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleCopySecret}
                                                    className="h-7 w-7 p-0 ml-1 shrink-0"
                                                >
                                                    {copied ? (
                                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5" />
                                                    )}
                                                </Button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Verify Mode Header Badge */}
                    {mode === 'verify' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                            <Smartphone className="w-3.5 h-3.5 text-primary" />
                            <span>Buka Google / Microsoft Authenticator</span>
                        </div>
                    )}

                    {/* 6-Digit OTP Blocks with Shake Animation on Error */}
                    <motion.div
                        key={shakeKey}
                        animate={shakeKey > 0 ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        className="flex flex-col items-center space-y-2"
                    >
                        <InputOTP
                            maxLength={6}
                            value={otpCode}
                            onChange={handleOtpChange}
                            disabled={isLoading}
                            autoFocus
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                            </InputOTPGroup>
                            <InputOTPSeparator />
                            <InputOTPGroup>
                                <InputOTPSlot index={3} />
                                <InputOTPSlot index={4} />
                                <InputOTPSlot index={5} />
                            </InputOTPGroup>
                        </InputOTP>

                        {/* Error Message */}
                        <AnimatePresence>
                            {errorMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="flex items-center gap-1.5 text-xs text-destructive text-center font-medium max-w-xs px-2 pt-1"
                                >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{errorMessage}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                {/* Dialog Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    {allowCancel && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                            disabled={isLoading}
                            className="text-xs h-9"
                        >
                            {cancelText}
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => handleVerify()}
                        disabled={otpCode.length !== 6 || isLoading}
                        className="text-xs h-9 min-w-[100px]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Memverifikasi...
                            </>
                        ) : (
                            confirmText || (mode === 'setup' ? 'Aktifkan & Lanjutkan' : 'Verifikasi')
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

