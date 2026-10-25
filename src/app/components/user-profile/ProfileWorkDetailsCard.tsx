'use client';

import { Icon } from '@iconify/react/dist/iconify.js';
import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { StaggerItem } from '@/components/ui/motion/stagger-item';

interface ProfileWorkDetailsCardProps {
    profileData?: UserProfileData;
}

export function ProfileWorkDetailsCard({ profileData }: ProfileWorkDetailsCardProps) {
    return (
        <StaggerItem className="space-y-4 rounded-xl border border-border bg-card md:px-6 md:py-4 px-4 py-3 relative w-full break-words shadow-sm hover:shadow-md transition-shadow duration-300">
            <h5 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Icon icon="lucide:briefcase" className="text-primary" width="20" /> Work Details
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
    );
}
