import fs from 'node:fs';
import path from 'node:path';
import { Icon } from '@iconify/react';
import { headers } from 'next/headers';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { auth } from '@/lib/auth';
import { getPageSessionUser } from '@/lib/auth-server';

import { getInitials } from '@/lib/avatar';

export default async function ProfileWelcome() {
    const sessionUser = await getPageSessionUser();
    const session = await auth.api.getSession({ headers: await headers() });

    const name = session?.user?.name ?? 'User';

    const publicDir = path.join(process.cwd(), 'public');
    const jpgProfile = path.join(publicDir, `images/profile/${sessionUser.nik}.jpg`);
    const pngProfile = path.join(publicDir, `images/profile/${sessionUser.nik}.png`);
    const image = session?.user?.image
        ? session.user.image
        : fs.existsSync(jpgProfile)
          ? `/images/profile/${sessionUser.nik}.jpg`
          : fs.existsSync(pngProfile)
            ? `/images/profile/${sessionUser.nik}.png`
            : null;

    const role = sessionUser.role ?? '';
    const branch = sessionUser.branchName ?? '';

    return (
        <div className="relative flex items-center justify-between bg-linear-to-br from-primary/10 via-background to-background border border-primary/10 shadow-sm rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-5 z-10">
                <Avatar className="h-16 w-16 border-2 border-background shadow-md ring-2 ring-primary/20">
                    {image ? (
                        <AvatarImage
                            src={image}
                            alt={name}
                            className="object-cover object-top h-full w-full"
                        />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        Selamat datang, {name}{' '}
                        <span className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_infinite]">
                            👋
                        </span>
                    </h2>
                    <p className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                            <Icon icon="solar:shield-user-bold-duotone" width={14} />
                        </span>
                        {role}
                        {branch ? <span className="text-primary/40">•</span> : ''}
                        {branch ? branch : ''}
                    </p>
                </div>
            </div>

            {/* Decorative background elements */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute right-20 -bottom-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />

            <div className="hidden sm:block absolute right-7 bottom-0 z-10 drop-shadow-xl transition-transform hover:scale-105 duration-500">
                <Image
                    src="/images/dashboard/customer-support-img.png"
                    alt=""
                    width={145}
                    height={95}
                    sizes="145px"
                    className="h-auto w-[145px] object-contain"
                />
            </div>
        </div>
    );
}
