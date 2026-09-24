import { Icon } from '@iconify/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import SimpleBar from 'simplebar-react';
import { AMMenu, AMMenuItem, AMSidebar, AMSubmenu } from 'tailwind-sidebar';
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
            <Icon icon={IconComp} height={21} width={21} />
        ) : (
            <Icon icon={'ri:checkbox-blank-circle-line'} height={9} width={9} />
        );

        // Heading
        if (item.heading) {
            return (
                <div className="mb-1" key={item.heading}>
                    <AMMenu
                        subHeading={item.heading}
                        ClassName="hide-menu leading-21 text-sidebar-foreground dark:text-sidebar-foreground font-bold uppercase text-xs"
                    />
                </div>
            );
        }

        // Submenu
        if (item.children?.length) {
            return (
                <AMSubmenu
                    key={item.id}
                    icon={iconElement}
                    title={item.name}
                    ClassName="mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground"
                >
                    {renderSidebarItems(item.children, currentPath, onClose, true)}
                </AMSubmenu>
            );
        }

        // Regular menu item
        const linkTarget = item.url?.startsWith('https') ? '_blank' : '_self';

        const itemClassNames = isSubItem
            ? `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground !hover:bg-transparent ${
                  isSelected ? '!bg-transparent !text-primary' : ''
              } !px-1.5`
            : `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground`;

        return (
            <div onClick={onClose} key={index}>
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

const SidebarLayout = ({ onClose }: { onClose?: () => void }) => {
    const pathname = usePathname();
    const { theme } = useTheme();

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
            className="fixed left-0 top-0 border border-border bg-sidebar dark:bg-sidebar z-10 h-screen"
        >
            {/* Logo */}
            <div className="px-6 py-6 flex items-center brand-logo overflow-hidden">
                <Link href="/" className="flex items-center">
                    <FullLogo />
                </Link>
            </div>

            {/* Sidebar items */}

            <SimpleBar className="h-[calc(100vh-100px)]">
                <div className="px-6">
                    {SidebarContent.map((section, index) => (
                        <div key={index}>
                            {renderSidebarItems(
                                [
                                    ...(section.heading ? [{ heading: section.heading }] : []),
                                    ...(section.children || []),
                                ],
                                pathname,
                                onClose
                            )}
                        </div>
                    ))}

                    {/* Promo Section Removed */}
                </div>
            </SimpleBar>
        </AMSidebar>
    );
};

export default SidebarLayout;
