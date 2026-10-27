'use client';

import { Icon } from '@iconify/react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import SimpleBar from 'simplebar-react';
import { cn } from '@/lib/utils';
import { getSidebarUserAccess, type SidebarUserAccess } from '../../management/users/actions';
import FullLogo from '../shared/logo/FullLogo';
import { SidebarAnnouncement } from './SidebarAnnouncement';
import SidebarContent from './sidebaritems';

interface SidebarItemType {
    heading?: string;
    id?: number | string;
    name?: string;
    title?: string;
    icon?: string;
    iconActive?: string;
    url?: string;
    children?: SidebarItemType[];
    disabled?: boolean;
    isPro?: boolean;
}

const renderSidebarItems = (
    items: SidebarItemType[],
    currentPath: string,
    onClose?: () => void,
    isSubItem: boolean = false
) => {
    return items.map((item, index) => {
        const isSelected =
            item.url === '/'
                ? currentPath === '/'
                : currentPath === item.url ||
                  (item.url ? currentPath.startsWith(`${item.url}/`) : false);

        const activeIconName = item.iconActive || item.icon;
        const iconName = isSelected ? activeIconName : item.icon;

        const iconElement = iconName ? (
            <Icon
                icon={iconName}
                height={19}
                width={19}
                className={cn(
                    'shrink-0 transition-transform duration-150 group-hover:scale-105',
                    isSelected
                        ? 'text-primary dark:text-primary-foreground'
                        : 'text-muted-foreground/80 group-hover:text-foreground'
                )}
            />
        ) : (
            <Icon
                icon="ri:checkbox-blank-circle-line"
                height={8}
                width={8}
                className="shrink-0 text-muted-foreground/60"
            />
        );

        const linkTarget = item.url?.startsWith('https') ? '_blank' : '_self';

        return (
            <Link
                key={item.id || index}
                href={item.url || '#'}
                target={linkTarget}
                aria-current={isSelected ? 'page' : undefined}
                aria-disabled={item.disabled || undefined}
                onClick={(event) => {
                    if (item.disabled) {
                        event.preventDefault();
                        return;
                    }
                    onClose?.();
                }}
                className={cn(
                    'group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    isSubItem ? 'pl-8 text-xs' : '',
                    isSelected
                        ? 'bg-primary/10 text-primary font-semibold shadow-2xs dark:bg-primary/20 dark:text-primary-foreground border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-[0.99] border border-transparent',
                    item.disabled ? 'pointer-events-none opacity-50' : ''
                )}
            >
                {isSelected && (
                    <span
                        className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-primary"
                        aria-hidden="true"
                    />
                )}
                {iconElement}
                <span className="truncate flex-1 tracking-tight">{item.title || item.name}</span>
                {item.isPro && (
                    <span className="rounded bg-secondary/10 text-secondary border border-secondary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Pro
                    </span>
                )}
            </Link>
        );
    });
};

