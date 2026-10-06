import { Icon } from '@iconify/react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import SimpleBar from 'simplebar-react';
import { AMMenu, AMMenuItem, AMSidebar, AMSubmenu } from 'tailwind-sidebar';
import { checkIsStaff } from '../../management/users/actions';
import FullLogo from '../shared/logo/FullLogo';
import SidebarContent from './sidebaritems';
import 'tailwind-sidebar/styles.css';

interface SidebarItemType {
    heading?: string;
    id?: number | string;
    name?: string;
    title?: string;
    icon?: string;
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
        const isSelected = currentPath === item?.url;
        const IconComp = item.icon || null;

        const iconElement = IconComp ? (
            <Icon icon={IconComp} height={22} width={22} />
        ) : (
            <Icon icon={'ri:checkbox-blank-circle-line'} height={9} width={9} />
        );

        // Submenu
        if (item.children?.length) {
            return (
                <AMSubmenu
                    key={item.id}
                    icon={iconElement}
                    title={item.name}
                    ClassName="mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 rounded-md px-3 py-1.5"
                >
                    {renderSidebarItems(item.children, currentPath, onClose, true)}
                </AMSubmenu>
            );
        }

        // Regular menu item
        const linkTarget = item.url?.startsWith('https') ? '_blank' : '_self';

        const itemClassNames = isSubItem
            ? `mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 rounded-md ${
                  isSelected ? 'bg-primary/10 text-primary font-medium shadow-sm' : ''
              } px-3 py-1.5`
            : `mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 rounded-md ${
                  isSelected ? 'bg-primary text-primary-foreground font-medium shadow-md' : ''
              } px-3 py-1.5`;

        return (
            // biome-ignore lint/a11y/noStaticElementInteractions: Sidebar menu item wrapper
            <div
                onClick={onClose}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onClose?.();
                }}
                key={item.id || index}
            >
                <AMMenuItem
                    key={item.id}
                    icon={iconElement}
                    isSelected={isSelected}
                    link={item.url || undefined}
                    target={linkTarget}
                    badge={!!item.isPro}
                    badgeColor="bg-lightsecondary"
                    badgeTextColor="text-secondary"
                    disabled={item.disabled}
                    badgeContent={item.isPro ? 'Pro' : undefined}
                    component={Link}
                    className={`${itemClassNames}`}
                >
                    <span className="truncate flex-1">{item.title || item.name}</span>
                </AMMenuItem>
            </div>
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

    // Check if any child is active
    const isActive = section.children?.some((child) => {
        if (child.url === pathname) return true;
        if (child.children) {
            return child.children.some((subChild) => subChild.url === pathname);
        }
        return false;
    });

    const isOpen = isActive || isHovered;

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Sidebar section wrapper
        <div
            className="mb-2"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Heading */}
            {section.heading && (
                <div className="mb-0 cursor-pointer">
                    <AMMenu
                        subHeading={section.heading}
                        ClassName={`hide-menu leading-21 font-semibold uppercase text-[11px] tracking-wider mt-4 mb-1 px-3 transition-colors duration-200 ${
                            isOpen ? 'text-primary' : 'text-muted-foreground'
                        }`}
                    />
                </div>
            )}

            {/* Children */}
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
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
    const { theme } = useTheme();
    const [isStaff, setIsStaff] = useState<boolean>(true); // default to true to hide sensitive menus until checked

    useEffect(() => {
        checkIsStaff().then((staff) => setIsStaff(staff));
    }, []);

    // Filter sidebar content based on role
    const filteredSidebarContent = SidebarContent.map((section) => {
        if (section.heading === 'Management' && isStaff) {
            // Remove 'Users' from Management if user is staff
            const filteredChildren = section.children?.filter((child) => child.name !== 'Users');
            return { ...section, children: filteredChildren };
        }
        return section;
    }).filter((section) => !section.heading || (section.children && section.children.length > 0));

    // Only allow "light" or "dark" for AMSidebar
    const sidebarMode = theme === 'light' || theme === 'dark' ? theme : undefined;

    return (
        <AMSidebar
            collapsible="none"
            animation={true}
            showProfile={false}
            width={'270px'}
            showTrigger={false}
            mode={sidebarMode}
            className={
                isMobile
                    ? 'bg-sidebar dark:bg-sidebar w-full h-full'
                    : 'fixed left-0 top-0 border-r border-border bg-card dark:bg-card z-10 h-screen shadow-lg'
            }
        >
            {/* Logo */}
            <div className="px-6 py-6 flex items-center brand-logo overflow-hidden">
                <Link href="/" className="flex items-center">
                    <FullLogo />
                </Link>
            </div>

            {/* Sidebar items */}

            <SimpleBar className="h-[calc(100vh-100px)]">
                <div className="px-4">
                    {filteredSidebarContent.map((section, index) => (
                        <SidebarSection
                            key={section.heading || index}
                            section={section}
                            pathname={pathname}
                            onClose={onClose}
                        />
                    ))}

                    {/* Promo Section Removed */}
                </div>
            </SimpleBar>
        </AMSidebar>
    );
};

export default SidebarLayout;
