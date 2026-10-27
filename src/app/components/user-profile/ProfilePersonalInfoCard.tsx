'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import { useState } from 'react';
import { toast } from 'sonner';
import type { UserProfileData } from '@/app/(DashboardLayout)/management/user-profile/_actions/profile-actions';
import { Button } from '@/components/ui/button';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { authClient } from '@/lib/auth-client';

interface ProfilePersonalInfoCardProps {
    profileData?: UserProfileData;
}

export function ProfilePersonalInfoCard({ profileData }: ProfilePersonalInfoCardProps) {
    const [isSendingVerification, setIsSendingVerification] = useState(false);

    const handleSendVerification = async () => {
        if (!profileData?.email) return;
        setIsSendingVerification(true);
        try {
            const { error } = await authClient.sendVerificationEmail({
                email: profileData.email,
                callbackURL: '/management/user-profile',
            });
            if (error) {
                toast.error(error.message || 'Gagal mengirim link verifikasi');
            } else {
                toast.success('Link verifikasi berhasil dikirim ke email Anda');
            }
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message || 'Terjadi kesalahan saat mengirim email');
        } finally {
            setIsSendingVerification(false);
        }
    };

    return (
        <StaggerItem className="space-y-4 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
            <h5 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Icon icon="lucide:user" className="text-primary" width="20" /> Personal Information
            </h5>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7 2xl:gap-x-32">
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Name
                    </p>
                    <p className="text-sm font-medium text-foreground">
                        {profileData?.employee_name || profileData?.name || '-'}
                    </p>
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        NIK
                    </p>
                    <p className="text-sm font-medium text-foreground">{profileData?.nik || '-'}</p>
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Email
                    </p>
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                            {profileData?.email || '-'}
                        </p>
                        {profileData?.email &&
                            (profileData.emailVerified ? (
                                <span
                                    className="flex items-center text-success"
                                    title="Email Verified"
                                >
                                    <Icon icon="lucide:check-circle-2" width="16" />
                                </span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span
                                        className="flex items-center text-warning"
                                        title="Email Not Verified"
                                    >
                                        <Icon icon="lucide:alert-circle" width="16" />
                                    </span>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs text-primary"
                                        onClick={handleSendVerification}
                                        disabled={isSendingVerification}
                                    >
                                        {isSendingVerification
                                            ? 'Mengirim...'
                                            : 'Kirim Link Verifikasi'}
                                    </Button>
                                </div>
                            ))}
                    </div>
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Status Akun
                    </p>
                    <p>
                        {profileData?.is_active ? (
                            <span className="text-success font-medium">Aktif</span>
                        ) : (
                            <span className="text-destructive font-medium">Nonaktif</span>
                        )}
                    </p>
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Employee Status
                    </p>
                    <p className="text-sm font-medium text-foreground">
                        {profileData?.status || '-'}
                    </p>
                </div>
            </div>
        </StaggerItem>
    );
}
