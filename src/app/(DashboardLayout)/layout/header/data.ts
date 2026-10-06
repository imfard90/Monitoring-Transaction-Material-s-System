//  Profile Data
interface ProfileType {
    title: string;
    img: string;
    subtitle: string;
    url: string;
    icon: string;
}

const profileDD: ProfileType[] = [
    {
        img: '/images/svgs/icon-account.svg',
        title: 'My Profile',
        subtitle: 'Account settings',
        icon: 'solar:user-circle-linear',
        url: '/user-profile',
    },
];

export { profileDD };
