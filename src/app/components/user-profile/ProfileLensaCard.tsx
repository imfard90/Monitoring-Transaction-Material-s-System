'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
    deleteLensaAccount,
    saveLensaAccount,
} from '@/app/(DashboardLayout)/user-profile/_actions/lensa-actions';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { StaggerItem } from '@/components/ui/motion/stagger-item';

interface ProfileLensaCardProps {
    profileData?: UserProfileData;
}

export function ProfileLensaCard({ profileData }: ProfileLensaCardProps) {
    const [isLensaDialogOpen, setIsLensaDialogOpen] = useState(false);
    const [lensaUsername, setLensaUsername] = useState('');
    const [lensaPassword, setLensaPassword] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleSaveLensa = async () => {
        if (!lensaUsername || !lensaPassword) {
            toast.error('Username dan Password harus diisi');
            return;
        }

        startTransition(async () => {
            const result = await saveLensaAccount(lensaUsername, lensaPassword);
            if (result.success) {
                toast.success('Akun Lensa berhasil dihubungkan');
                setIsLensaDialogOpen(false);
                setLensaUsername('');
                setLensaPassword('');
            } else {
                toast.error(result.error || 'Gagal menghubungkan akun Lensa');
            }
        });
    };

    const handleDeleteLensa = async () => {
        if (
            !confirm(
                'Apakah Anda yakin ingin memutus koneksi dan menghapus akun Lensa dari sistem?'
            )
        )
            return;

        startTransition(async () => {
            const result = await deleteLensaAccount();
            if (result.success) {
                toast.success('Koneksi Lensa berhasil diputus');
            } else {
                toast.error(result.error || 'Gagal memutus akun Lensa');
            }
        });
    };

    return (
        <StaggerItem className="space-y-3 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                        <Image
                            src="/images/svgs/icon-lensa-account.svg"
                            alt="Lensa Account"
                            width={32}
                            height={32}
                            className="text-primary w-8 h-8"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h5 className="text-lg font-semibold text-foreground">
                            Lensa Inventory Account
                        </h5>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Kelola koneksi untuk pengambilan detail reservasi secara otomatis.
                        </p>
                    </div>
                </div>
                <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${profileData?.lensa_acount ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}
                >
                    <Icon
                        icon={
                            profileData?.lensa_acount
                                ? 'lucide:check-circle'
                                : 'lucide:alert-circle'
                        }
                        width="14"
                        aria-hidden="true"
                    />
                    {profileData?.lensa_acount ? 'Terhubung' : 'Belum'}
                </span>
            </div>

            <div className="grid min-h-44 grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
                <div className="flex flex-col items-start gap-3">
                    <div className="space-y-1">
                        <h6 className="font-medium text-foreground">
                            {profileData?.lensa_acount
                                ? 'Akun Lensa siap digunakan'
                                : 'Hubungkan akun Lensa Anda'}
                        </h6>
                        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                            {profileData?.lensa_acount
                                ? 'Kredensial tersimpan dengan aman dan digunakan untuk membantu proses pengambilan data inventaris.'
                                : 'Sambungkan akun untuk membantu MTMS mengambil detail reservasi inventaris secara otomatis.'}
                        </p>
                    </div>
                    {profileData?.lensa_acount ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
                            <Icon
                                icon="lucide:user-round"
                                width="16"
                                className="text-muted-foreground"
                                aria-hidden="true"
                            />
                            <span className="text-muted-foreground">
                                Akun terhubung
                            </span>
                            <span className="font-medium text-foreground">
                                {String(profileData.lensa_acount.username)}
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1">
                                <Icon
                                    icon="lucide:lock-keyhole"
                                    width="14"
                                    aria-hidden="true"
                                />
                                Kredensial terenkripsi
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1">
                                <Icon
                                    icon="lucide:shield-check"
                                    width="14"
                                    aria-hidden="true"
                                />
                                Akses latar belakang aman
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2 sm:self-center">
                    <Button
                        type="button"
                        variant={profileData?.lensa_acount ? 'outline' : 'default'}
                        onClick={() => {
                            setLensaUsername(
                                profileData?.lensa_acount?.username
                                    ? String(profileData.lensa_acount.username)
                                    : ''
                            );
                            setLensaPassword('');
                            setIsLensaDialogOpen(true);
                        }}
                        className="w-full sm:w-auto"
                    >
                        <Icon
                            icon={
                                profileData?.lensa_acount
                                    ? 'lucide:refresh-cw'
                                    : 'lucide:link'
                            }
                            width="16"
                            className="mr-2"
                        />
                        {profileData?.lensa_acount ? 'Perbarui Akun' : 'Hubungkan'}
                    </Button>
                    {profileData?.lensa_acount && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteLensa}
                            disabled={isPending}
                            className="w-full sm:w-auto"
                        >
                            <Icon icon="lucide:trash-2" width="16" className="mr-2" />
                            Putus
                        </Button>
                    )}
                </div>
            </div>

            <ModalDialog
                isOpen={isLensaDialogOpen}
                onClose={() => setIsLensaDialogOpen(false)}
                title={
                    profileData?.lensa_acount
                        ? 'Perbarui Akun Lensa'
                        : 'Hubungkan Akun Lensa'
                }
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">
                        Kredensial Anda dienkripsi sebelum disimpan ke database dan hanya
                        digunakan untuk proses scraping otomatis.
                    </p>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="lensa-username">Username Lensa</Label>
                            <Input
                                id="lensa-username"
                                type="text"
                                placeholder="Masukkan username Lensa"
                                value={lensaUsername}
                                onChange={(e) => setLensaUsername(e.target.value)}
                                disabled={isPending}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="lensa-password">Password Lensa</Label>
                            <Input
                                id="lensa-password"
                                type="password"
                                placeholder="Masukkan password Lensa"
                                value={lensaPassword}
                                onChange={(e) => setLensaPassword(e.target.value)}
                                disabled={isPending}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsLensaDialogOpen(false)}
                            disabled={isPending}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveLensa}
                            disabled={isPending}
                        >
                            {isPending ? 'Menyimpan...' : 'Simpan Kredensial'}
                        </Button>
                    </div>
                </div>
            </ModalDialog>
        </StaggerItem>
    );
}