const SidebarSection = ({
    section,
    pathname,
    onClose,
}: {
    section: SidebarItemType;
    pathname: string;
    onClose?: () => void;
}) => {
    const [isHovered, setIsHovered] = useState(false);

    // Check if any child in this section is currently active
    const isActive = section.children?.some((child) => {
        if (!child.url) return false;
        if (child.url === '/') return pathname === '/';
        return pathname === child.url || pathname.startsWith(`${child.url}/`);
    });

    const isOpen = Boolean(isActive || isHovered);

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: accordion hover preview interaction
        <div
            className="relative mb-2.5 pb-2.5 after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/80 after:to-transparent last:after:hidden last:mb-0 last:pb-0"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {section.heading && (
                <button
                    type="button"
                    onClick={() => setIsHovered((prev) => !prev)}
                    className="w-full px-3 py-1 flex items-center justify-between text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-lg transition-colors"
                    aria-expanded={isOpen}
                >
                    <span
                        className={cn(
                            'text-[10.5px] font-bold uppercase tracking-wider transition-colors duration-150',
                            isOpen
                                ? 'text-primary dark:text-primary font-bold'
                                : 'text-muted-foreground/75 group-hover:text-foreground'
                        )}
                    >
                        {section.heading}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {section.children && section.children.length > 0 && (
                            <span className="text-[10px] font-medium text-muted-foreground/40 tabular-nums">
                                {section.children.length}
                            </span>
                        )}
                        <Icon
                            icon="solar:alt-arrow-down-linear"
                            width={12}
                            height={12}
                            className={cn(
                                'text-muted-foreground/50 transition-transform duration-200 ease-out group-hover:text-foreground',
                                isOpen ? 'rotate-180 text-primary' : 'rotate-0'
                            )}
                            aria-hidden="true"
                        />
                    </div>
                </button>
            )}

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{
                            height: 'auto',
                            opacity: 1,
                            transition: {
                                height: { duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] },
                                opacity: { duration: 0.18, delay: 0.04 },
                            },
                        }}
                        exit={{
                            height: 0,
                            opacity: 0,
                            transition: {
                                height: { duration: 0.18, ease: 'easeInOut' },
                                opacity: { duration: 0.12 },
                            },
                        }}
                        className="overflow-hidden space-y-0.5 pt-1"
                    >
                        {renderSidebarItems(section.children || [], pathname, onClose)}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const SidebarLayout = ({
    onClose,
    isMobile = false,
}: {
    onClose?: () => void;
    isMobile?: boolean;
}) => {
    const pathname = usePathname();
    const [access, setAccess] = useState<SidebarUserAccess>({
        isStaff: true,
        isTeknisi: false,
    }); // default to hide sensitive menus until checked

    useEffect(() => {
        getSidebarUserAccess().then((acc) => setAccess(acc));
    }, []);

    // Filter sidebar content based on role
    const filteredSidebarContent = SidebarContent.map((section) => {
        if (section.heading === 'Management') {
            const filteredChildren = section.children?.filter((child) => {
                // Teknisi cannot access Users and Technicians
                if (access.isTeknisi && (child.name === 'Users' || child.name === 'Technicians')) {
                    return false;
                }
                // Staff cannot access Users
                if (access.isStaff && child.name === 'Users') {
                    return false;
                }
                return true;
            });
            return { ...section, children: filteredChildren };
        }
        return section;
    }).filter((section) => !section.heading || (section.children && section.children.length > 0));

    return (
        <aside
            aria-label="Navigasi sidebar"
            className={cn(
                'flex flex-col select-none overflow-hidden transition-colors duration-200',
                isMobile
                    ? 'h-full w-full bg-card dark:bg-card text-card-foreground'
                    : 'fixed left-0 top-0 z-10 h-[100dvh] w-[270px] border-r border-border bg-card dark:bg-card text-card-foreground shadow-xs'
            )}
        >
            <div className="flex flex-col h-full w-full justify-between">
                {/* Brand Logo Header - Aligned with main navbar height */}
                <div className="h-16 px-6 flex items-center brand-logo shrink-0 border-b border-border/50">
                    <Link
                        href="/"
                        onClick={onClose}
                        className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <FullLogo />
                    </Link>
                </div>

                {/* Sidebar Navigation Items */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    <SimpleBar className="h-full">
                        <nav aria-label="Menu navigasi" className="px-3.5 py-3">
                            {filteredSidebarContent.map((section, index) => (
                                <SidebarSection
                                    key={section.heading || index}
                                    section={section}
                                    pathname={pathname}
                                    onClose={onClose}
                                />
                            ))}
                        </nav>
                    </SimpleBar>
                </div>

                {/* Announcement Widget - Pinned at the bottom */}
                <div className="shrink-0 px-3 pb-3 pt-2 border-t border-border/50 bg-card/60 backdrop-blur-xs">
                    <SidebarAnnouncement />
                </div>
            </div>
        </aside>
    );
};

export default SidebarLayout;
