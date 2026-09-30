'use client';

import { Icon } from '@iconify/react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import FullLogo from '../shared/logo/FullLogo';
import SidebarLayout from '../sidebar/Sidebar';
import Notifications from './Notifications';
import Profile from './Profile';
import Search from './Search';

const Header = () => {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    const toggleMode = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    return (
        <>
            <header className="sticky top-0 z-10 w-full shrink-0 bg-background/80 backdrop-blur-md border-b border-border transition-colors duration-200">
                <nav className="flex justify-between items-center py-3 px-4 sm:px-6 lg:px-8 max-w-full">
                    {/* LEFT SECTION */}
                    <div className="flex items-center gap-2">
                        {/* Hamburger for mobile */}
                        <button
                            type="button"
                            onClick={() => setIsOpen(true)}
                            className="xl:hidden px-3 hover:text-primary text-foreground relative after:absolute after:w-10 after:h-10 after:rounded-full hover:after:bg-lightprimary after:bg-transparent rounded-full flex justify-center items-center cursor-pointer"
                            aria-label="Open sidebar menu"
                        >
                            <Icon icon="tabler:menu-2" height={20} width={20} />
                        </button>
                        {/* Logo for mobile */}
                        <div className="xl:hidden block ml-2">
                            <FullLogo />
                        </div>
                        {/* Search (Desktop & Tablet) */}
                        <div className="hidden md:block relative ml-2 xl:ml-0">
                            <Search />
                        </div>
                    </div>

                    {/* RIGHT SECTION */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        {/* Theme Toggle */}
                        <button
                            type="button"
                            className="hover:text-primary group focus:ring-0 rounded-full flex justify-center items-center cursor-pointer relative"
                            onClick={toggleMode}
                            aria-label="Toggle dark/light mode"
                        >
                            <span className="flex items-center justify-center relative after:absolute after:w-10 after:h-10 after:rounded-full after:-top-1/2 group-hover:after:bg-lightprimary">
                                {theme === 'light' ? (
                                    <Icon
                                        icon="tabler:moon"
                                        width="20"
                                        className="text-foreground dark:text-muted-foreground group-hover:text-primary"
                                    />
                                ) : (
                                    <Icon
                                        icon="solar:sun-bold-duotone"
                                        width="20"
                                        className="text-foreground dark:text-muted-foreground group-hover:text-primary"
                                    />
                                )}
                            </span>
                        </button>

                        {/* Notifications */}
                        <Notifications />

                        {/* Profile Dropdown */}
                        <Profile />
                    </div>
                </nav>
            </header>

            {/* Mobile Sidebar */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="left" className="w-[270px] p-0 border-r-0">
                    <VisuallyHidden>
                        <SheetTitle>sidebar</SheetTitle>
                    </VisuallyHidden>
                    <SidebarLayout onClose={() => setIsOpen(false)} isMobile={true} />
                </SheetContent>
            </Sheet>
        </>
    );
};

export default Header;
