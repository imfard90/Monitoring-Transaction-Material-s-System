import type { Metadata } from 'next';
import UserProfile from '@/app/components/user-profile';
import { getProfileData } from './_actions/profile-actions';

export const metadata: Metadata = {
    title: 'user-profile',
};

const Notes = async () => {
    const { data } = await getProfileData();

    return (
        <>
            <UserProfile profileData={data} />
        </>
    );
};

export default Notes;
