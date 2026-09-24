'use client';

import { Icon } from '@iconify/react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import FullLogo from '../shared/logo/FullLogo';
import SidebarLayout from '../sidebar/Sidebar';
import Notifications from './Notifications';
import Profile from './Profile';
import Search from './Search';

const Header = () => {
    const { theme, setTheme } = useTheme();
    const [isSticky, setIsSticky] = useState(false);
    const [_mobileMenu, _setMobileMenu] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 50) {
                setIsSticky(true);
            } else {
                setIsSticky(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const toggleMode = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    return (
        <>
            <header
                className={`sticky top-0 z-2 ${
                    isSticky ? 'bg-background shadow-md fixed w-full' : 'bg-transparent'
                }`}
            >
                <nav
                    className={`rounded-none  py-4 sm:ps-6 max-w-full! sm:pe-10 dark:bg-dark flex justify-between items-center px-6`}
                >
                    {/* Mobile Toggle Icon */}
                    <div
                        onClick={() => {
                            setIsOpen(true);
                        }}
                        className="px-[15px] hover:text-primary dark:hover:text-primary text-foreground dark:text-muted-foreground relative after:absolute after:w-10 after:h-10 after:rounded-full hover:after:bg-lightprimary  after:bg-transparent rounded-full xl:hidden flex justify-center items-center cursor-pointer"
                    >
                        <Icon icon="tabler:menu-2" height={20} width={20} />
                    </div>

                    <div className="block xl:hidden">
                        <FullLogo />
                    </div>

                    <div className="flex xl:hidden items-center">
                        <div
                            className="hover:text-primary px-2 md:px-15 group focus:ring-0 rounded-full flex justify-center items-center cursor-pointer relative"
                            onClick={toggleMode}
                        >
                            <span className="flex items-center justify-center relative after:absolute after:w-10 after:h-10 after:rounded-full after:-top-1/2 group-hover:after:bg-lightprimary">
                                {theme === 'light' ? (
                                    <Icon
                                        icon="tabler:moon"
                                        width="20"
                                        className="text-foreground dark:text-muted-foreground group-hover:text-primary dark:group-hover:text-primary"
                                    />
                                ) : (
                                    <Icon
                                        icon="solar:sun-bold-duotone"
                                        width="20"
                                        className="text-foreground dark:text-muted-foreground group-hover:text-primary dark:group-hover:text-primary"
                                    />
                                )}
                            </span>
                        </div>

                        <div className="xl:block">
                            <div className="flex gap-0 items-center relative">
                                {/* Chat */}
                                <Notifications />
                            </div>
                        </div>

                        {/* Profile Dropdown */}
                        <Profile />
                    </div>

                    <div className="hidden xl:flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                            {/* Search Icon */}
                            <div className="relative">
                                <Search />
                            </div>
                        </div>
                        <div className="flex w-full justify-end items-end">
                            <div className="flex gap-0 items-center ">
                                {/* ✅ Dark/Light Toggle */}
                                <div
                                    className="hover:text-primary px-15 group focus:ring-0 rounded-full flex justify-center items-center cursor-pointer text-gray relative"
                                    onClick={toggleMode}
                                >
                                    <span className="flex items-center justify-center relative after:absolute after:w-10 after:h-10 after:rounded-full after:-top-1/2 group-hover:after:bg-lightprimary">
                                        {theme === 'light' ? (
                                            <Icon
                                                icon="tabler:moon"
                                                width="20"
                                                className="text-foreground dark:text-muted-foreground group-hover:text-primary dark:group-hover:text-primary"
                                            />
                                        ) : (
                                            <Icon
                                                icon="solar:sun-bold-duotone"
                                                width="20"
                                                className="text-foreground dark:text-muted-foreground group-hover:text-primary dark:group-hover:text-primary"
                                            />
                                        )}
                                    </span>
                                </div>

                                <div className="xl:block ">
                                    <div className="flex gap-0 items-center relative">
                                        {/* Chat */}
                                        <Notifications />
                                    </div>
                                </div>

                                {/* Profile Dropdown */}
                                <Profile />
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            {/* Mobile Sidebar */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <VisuallyHidden>
                        <SheetTitle>sidebar</SheetTitle>
                    </VisuallyHidden>
                    <SidebarLayout onClose={() => setIsOpen(false)} />
                </SheetContent>
            </Sheet>
        </>
    );
};

export default Header;
