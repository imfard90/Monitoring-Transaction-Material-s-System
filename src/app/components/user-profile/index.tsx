'use client';
import { Icon } from '@iconify/react/dist/iconify.js';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import {
    deleteLensaAccount,
    saveLensaAccount,
} from '@/app/(DashboardLayout)/user-profile/_actions/lensa-actions';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CardBox from '../shared/CardBox';

const UserProfile = ({ profileData }: { profileData?: UserProfileData }) => {
    const BCrumb = [
        {
            to: '/',
            title: 'Home',
        },
        {
            title: 'User Profile',
        },
    ];

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
            <BreadcrumbComp title="User Profile" items={BCrumb} />
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, staggerChildren: 0.1 }}
                className="flex flex-col gap-6"
            >
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <CardBox className="p-6 overflow-hidden">
                        <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl relative w-full break-words">
                            <div>
                                <Image
                                    src={'/images/profile/user-1.jpg'}
                                    alt="image"
                                    width={80}
                                    height={80}
                                    className="rounded-full"
                                />
                            </div>
                            <div className="flex flex-wrap gap-4 justify-center sm:justify-between items-center w-full">
                                <div className="flex flex-col sm:text-left text-center gap-1.5">
                                    <h5 className="card-title">
                                        {profileData?.employee_name ||
                                            profileData?.name ||
                                            'Unknown User'}
                                    </h5>
                                    <div className="flex flex-wrap items-center gap-1 md:gap-3">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {profileData?.position_name || 'No Position'}
                                        </p>
                                        <div className="hidden h-4 w-px bg-gray-300 dark:bg-gray-700 xl:block"></div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {profileData?.area || 'No Area'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {socialLinks.map((item, index) => (
                                        <Link
                                            key={index}
                                            href={item.href}
                                            target="_blank"
                                            className="flex h-11 w-11 items-center justify-center gap-2 rounded-full shadow-md border border-border hover:bg-gray-50 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                                        >
                                            <Icon icon={item.icon} width="20" height="20" />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardBox>
                </motion.div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="space-y-6 rounded-xl border border-border  md:p-6 p-4 relative w-full break-words"
                    >
                        <h5 className="card-title">Personal Information</h5>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7 2xl:gap-x-32">
                            <div>
                                <p className="text-xs text-gray-500">Name</p>
                                <p>{profileData?.employee_name || profileData?.name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">NIK</p>
                                <p>{profileData?.nik || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Email</p>
                                <p>{profileData?.email || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Account Status</p>
                                <p>
                                    {profileData?.is_active ? (
                                        <span className="text-success">Active</span>
                                    ) : (
                                        <span className="text-error">Inactive</span>
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Employee Status</p>
                                <p>{profileData?.status || '-'}</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="space-y-6 rounded-xl border border-border  md:p-6 p-4 relative w-full break-words"
                    >
                        <h5 className="card-title">Work Details</h5>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7 2xl:gap-x-32">
                            <div>
                                <p className="text-xs text-gray-500">Position</p>
                                <p>{profileData?.position_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Level</p>
                                <p>{profileData?.level_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Mitra</p>
                                <p>{profileData?.mitra_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Branch</p>
                                <p>{profileData?.branch_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Area & Regional</p>
                                <p>
                                    {profileData?.area && profileData?.regional
                                        ? `${profileData.area} / ${profileData.regional}`
                                        : '-'}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className="space-y-6 rounded-xl border border-border md:p-6 p-4 relative w-full break-words"
                    >
                        <div className="flex justify-between items-center">
                            <h5 className="card-title">Lensa Inventory Account</h5>
                        </div>
                        <div className="flex flex-col gap-4">
                            {profileData?.lensa_acount ? (
                                <div className="flex flex-col gap-2 p-4 bg-success/10 border border-success/20 rounded-lg">
                                    <div className="flex items-center gap-2 text-success font-medium">
                                        <Icon icon="lucide:check-circle" width="20" />
                                        <span>Lensa Inventory Connected</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Username: {profileData.lensa_acount.username}
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
                    </motion.div>
                </div>
            </motion.div>

            <Dialog open={isLensaDialogOpen} onOpenChange={setIsLensaDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Lensa Inventory Account</DialogTitle>
                        <DialogDescription>
                            Masukkan kredensial akun Lensa Inventory kamu. Password akan dienkripsi
                            secara aman.
                        </DialogDescription>
                    </DialogHeader>

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

                    <DialogFooter>
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default UserProfile;
