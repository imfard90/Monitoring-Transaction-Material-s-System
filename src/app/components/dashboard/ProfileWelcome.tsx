import fs from 'node:fs';
import path from 'node:path';
import { Icon } from '@iconify/react';
import { headers } from 'next/headers';
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

    const role = sessionUser.role ?? 'User';
    const branch = sessionUser.branchName ?? '';

    const todayStr = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date());

    return (
        <div className="relative flex items-center justify-between rounded-xl border border-border/80 bg-card/80 backdrop-blur-xs shadow-xs px-3.5 py-2.5 sm:px-4 sm:py-2.5 overflow-hidden transition-all duration-200">
            <div className="flex items-center gap-3 z-10 min-w-0">
                <Avatar className="h-9 w-9 border border-border/70 shadow-xs ring-1 ring-primary/20 shrink-0">
                    {image ? (
                        <AvatarImage
                            src={image}
                            alt={name}
                            className="object-cover object-top h-full w-full"
                        />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-semibold tracking-tight text-foreground truncate">
                            Selamat datang, {name}
                        </span>
                        <span className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_infinite] text-xs">
                            👋
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-[10px] tracking-wide">
                            {role}
                        </span>
                        {branch ? (
                            <>
                                <span className="text-muted-foreground/40">•</span>
                                <span className="truncate">{branch}</span>
                            </>
                        ) : null}
                        {sessionUser.nik ? (
                            <>
                                <span className="text-muted-foreground/40 hidden xs:inline">•</span>
                                <span className="font-mono text-[10px] text-muted-foreground/80 hidden xs:inline">
                                    {sessionUser.nik}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground z-10">
                <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                    <Icon icon="solar:calendar-linear" width={14} className="text-primary/80" />
                    <span className="capitalize">{todayStr}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span>Sistem Aktif</span>
                </div>
            </div>
        </div>
    );
}
