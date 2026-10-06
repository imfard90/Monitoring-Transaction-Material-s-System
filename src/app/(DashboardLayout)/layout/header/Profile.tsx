'use client';

import { Icon } from '@iconify/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SimpleBar from 'simplebar-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import * as profileData from './data';

const Profile = () => {
    const _router = useRouter();
    const { data: session } = authClient.useSession();
    // biome-ignore lint/suspicious/noExplicitAny: Better Auth client types might not include custom fields
    const user = session?.user as any;

    const [imgSrc, setImgSrc] = useState('/images/profile/user-1.jpg');

    useEffect(() => {
        if (user?.nik) {
            const img = new window.Image();
            img.src = `/images/profile/${user.nik}.jpg`;
            img.onload = () => setImgSrc(`/images/profile/${user.nik}.jpg`);
            img.onerror = () => {
                const imgPng = new window.Image();
                imgPng.src = `/images/profile/${user.nik}.png`;
                imgPng.onload = () => setImgSrc(`/images/profile/${user.nik}.png`);
                imgPng.onerror = () => setImgSrc('/images/profile/user-1.jpg');
            };
        }
    }, [user?.nik]);

    return (
        <div className="relative group/menu ps-15 shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <span className="hover:text-primary hover:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:bg-lightprimary group-hover/menu:text-primary transition-colors duration-200">
                        <Image
                            src={imgSrc}
                            alt="Profile"
                            height={35}
                            width={35}
                            className="rounded-full object-cover object-top h-[35px] w-[35px] shadow-sm"
                        />
                    </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    className="w-screen sm:w-[250px] pb-4 pt-2 rounded-xl shadow-lg border-border"
                >
                    <div className="px-4 py-3 flex items-center gap-3">
                        <Image
                            src={imgSrc}
                            alt="Profile"
                            height={40}
                            width={40}
                            className="rounded-full object-cover object-top h-[40px] w-[40px] shadow-sm"
                        />
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-semibold truncate text-foreground">
                                {user?.name || 'User'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                                {user?.email || 'user@example.com'}
                            </span>
                        </div>
                    </div>

                    <DropdownMenuSeparator className="my-1" />

                    <SimpleBar>
                        {profileData.profileDD.map((item, index) => (
                            <DropdownMenuItem
                                key={item.title || index}
                                asChild
                                className="cursor-pointer"
                            >
                                <Link
                                    href={item.url}
                                    className="px-4 py-2.5 flex justify-between items-center group/link w-full hover:bg-muted/50 transition-colors duration-200"
                                >
                                    <div className="flex items-center gap-3 w-full">
                                        <Icon
                                            icon={item.icon}
                                            className="text-lg text-muted-foreground group-hover/link:text-primary transition-colors duration-200"
                                        />
                                        <h5 className="mb-0 text-sm font-medium text-muted-foreground group-hover/link:text-primary transition-colors duration-200">
                                            {item.title}
                                        </h5>
                                    </div>
                                </Link>
                            </DropdownMenuItem>
                        ))}
                    </SimpleBar>

                    <DropdownMenuSeparator className="my-2" />

                    <div className="px-4">
                        <Button
                            variant="destructive"
                            className="w-full rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                            onClick={async () => {
                                await authClient.signOut();
                                window.location.href = '/auth/login';
                            }}
                        >
                            Logout
                        </Button>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default Profile;
