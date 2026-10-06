import { Icon } from '@iconify/react';
import fs from 'fs';
import { headers } from 'next/headers';
import Image from 'next/image';
import path from 'path';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';

function getInitials(name: string): string {
    return name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}

export default async function ProfileWelcome() {
    const [session, sessionUser] = await Promise.all([
        auth.api.getSession({ headers: await headers() }),
        getSessionUser(),
    ]);

    const name = session?.user?.name ?? 'User';

    let image = null;
    const publicDir = path.join(process.cwd(), 'public');
    if (fs.existsSync(path.join(publicDir, `images/profile/${sessionUser.nik}.png`))) {
        image = `/images/profile/${sessionUser.nik}.png`;
    } else if (fs.existsSync(path.join(publicDir, `images/profile/${sessionUser.nik}.jpg`))) {
        image = `/images/profile/${sessionUser.nik}.jpg`;
    }

    const role = sessionUser.role ?? '';
    const branch = sessionUser.branchName ?? '';

    return (
        <div className="relative flex items-center justify-between bg-gradient-to-br from-primary/10 via-background to-background border border-primary/10 shadow-sm rounded-2xl p-6 overflow-hidden">
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
                    <h5 className="text-2xl font-bold tracking-tight text-foreground">
                        Selamat datang, {name}{' '}
                        <span className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_infinite]">
                            👋
                        </span>
                    </h5>
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
                    alt="support-img"
                    width={145}
                    height={95}
                    className="object-contain"
                />
            </div>
        </div>
    );
}
