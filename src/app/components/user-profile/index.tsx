'use client';
import { Icon } from '@iconify/react/dist/iconify.js';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
    deleteLensaAccount,
    saveLensaAccount,
} from '@/app/(DashboardLayout)/user-profile/_actions/lensa-actions';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { ModalDialog } from '@/app/components/shared/ModalDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { authClient } from '@/lib/auth-client';
import CardBox from '../shared/CardBox';

const UserProfile = ({ profileData }: { profileData?: UserProfileData }) => {
    const socialLinks = [
        {
            href: 'https://www.facebook.com/wrappixel',
            icon: 'streamline-logos:facebook-logo-2-solid',
        },
        {
            href: 'https://twitter.com/wrappixel',
            icon: 'streamline-logos:x-twitter-logo-solid',
        },
        { href: 'https://github.com/wrappixel', icon: 'ion:logo-github' },
        {
            href: 'https://dribbble.com/wrappixel',
            icon: 'streamline-flex:dribble-logo-remix',
        },
    ];

    const [isLensaDialogOpen, setIsLensaDialogOpen] = useState(false);
    const [lensaUsername, setLensaUsername] = useState('');
    const [lensaPassword, setLensaPassword] = useState('');
    const [isPending, startTransition] = useTransition();
    const [isSendingVerification, setIsSendingVerification] = useState(false);
    const [imgSrc, setImgSrc] = useState('/images/profile/user-1.jpg');
    const [imgErrorCount, setImgErrorCount] = useState(0);

    useEffect(() => {
        if (profileData?.nik) {
            setImgSrc(`/images/profile/${profileData.nik}.jpg`);
            setImgErrorCount(0);
        }
    }, [profileData?.nik]);

    const handleImageError = () => {
        if (imgErrorCount === 0 && profileData?.nik) {
            setImgSrc(`/images/profile/${profileData.nik}.png`);
            setImgErrorCount(1);
        } else {
            setImgSrc('/images/profile/user-1.jpg');
        }
    };

    const handleSendVerification = async () => {
        if (!profileData?.email) return;
        setIsSendingVerification(true);
        try {
            const { error } = await authClient.sendVerificationEmail({
                email: profileData.email,
                callbackURL: '/user-profile',
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

    const handleSaveLensa = async () => {
        if (!lensaUsername || !lensaPassword) {
            toast.error('Username dan Password harus diisi');
            return;
        }

        startTransition(async () => {
            const result = await saveLensaAccount(lensaUsername, lensaPassword);
            if (result.success) {
                toast.success('Lensa Account berhasil disimpan');
                setIsLensaDialogOpen(false);
                setLensaUsername('');
                setLensaPassword('');
            } else {
                toast.error(result.error || 'Gagal menyimpan akun Lensa');
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
        <>
            <StaggerContainer className="flex flex-col gap-6">
                <StaggerItem>
                    <CardBox className="overflow-hidden p-0 border-none shadow-sm">
                        <div className="relative w-full h-32 sm:h-48 bg-gradient-to-r from-primary/80 to-primary/40">
                            {/* Banner Background */}
                            <div className="absolute inset-0 bg-[url('/images/backgrounds/profile-bg.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                        </div>
                        <div className="px-6 pb-6 relative">
                            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-12 sm:-mt-16 relative z-10 w-full break-words">
                                <div className="relative">
                                    <Image
                                        src={imgSrc}
                                        alt="Profile Picture"
                                        width={120}
                                        height={120}
                                        className="rounded-full object-cover object-top border-4 border-background shadow-lg bg-background"
                                        onError={handleImageError}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-4 justify-center sm:justify-between items-center w-full mt-2 sm:mt-0">
                                    <div className="flex flex-col sm:text-left text-center gap-1.5">
                                        <h5 className="text-2xl font-semibold text-foreground">
                                            {profileData?.employee_name ||
                                                profileData?.name ||
                                                'Unknown User'}
                                        </h5>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 md:gap-3">
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <Icon icon="lucide:briefcase" width="16" />
                                                <span>
                                                    {profileData?.position_name || 'No Position'}
                                                </span>
                                            </div>
                                            <div className="hidden h-4 w-px bg-border xl:block"></div>
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <Icon icon="lucide:map-pin" width="16" />
                                                <span>{profileData?.area || 'No Area'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {socialLinks.map((item, index) => (
                                            <Link
                                                key={item.href || index}
                                                href={item.href}
                                                target="_blank"
                                                className="flex h-10 w-10 items-center justify-center gap-2 rounded-full shadow-sm border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                            >
                                                <Icon icon={item.icon} width="18" height="18" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardBox>
                </StaggerItem>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <StaggerItem className="space-y-6 rounded-xl border border-border bg-card md:p-6 p-4 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
                        <h5 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Icon icon="lucide:user" className="text-primary" width="20" /> Personal
                            Information
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
                                <p className="text-sm font-medium text-foreground">
                                    {profileData?.nik || '-'}
                                </p>
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
                                                    className="h-auto p-0 text-xs text-blue-500"
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
                                    Account Status
                                </p>
                                <p>
                                    {profileData?.is_active ? (
                                        <span className="text-success">Active</span>
                                    ) : (
                                        <span className="text-error">Inactive</span>
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

                    <StaggerItem className="space-y-6 rounded-xl border border-border bg-card md:p-6 p-4 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
                        <h5 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Icon icon="lucide:briefcase" className="text-primary" width="20" />{' '}
                            Work Details
                        </h5>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7 2xl:gap-x-32">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Position
                                </p>
                                <p className="text-sm font-medium text-foreground">
                                    {profileData?.position_name || '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Level
                                </p>
                                <p className="text-sm font-medium text-foreground">
                                    {profileData?.level_name || '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Mitra
                                </p>
                                <p className="text-sm font-medium text-foreground">
                                    {profileData?.mitra_name || '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Branch
                                </p>
                                <p className="text-sm font-medium text-foreground">
                                    {profileData?.branch_name || '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Area & Regional
                                </p>
                                <p>
                                    {profileData?.area && profileData?.regional
                                        ? `${profileData.area} / ${profileData.regional}`
                                        : '-'}
                                </p>
                            </div>
                        </div>
                    </StaggerItem>

                    <StaggerItem className="space-y-6 rounded-xl border border-border bg-card md:p-6 p-4 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="flex justify-between items-center">
                            <h5 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Icon icon="lucide:database" className="text-primary" width="20" />{' '}
                                Lensa Inventory Account
                            </h5>
                        </div>
                        <div className="flex flex-col gap-4">
                            {profileData?.lensa_acount ? (
                                <div className="flex flex-col gap-2 p-4 bg-success/10 border border-success/20 rounded-lg">
                                    <div className="flex items-center gap-2 text-success font-medium">
                                        <Icon icon="lucide:check-circle" width="20" />
                                        <span>Lensa Inventory Connected</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Username: {String(profileData.lensa_acount.username)}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-fit"
                                            onClick={() => setIsLensaDialogOpen(true)}
                                        >
                                            Update Account
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="w-fit"
                                            onClick={handleDeleteLensa}
                                            disabled={isPending}
                                        >
                                            <Icon
                                                icon="lucide:unplug"
                                                width="16"
                                                className="mr-1"
                                            />
                                            Disconnect
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 p-4 bg-warning/10 border border-warning/20 rounded-lg">
                                    <div className="flex items-center gap-2 text-warning font-medium">
                                        <Icon icon="lucide:alert-circle" width="20" />
                                        <span>Not Connected</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Hubungkan akun Lensa kamu agar sistem dapat mengambil detail
                                        reservasi secara otomatis.
                                    </p>
                                    <Button
                                        size="sm"
                                        className="w-fit mt-2"
                                        onClick={() => setIsLensaDialogOpen(true)}
                                    >
                                        Connect Account
                                    </Button>
                                </div>
                            )}
                        </div>
                    </StaggerItem>
                </div>
            </StaggerContainer>

            <ModalDialog
                isOpen={isLensaDialogOpen}
                onClose={() => setIsLensaDialogOpen(false)}
                title="Lensa Inventory Account"
            >
                <p className="text-sm text-gray-500">
                    Masukkan kredensial akun Lensa Inventory kamu. Password akan dienkripsi secara
                    aman.
                </p>

                <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="username">Username Lensa</Label>
                        <Input
                            id="username"
                            value={lensaUsername}
                            onChange={(e) => setLensaUsername(e.target.value)}
                            placeholder="Misal: 16021537"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password Lensa</Label>
                        <Input
                            id="password"
                            type="password"
                            value={lensaPassword}
                            onChange={(e) => setLensaPassword(e.target.value)}
                            placeholder="********"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                    <Button
                        variant="outline"
                        onClick={() => setIsLensaDialogOpen(false)}
                        disabled={isPending}
                    >
                        Batal
                    </Button>
                    <Button onClick={handleSaveLensa} disabled={isPending}>
                        {isPending ? 'Menyimpan...' : 'Simpan Kredensial'}
                    </Button>
                </div>
            </ModalDialog>
        </>
    );
};

export default UserProfile;
