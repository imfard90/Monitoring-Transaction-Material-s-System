import fs from 'node:fs';
import path from 'node:path';
import { Icon } from '@iconify/react';
import { headers } from 'next/headers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { auth } from '@/lib/auth';
import { getPageSessionUser } from '@/lib/auth-server';
import { getInitials } from '@/lib/avatar';

function getTimeGreeting(date = new Date()): {
    text: string;
    icon: string;
    iconColor: string;
} {
    const hourStr = new Intl.DateTimeFormat('id-ID', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Jakarta',
    }).format(date);
    const hour = Number.parseInt(hourStr, 10);

    if (hour >= 4 && hour < 11) {
        return {
            text: 'Selamat pagi',
            icon: 'solar:sun-2-bold-duotone',
            iconColor: 'text-amber-500',
        };
    }
    if (hour >= 11 && hour < 15) {
        return {
            text: 'Selamat siang',
            icon: 'solar:sun-bold-duotone',
            iconColor: 'text-amber-400',
        };
    }
    if (hour >= 15 && hour < 18) {
        return {
            text: 'Selamat sore',
            icon: 'solar:sunset-bold-duotone',
            iconColor: 'text-orange-500',
        };
    }
    return {
        text: 'Selamat malam',
        icon: 'solar:moon-stars-bold-duotone',
        iconColor: 'text-indigo-400 dark:text-indigo-300',
    };
}

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
        timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const { text: greetingText, icon: timeIcon, iconColor: timeIconColor } = getTimeGreeting();

    return (
        <div className="relative flex items-center justify-between rounded-2xl border border-border/80 bg-linear-to-r from-primary/12 via-card/90 to-card shadow-xs px-5 py-4 sm:px-6 sm:py-5 overflow-hidden transition-all duration-200">
            {/* Ambient blur glows */}
            <div
                className="absolute -left-12 -top-12 w-52 h-52 bg-primary/15 rounded-full blur-3xl pointer-events-none"
                aria-hidden="true"
            />
            <div
                className="absolute right-0 -bottom-10 w-44 h-44 bg-primary/10 rounded-full blur-3xl pointer-events-none"
                aria-hidden="true"
            />

            <div className="flex items-center gap-4 z-10 min-w-0">
                <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-background shadow-sm ring-2 ring-primary/25 shrink-0">
                    {image ? (
                        <AvatarImage
                            src={image}
                            alt={name}
                            className="object-cover object-top h-full w-full"
                        />
                    ) : null}
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-base sm:text-lg">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>

                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={`inline-flex shrink-0 ${timeIconColor}`}
                            aria-hidden="true"
                        >
                            <Icon icon={timeIcon} width={22} className="sm:w-6 sm:h-6" />
                        </span>
                        <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-foreground truncate">
                            {greetingText}, {name}
                        </h2>
                        <span
                            className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_infinite] text-base sm:text-lg"
                            aria-hidden="true"
                        >
                            👋
                        </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs sm:text-[13px] text-muted-foreground font-medium mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-md bg-primary/15 text-primary font-semibold text-xs tracking-wide border border-primary/20">
                            <Icon icon="solar:shield-user-bold-duotone" width={14} />
                            {role}
                        </span>

                        {branch ? (
                            <>
                                <span className="text-muted-foreground/40">•</span>
                                <span className="inline-flex items-center gap-1.5 text-foreground/80 truncate">
                                    <Icon
                                        icon="solar:map-point-linear"
                                        width={14}
                                        className="text-primary/70 shrink-0"
                                    />
                                    {branch}
                                </span>
                            </>
                        ) : null}

                        {sessionUser.nik ? (
                            <>
                                <span className="text-muted-foreground/40 hidden xs:inline">•</span>
                                <span className="font-mono text-xs text-muted-foreground hidden xs:inline">
                                    NIK: {sessionUser.nik}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs sm:text-sm text-muted-foreground z-10">
                <div className="flex items-center gap-2 font-medium text-foreground/80 bg-background/60 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-border/60 shadow-2xs">
                    <Icon
                        icon="solar:calendar-linear"
                        width={16}
                        className="text-primary shrink-0"
                    />
                    <span className="capitalize">{todayStr}</span>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span>Sistem Aktif</span>
                </div>
            </div>
        </div>
    );
}
