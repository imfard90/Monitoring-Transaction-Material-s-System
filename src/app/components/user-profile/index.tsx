'use client';
import { Icon } from '@iconify/react/dist/iconify.js';
import Image from 'next/image';
import Link from 'next/link';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
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

    return (
        <>
            <BreadcrumbComp title="User Profile" items={BCrumb} />
            <div className="flex flex-col gap-6">
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

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-6 rounded-xl border border-border  md:p-6 p-4 relative w-full break-words">
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
                    </div>

                    <div className="space-y-6 rounded-xl border border-border  md:p-6 p-4 relative w-full break-words">
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
                    </div>
                </div>
            </div>
        </>
    );
};

export default UserProfile;
