'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import Link from 'next/link';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { StaggerItem } from '@/components/ui/motion/stagger-item';

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

interface ProfileHeaderProps {
    profileData?: UserProfileData;
}

export function ProfileHeader({ profileData }: ProfileHeaderProps) {
    const profileImage = profileData?.nik ? `/images/profile/${profileData.nik}.png` : undefined;
    const profileInitials =
        profileData?.name
            ?.split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase() || 'U';

    return (
        <StaggerItem>
            <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none overflow-hidden p-0 border-none shadow-sm">
                <div className="relative w-full h-32 sm:h-48 bg-gradient-to-r from-primary/80 to-primary/40">
                    {/* Banner Background */}
                    <div className="absolute inset-0 bg-[url('/images/backgrounds/profile-bg.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                </div>
                <div className="px-6 pb-6 relative">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-12 sm:-mt-16 relative z-10 w-full break-words">
                        <div className="relative">
                            <Avatar className="size-[120px] rounded-full border-4 border-background shadow-lg">
                                {profileImage ? (
                                    <AvatarImage
                                        src={profileImage}
                                        alt=""
                                        className="object-cover object-top"
                                    />
                                ) : null}
                                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                                    {profileInitials}
                                </AvatarFallback>
                            </Avatar>
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
            </Card>
        </StaggerItem>
    );
}
