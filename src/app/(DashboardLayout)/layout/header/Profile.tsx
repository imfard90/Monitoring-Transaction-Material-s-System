'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

    const profileImage = user?.nik ? `/images/profile/${user.nik}.png` : undefined;
    const profileFallback =
        user?.name
            ?.split(/\s+/)
            .slice(0, 2)
            .map((part: string) => part[0])
            .join('')
            .toUpperCase() || 'U';

    const renderAvatar = (size: number) => (
        <Avatar className="rounded-full shadow-sm" style={{ width: size, height: size }}>
            {profileImage ? (
                <AvatarImage src={profileImage} alt="" className="object-cover object-top" />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {profileFallback}
            </AvatarFallback>
        </Avatar>
    );

    return (
        <div className="relative group/menu ps-15 shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <span className="hover:text-primary hover:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:bg-lightprimary group-hover/menu:text-primary transition-colors duration-200">
                        {renderAvatar(35)}
                    </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    className="w-screen sm:w-[250px] pb-4 pt-2 rounded-xl shadow-lg border-border"
                >
                    <div className="px-4 py-3 flex items-center gap-3">
                        {renderAvatar(40)}
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
