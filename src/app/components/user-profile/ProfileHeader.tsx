'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import type { UserProfileData } from '@/app/(DashboardLayout)/management/user-profile/_actions/profile-actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getInitials } from '@/lib/avatar';
import { useProfileAvatar } from '@/lib/avatar-client';

interface ProfileHeaderProps {
    profileData?: UserProfileData;
}

export function ProfileHeader({ profileData }: ProfileHeaderProps) {
    const { src: avatarSrc, onError: handleAvatarError } = useProfileAvatar(profileData?.nik);
    const profileInitials = getInitials(profileData?.name);

    return (
        <StaggerItem>
            <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none overflow-hidden p-0 border-none">
                <div className="relative w-full h-36 sm:h-52 bg-gradient-to-r from-primary/80 to-primary/40">
                    {/* Banner Background */}
                    <div className="absolute inset-0 bg-[url('/images/backgrounds/profile-bg.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay" />
                </div>
                <div className="px-6 pb-5 relative">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-20 sm:-mt-28 relative z-10 w-full break-words">
                        {/* Avatar Squircle Premium Frame */}
                        <div className="relative group shrink-0">
                            {/* Ambient Glow Aura */}
                            <div className="absolute -inset-1.5 rounded-[2.2rem] bg-gradient-to-tr from-primary/70 via-emerald-400/40 to-primary/80 blur-md opacity-60 group-hover:opacity-95 transition-opacity duration-500 motion-reduce:transition-none" />

                            {/* Outer Gradient Squircle Ring */}
                            <div className="relative p-[3.5px] rounded-[2.2rem] bg-gradient-to-tr from-primary via-emerald-400 to-primary/70 shadow-xl shadow-primary/25">
                                {/* Inner Contrast Separation Ring */}
                                <div className="p-[3px] rounded-[2rem] bg-background shadow-inner">
                                    <Avatar className="w-[130px] h-[155px] sm:w-[145px] sm:h-[175px] rounded-[1.85rem] overflow-hidden border border-border/40 shadow-inner bg-muted/40">
                                        {avatarSrc ? (
                                            <AvatarImage
                                                src={avatarSrc}
                                                alt={profileData?.name || ''}
                                                onError={handleAvatarError}
                                                className="object-cover object-top h-full w-full transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                                            />
                                        ) : null}
                                        <AvatarFallback className="rounded-[1.85rem] bg-gradient-to-br from-primary/20 via-primary/10 to-background text-primary text-3xl font-bold tracking-wider">
                                            {profileInitials}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            </div>

                            {/* Status Indicator Badge */}
                            {profileData?.is_active && (
                                <div
                                    role="status"
                                    className="absolute -bottom-1 -right-1 sm:-bottom-1.5 sm:-right-1.5 z-20 flex items-center justify-center p-1 rounded-full bg-background border-2 border-background shadow-lg"
                                    title="Status Akun Aktif"
                                    aria-label="Status Akun Aktif"
                                >
                                    <span className="relative flex h-3.5 w-3.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-emerald-600" />
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Nama & Detail Jabatan (Diangkat ke Atas) */}
                        <div className="flex flex-col sm:text-left text-center gap-2 sm:pb-3 w-full">
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                                <h5 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                                    {profileData?.employee_name ||
                                        profileData?.name ||
                                        'Unknown User'}
                                </h5>
                                {profileData?.nik && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-muted text-muted-foreground border border-border/60">
                                        {profileData.nik}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 md:gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                    <Icon
                                        icon="lucide:briefcase"
                                        width="16"
                                        className="text-primary"
                                    />
                                    <span className="font-medium text-foreground/85">
                                        {profileData?.position_name || 'No Position'}
                                    </span>
                                </div>
                                <div className="hidden h-3.5 w-px bg-border sm:block" />
                                <div className="flex items-center gap-1.5">
                                    <Icon
                                        icon="lucide:map-pin"
                                        width="16"
                                        className="text-primary"
                                    />
                                    <span>
                                        {profileData?.area || profileData?.branch_name || 'No Area'}
                                    </span>
                                </div>
                                {profileData?.regional && (
                                    <>
                                        <div className="hidden h-3.5 w-px bg-border sm:block" />
                                        <div className="flex items-center gap-1.5">
                                            <Icon
                                                icon="lucide:building-2"
                                                width="16"
                                                className="text-primary"
                                            />
                                            <span>{profileData.regional}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </StaggerItem>
    );
}
