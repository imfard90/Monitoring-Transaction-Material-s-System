'use client';

import { Icon } from '@iconify/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    const router = useRouter();
    return (
        <div className="relative group/menu ps-15 shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <span className="hover:text-primary hover:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:bg-lightprimary group-hover/menu:text-primary">
                        <Image
                            src="/images/profile/user-1.jpg"
                            alt="logo"
                            height={35}
                            width={35}
                            className="rounded-full"
                        />
                    </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    className="w-screen sm:w-[200px] pb-4 pt-2 rounded-sm"
                >
                    <SimpleBar>
                        {profileData.profileDD.map((item, index) => (
                            <DropdownMenuItem key={index} asChild>
                                <Link
                                    href={item.url}
                                    className="px-4 py-2 flex justify-between items-center group/link w-full hover:bg-lightprimary hover:text-primary"
                                >
                                    <div className="flex items-center gap-3 w-full">
                                        <Icon
                                            icon={item.icon}
                                            className="text-lg text-muted-foreground group-hover/link:text-primary"
                                        />
                                        <h5 className="mb-0 text-sm text-muted-foreground group-hover/link:text-primary">
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
                            variant="outline"
                            className="w-full rounded-md"
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
