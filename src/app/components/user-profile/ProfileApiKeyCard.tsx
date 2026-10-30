'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
    deleteUserApiKey,
    generateUserApiKey,
    type UserProfileData,
} from '@/app/(DashboardLayout)/management/user-profile/_actions/profile-actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { StaggerItem } from '@/components/ui/motion/stagger-item';

interface ProfileApiKeyCardProps {
    profileData?: UserProfileData;
}

export function ProfileApiKeyCard({ profileData }: ProfileApiKeyCardProps) {
    const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
    const [isKeyCopied, setIsKeyCopied] = useState(false);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleGenerateApiKey = () => {
        setIsGeneratingKey(true);
        startTransition(async () => {
            try {
                const res = await generateUserApiKey();
                if (res.success && res.data?.rawKey) {
                    setNewlyGeneratedKey(res.data.rawKey);
                    setIsKeyCopied(false);
                    toast.success('API Key berhasil dibuat. Simpan sekarang!');
                } else {
                    toast.error(res.error || 'Gagal membuat API Key');
                }
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan');
            } finally {
                setIsGeneratingKey(false);
            }
        });
    };

    const handleDeleteApiKey = () => {
        if (
            !confirm(
                'Apakah Anda yakin ingin menghapus API Key ini? Akses integrasi yang menggunakan kunci ini akan langsung berhenti berfungsi.'
            )
        ) {
            return;
        }

        startTransition(async () => {
            try {
                const res = await deleteUserApiKey();
                if (res.success) {
                    toast.success('API Key berhasil dihapus');
                } else {
                    toast.error(res.error || 'Gagal menghapus API Key');
                }
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan');
            }
        });
    };

    const handleCopyKey = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setIsKeyCopied(true);
            toast.success('API Key disalin ke clipboard');
            setTimeout(() => setIsKeyCopied(false), 2000);
        } catch {
            toast.error('Gagal menyalin teks');
        }
    };

    return (
        <StaggerItem className="space-y-3 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                        <Image
                            src="/images/svgs/icon-api-key.svg"
                            alt="API Key"
                            width={32}
                            height={32}
                            className="text-primary w-8 h-8"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h5 className="text-lg font-semibold text-foreground">MTMS Public API</h5>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Generate kunci akses untuk integrasi sistem eksternal via REST API.
                        </p>
                    </div>
                </div>
                {profileData?.has_api_key ? (
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${profileData.appr_api ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}
                    >
                        <Icon
                            icon={profileData.appr_api ? 'lucide:check-circle' : 'lucide:clock'}
                            width="14"
                        />
                        {profileData.appr_api ? 'Disetujui' : 'Menunggu'}
                    </span>
                ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-muted/20 bg-muted/10 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <Icon icon="lucide:circle-slash" width="14" />
                        Belum Ada
                    </span>
                )}
            </div>

            <div className="grid min-h-36 grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_140px] sm:items-center sm:p-4">
                <div className="flex flex-col items-start gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                                API Access Token
                            </span>
                            <span className="text-xs text-muted-foreground font-mono bg-background/80 px-1.5 py-0.5 rounded border border-border">
                                v1 (REST)
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Akses data secara otomatis, dibatasi 1 request per 5 menit per akun.
                        </p>
                    </div>
                    {profileData?.has_api_key ? (
                        <div className="space-y-3 w-full">
                            <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-md">
                                <Icon
                                    icon="lucide:key-round"
                                    width="14"
                                    className="text-muted-foreground shrink-0"
                                />
                                <code className="text-xs text-muted-foreground font-mono flex-1 select-all">
                                    mtms_live_••••••••••••••••••••••••••••••••
                                </code>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-background/50 rounded-lg border border-border">
                                <div className="flex items-center gap-2">
                                    <Icon
                                        icon={
                                            profileData.appr_api
                                                ? 'lucide:shield-check'
                                                : 'lucide:shield-alert'
                                        }
                                        width="16"
                                        className={
                                            profileData.appr_api ? 'text-success' : 'text-warning'
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {profileData.appr_api
                                            ? 'API Key aktif dan siap digunakan untuk integrasi.'
                                            : 'Hubungi Admin untuk menyetujui izin API pada Management User.'}
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleDeleteApiKey}
                                    disabled={isPending}
                                    className="gap-1.5 mt-2 sm:mt-0"
                                >
                                    <Icon icon="lucide:trash-2" width="14" />
                                    Hapus
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                size="sm"
                                onClick={handleGenerateApiKey}
                                disabled={isPending || isGeneratingKey}
                                className="w-fit gap-1.5"
                            >
                                <Icon icon="lucide:plus" width="16" />
                                {isGeneratingKey ? 'Membuat...' : 'Generate API Key'}
                            </Button>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 border border-border">
                                    <Icon icon="lucide:lock-keyhole" width="14" />
                                    SHA-256 Hash
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 border border-border">
                                    <Icon icon="lucide:shield" width="14" />
                                    Persetujuan Admin
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Decorative Illustration - Right Side */}
                <div className="hidden sm:flex flex-col items-center justify-center relative h-full min-h-24">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg animate-pulse" />
                        <div className="relative w-14 h-14 rounded-xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-500">
                            <Icon icon="lucide:server" width="28" className="text-primary/80" />
                        </div>
                    </div>

                    <div className="absolute top-1 left-3">
                        <div className="w-7 h-7 rounded-lg bg-background/90 border border-border/60 flex items-center justify-center shadow-sm hover:scale-110 transition-transform duration-300">
                            <Icon icon="lucide:code-2" width="12" className="text-primary/70" />
                        </div>
                    </div>
                    <div className="absolute top-4 right-0">
                        <div className="w-6 h-6 rounded-lg bg-background/90 border border-border/60 flex items-center justify-center shadow-sm hover:scale-110 transition-transform duration-300">
                            <Icon icon="lucide:webhook" width="10" className="text-primary/60" />
                        </div>
                    </div>
                    <div className="absolute bottom-3 left-1">
                        <div className="w-5 h-5 rounded-full bg-background/90 border border-border/60 flex items-center justify-center shadow-sm">
                            <Icon icon="lucide:database" width="9" className="text-primary/50" />
                        </div>
                    </div>
                    <div className="absolute bottom-0 right-4">
                        <div className="w-5 h-5 rounded-full bg-success/20 border border-success/30 flex items-center justify-center shadow-sm">
                            <Icon icon="lucide:arrow-right" width="8" className="text-success/80" />
                        </div>
                    </div>

                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 140 140"
                        fill="none"
                    >
                        <path
                            d="M35 40 Q 55 55, 70 70"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            className="text-primary/30"
                        />
                        <path
                            d="M105 42 Q 85 58, 72 70"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            className="text-primary/25"
                        />
                        <path
                            d="M32 95 Q 50 82, 68 72"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            className="text-primary/20"
                        />
                        <path
                            d="M100 100 Q 88 88, 74 75"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            className="text-success/30"
                        />
                    </svg>
                </div>
            </div>

            {/* Modal Dialog: New API Key Display */}
            <ModalDialog
                isOpen={!!newlyGeneratedKey}
                onClose={() => setNewlyGeneratedKey(null)}
                title="API Key Berhasil Dibuat"
            >
                <div className="space-y-4 py-2">
                    <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-warning-foreground text-sm space-y-1">
                        <div className="flex items-center gap-2 font-medium">
                            <Icon icon="lucide:alert-triangle" width="16" />
                            Penting: Simpan Kunci Sekarang
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Kunci ini hanya ditampilkan satu kali demi keamanan. Anda tidak akan
                            bisa melihat kunci ini lagi setelah menutup dialog ini.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label
                            htmlFor="new-api-key"
                            className="text-xs font-semibold uppercase text-muted-foreground"
                        >
                            Secret API Key
                        </Label>
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md border border-border">
                            <code
                                id="new-api-key"
                                className="text-xs font-mono font-medium text-foreground break-all flex-1 select-all"
                            >
                                {newlyGeneratedKey}
                            </code>
                            <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 h-8 gap-1.5"
                                onClick={() =>
                                    newlyGeneratedKey && handleCopyKey(newlyGeneratedKey)
                                }
                            >
                                <Icon
                                    icon={isKeyCopied ? 'lucide:check' : 'lucide:copy'}
                                    width="14"
                                    className={isKeyCopied ? 'text-success' : ''}
                                />
                                {isKeyCopied ? 'Tersalin' : 'Salin'}
                            </Button>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Status approval API akun Anda telah di-reset ke menunggu persetujuan Admin.
                        Kunci ini akan aktif setelah disetujui di Management User.
                    </p>

                    <div className="flex justify-end pt-3 border-t">
                        <Button onClick={() => setNewlyGeneratedKey(null)}>
                            Saya Sudah Menyimpan Kunci Ini
                        </Button>
                    </div>
                </div>
            </ModalDialog>
        </StaggerItem>
    );
}
