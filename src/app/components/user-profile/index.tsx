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
import {
    type UserProfileData,
    deleteUserApiKey,
    generateUserApiKey,
} from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
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
    const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
    const [isKeyCopied, setIsKeyCopied] = useState(false);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);

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
                    <StaggerItem className="space-y-4 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
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
                                        <span className="text-destructive font-medium">
                                            Nonaktif
                                        </span>
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

                    <StaggerItem className="space-y-4 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
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

                    <StaggerItem className="space-y-3 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                                    <img
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
                                        Kelola koneksi untuk pengambilan detail reservasi secara
                                        otomatis.
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
                                                icon="lucide:refresh-cw"
                                                width="14"
                                                aria-hidden="true"
                                            />
                                            Dapat diputus kapan saja
                                        </span>
                                    </div>
                                )}
                                {profileData?.lensa_acount ? (
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
                                            aria-hidden="true"
                                        />
                                        {isPending ? 'Memutus koneksi...' : 'Disconnect'}
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="w-fit"
                                        onClick={() => setIsLensaDialogOpen(true)}
                                    >
                                        <Icon
                                            icon="lucide:link"
                                            width="16"
                                            className="mr-1"
                                            aria-hidden="true"
                                        />
                                        Connect Account
                                    </Button>
                                )}
                            </div>

                            <div
                                className="relative mx-auto flex h-36 w-full max-w-52 items-center justify-center sm:h-40 sm:w-48"
                                aria-hidden="true"
                            >
                                <div className="absolute inset-3 rounded-full bg-primary/5" />
                                <div className="absolute inset-6 rounded-full border border-dashed border-primary/20" />
                                <div className="absolute left-3 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
                                    <Icon icon="lucide:package" width="20" />
                                </div>
                                <div className="absolute bottom-5 left-7 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
                                    <Icon icon="lucide:boxes" width="18" />
                                </div>
                                <div className="absolute right-4 top-8 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
                                    <Icon icon="lucide:scan-line" width="18" />
                                </div>
                                <svg
                                    viewBox="0 0 120 100"
                                    className="relative h-28 w-32 text-primary drop-shadow-sm"
                                    fill="none"
                                >
                                    <path
                                        d="M18 37 60 15l42 22v45L60 96 18 82V37Z"
                                        className="fill-primary/10 stroke-primary/40"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="m18 37 42 23 42-23M60 60v36M39 26l42 22v15"
                                        className="stroke-primary/50"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="m48 44 12 7 12-7v14l-12 7-12-7V44Z"
                                        className="fill-card stroke-primary"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M52 54h16"
                                        className="stroke-primary/50"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                    <circle cx="60" cy="8" r="3" className="fill-primary/50" />
                                </svg>
                                <div className="absolute bottom-1 right-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                                    <span
                                        className={`h-2 w-2 rounded-full ${profileData?.lensa_acount ? 'bg-success' : 'bg-muted-foreground/50'}`}
                                    />
                                    {profileData?.lensa_acount
                                        ? 'Koneksi aktif'
                                        : 'Menunggu koneksi'}
                                </div>
                            </div>
                        </div>
                    </StaggerItem>

                    <StaggerItem className="space-y-3 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                                    <img
                                        src="/images/svgs/icon-api-key.svg"
                                        alt="API Key"
                                        width={32}
                                        height={32}
                                        className="text-primary w-8 h-8"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="text-lg font-semibold text-foreground">
                                        MTMS Public API
                                    </h5>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        Generate kunci akses untuk integrasi sistem eksternal via
                                        REST API.
                                    </p>
                                </div>
                            </div>
                            {profileData?.has_api_key ? (
                                <span
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${profileData.appr_api ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}
                                >
                                    <Icon
                                        icon={
                                            profileData.appr_api
                                                ? 'lucide:check-circle'
                                                : 'lucide:clock'
                                        }
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
                                        Akses data secara otomatis, dibatasi 1 request per 5 menit
                                        per akun.
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
                                                        profileData.appr_api
                                                            ? 'text-success'
                                                            : 'text-warning'
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
                                {/* Main API Node */}
                                <div className="relative">
                                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg animate-pulse" />
                                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-500">
                                        <Icon
                                            icon="lucide:server"
                                            width="28"
                                            className="text-primary/80"
                                        />
                                    </div>
                                </div>

                                {/* Connected Nodes */}
                                <div className="absolute top-1 left-3">
                                    <div className="w-7 h-7 rounded-lg bg-background/90 border border-border/60 flex items-center justify-center shadow-sm hover:scale-110 transition-transform duration-300">
                                        <Icon
                                            icon="lucide:code-2"
                                            width="12"
                                            className="text-primary/70"
                                        />
                                    </div>
                                </div>
                                <div className="absolute top-4 right-0">
                                    <div className="w-6 h-6 rounded-lg bg-background/90 border border-border/60 flex items-center justify-center shadow-sm hover:scale-110 transition-transform duration-300">
                                        <Icon
                                            icon="lucide:webhook"
                                            width="10"
                                            className="text-primary/60"
                                        />
                                    </div>
                                </div>
                                <div className="absolute bottom-3 left-1">
                                    <div className="w-5 h-5 rounded-full bg-background/90 border border-border/60 flex items-center justify-center shadow-sm">
                                        <Icon
                                            icon="lucide:database"
                                            width="9"
                                            className="text-primary/50"
                                        />
                                    </div>
                                </div>
                                <div className="absolute bottom-0 right-4">
                                    <div className="w-5 h-5 rounded-full bg-success/20 border border-success/30 flex items-center justify-center shadow-sm">
                                        <Icon
                                            icon="lucide:arrow-right"
                                            width="8"
                                            className="text-success/80"
                                        />
                                    </div>
                                </div>

                                {/* Connection Lines SVG */}
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
                    </StaggerItem>
                </div>
            </StaggerContainer>

            <ModalDialog
                isOpen={isLensaDialogOpen}
                onClose={() => setIsLensaDialogOpen(false)}
                title="Hubungkan Akun Lensa"
            >
                <p className="text-sm text-muted-foreground">
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
                        {isPending ? 'Menghubungkan...' : 'Hubungkan Akun'}
                    </Button>
                </div>
            </ModalDialog>
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
        </>
    );
};

export default UserProfile;
