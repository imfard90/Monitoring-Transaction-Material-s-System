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
        <div className="relative flex items-center justify-between rounded-xl border border-border/80 bg-linear-to-r from-primary/10 via-card to-card shadow-xs px-4 py-3 sm:px-5 sm:py-3.5 overflow-hidden transition-all duration-200">
            {/* Subtle ambient blur glow */}
            <div
                className="absolute -left-10 -top-10 w-40 h-40 bg-primary/15 rounded-full blur-3xl pointer-events-none"
                aria-hidden="true"
            />

            <div className="flex items-center gap-3.5 z-10 min-w-0">
                <Avatar className="h-11 w-11 sm:h-12 sm:w-12 border-2 border-background shadow-sm ring-2 ring-primary/25 shrink-0">
                    {image ? (
                        <AvatarImage
                            src={image}
                            alt={name}
                            className="object-cover object-top h-full w-full"
                        />
                    ) : null}
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-sm">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>

                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">
                            Selamat datang, {name}
                        </h2>
                        <span className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_infinite] text-sm">
                            👋
                        </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-semibold text-[11px] tracking-wide border border-primary/20">
                            <Icon icon="solar:shield-user-bold-duotone" width={13} />
                            {role}
                        </span>

                        {branch ? (
                            <>
                                <span className="text-muted-foreground/40">•</span>
                                <span className="inline-flex items-center gap-1 text-foreground/80 truncate">
                                    <Icon
                                        icon="solar:map-point-linear"
                                        width={13}
                                        className="text-primary/70 shrink-0"
                                    />
                                    {branch}
                                </span>
                            </>
                        ) : null}

                        {sessionUser.nik ? (
                            <>
                                <span className="text-muted-foreground/40 hidden xs:inline">•</span>
                                <span className="font-mono text-[11px] text-muted-foreground hidden xs:inline">
                                    NIK: {sessionUser.nik}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground z-10">
                <div className="flex items-center gap-1.5 font-medium text-foreground/80 bg-background/50 px-3 py-1.5 rounded-lg border border-border/50">
                    <Icon icon="solar:calendar-linear" width={15} className="text-primary" />
                    <span className="capitalize">{todayStr}</span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span>Sistem Aktif</span>
                </div>
            </div>
        </div>
    );
}
