'use client';

import type { UserProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { ProfileApiKeyCard } from './ProfileApiKeyCard';
import { ProfileHeader } from './ProfileHeader';
import { ProfileLensaCard } from './ProfileLensaCard';
import { ProfilePersonalInfoCard } from './ProfilePersonalInfoCard';
import { ProfileWorkDetailsCard } from './ProfileWorkDetailsCard';

const UserProfile = ({ profileData }: { profileData?: UserProfileData }) => {
    return (
        <StaggerContainer className="flex flex-col gap-6">
            <ProfileHeader profileData={profileData} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ProfilePersonalInfoCard profileData={profileData} />
                <ProfileWorkDetailsCard profileData={profileData} />
                <ProfileLensaCard profileData={profileData} />
                <ProfileApiKeyCard profileData={profileData} />
            </div>
        </StaggerContainer>
    );
};

export default UserProfile;
