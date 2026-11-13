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
    const [isSuccessState, setIsSuccessState] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [shakeKey, setShakeKey] = useState(0);
    const successTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
            }
        };
    }, []);

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
            setIsSuccessState(false);
            setCopied(false);
            setShowManualKey(false);
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
                successTimerRef.current = null;
            }
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
        if (code.length !== 6 || isLoading || isSuccessState) return;

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const result = await onVerify(code);
            if (result.success) {
                setIsLoading(false);
                setIsSuccessState(true);
                // 1.7 seconds Cyber-Vault unlock transition before proceeding
                successTimerRef.current = setTimeout(() => {
                    if (onSuccess) {
                        onSuccess();
                    } else {
                        onClose();
                    }
                }, 1700);
            } else {
                setErrorMessage(result.error || 'Kode OTP tidak valid atau telah kadaluarsa.');
                setShakeKey((prev) => prev + 1);
                setOtpCode('');
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : 'Terjadi kesalahan saat memverifikasi OTP.';
            setErrorMessage(msg);
            setShakeKey((prev) => prev + 1);
            setOtpCode('');
        } finally {
            if (!isSuccessState) {
                setIsLoading(false);
            }
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
        <Dialog
            open={isOpen}
            onOpenChange={(open) => !open && allowCancel && !isSuccessState && onClose()}
        >
            <DialogContent className="max-w-[360px] sm:max-w-[370px] p-5 sm:p-5.5 sm:rounded-2xl border-border/80 bg-background/95 backdrop-blur-md shadow-2xl transition-all duration-300">
                <AnimatePresence mode="wait">
                    {isSuccessState ? (
                        <motion.div
                            key="success-screen"
                            initial={{ opacity: 0, scale: 0.93 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                            className="flex flex-col items-center justify-center py-6 px-2 space-y-5 text-center min-h-[260px]"
                        >
                            {/* Concentric radar pulse ripples + SVG Padlock with Unlocking Shackle */}
                            <div className="relative flex items-center justify-center my-1">
                                {/* Pulse Ripple 1 */}
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0.8 }}
                                    animate={{ scale: [1, 1.45, 1.8], opacity: [0.6, 0.2, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                                    className="absolute w-24 h-24 rounded-full bg-emerald-500/15 border border-emerald-500/30 pointer-events-none"
                                />
                                {/* Pulse Ripple 2 */}
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0.8 }}
                                    animate={{ scale: [1, 1.3, 1.55], opacity: [0.5, 0.2, 0] }}
                                    transition={{
                                        duration: 1.5,
                                        delay: 0.25,
                                        repeat: Infinity,
                                        ease: 'easeOut',
                                    }}
                                    className="absolute w-20 h-20 rounded-full bg-primary/15 border border-primary/30 pointer-events-none"
                                />

                                {/* Glowing Center Badge */}
                                <motion.div
                                    initial={{ scale: 0.75, rotate: -6 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                                    className="relative z-10 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-primary/10 text-emerald-500 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.35)] backdrop-blur-xs"
                                >
                                    <svg
                                        width="32"
                                        height="32"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="text-emerald-500"
                                        aria-hidden="true"
                                    >
                                        {/* Shackle: animates up and rotates open */}
                                        <motion.path
                                            d="M7 11V7a5 5 0 0 1 10 0v4"
                                            initial={{ y: 0, rotate: 0, originX: '17px', originY: '11px' }}
                                            animate={{ y: -3.5, rotate: 25 }}
                                            transition={{
                                                delay: 0.25,
                                                duration: 0.5,
                                                type: 'spring',
                                                stiffness: 280,
                                                damping: 14,
                                            }}
                                        />
                                        {/* Padlock Body */}
                                        <rect x="3" y="11" width="18" height="11" rx="3" ry="3" />
                                        {/* Keyhole */}
                                        <circle cx="12" cy="16" r="1.2" fill="currentColor" />
                                        <line x1="12" y1="17.2" x2="12" y2="19" />
                                    </svg>
                                </motion.div>
                            </div>

                            {/* Cyber Security Status Details */}
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15, duration: 0.4 }}
                                className="flex flex-col items-center space-y-1.5"
                            >
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-semibold tracking-wider border border-emerald-500/25 shadow-xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    SESSION DECRYPTED • ACCESS GRANTED
                                </div>
                                <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                                    Kunci Keamanan Terverifikasi
                                </h3>
                                <p className="text-xs text-muted-foreground font-mono">
                                    Menghubungkan sesi terenkripsi ke sistem...
                                </p>
                            </motion.div>

                            {/* Smooth Micro Progress Bar */}
                            <div className="w-full max-w-[240px] h-1.5 rounded-full bg-muted/60 overflow-hidden relative border border-border/40 mt-1">
                                <motion.div
                                    initial={{ width: '0%' }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 1.6, ease: 'easeInOut' }}
                                    className="h-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="input-form-screen"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col space-y-4"
                        >
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
                                                /* biome-ignore lint/performance/noImgElement: runtime dynamic QR data URL */
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
                                                    {showManualKey
                                                        ? 'Sembunyikan Kunci Manual'
                                                        : 'Tidak bisa scan? Gunakan Kunci Manual'}
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
                                        confirmText ||
                                        (mode === 'setup' ? 'Aktifkan & Lanjutkan' : 'Verifikasi')
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
}

