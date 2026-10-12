export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import UserProfile from '@/app/components/user-profile';
import { getProfileData } from './_actions/profile-actions';

export const metadata: Metadata = {
    title: 'Profil Pengguna',
    description: 'Pengaturan akun, sesi, dan integrasi API MTMS',
};

import { Footer } from '@/app/components/dashboard/Footer';

const UserProfilePage = async () => {
    const { data } = await getProfileData();

    return (
        <div className="flex flex-col flex-1 h-full gap-6">
            <UserProfile profileData={data} />
            <Footer />
        </div>
    );
};

export default UserProfilePage;
