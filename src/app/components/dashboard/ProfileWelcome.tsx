import fs from 'fs';
import path from 'path';
import { Icon } from '@iconify/react';
import { headers } from 'next/headers';
import Image from 'next/image';
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
        <div className="relative flex items-center justify-between bg-lightsecondary dark:bg-lightsecondary rounded-lg p-6 overflow-hidden">
            <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border-2 border-primary/20">
                    {image ? <AvatarImage src={image} alt={name} className="object-cover object-top h-full w-full" /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5">
                    <h5 className="card-title">Selamat datang, {name} 👋</h5>
                    <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                        <Icon icon="solar:shield-user-linear" width={14} />
                        {role}
                        {branch ? ` — ${branch}` : ''}
                    </p>
                </div>
            </div>
            <div className="hidden sm:block absolute right-7 bottom-0">
                <Image
                    src="/images/dashboard/customer-support-img.png"
                    alt="support-img"
                    width={145}
                    height={95}
                />
            </div>
        </div>
    );
}
