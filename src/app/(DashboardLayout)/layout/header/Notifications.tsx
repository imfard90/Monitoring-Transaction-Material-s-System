'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';
import SimpleBar from 'simplebar-react';
import * as MessagesData from './data';
import 'simplebar-react/dist/simplebar.min.css';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Notifications = () => {
    return (
        <div className="relative group/menu px-15">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <div className="relative">
                        <span className="relative after:absolute after:w-10 after:h-10 after:rounded-full text-foreground dark:text-muted-foreground hover:text-primary dark:hover:text-primary after:-top-1/2 hover:after:bg-lightprimary dark:hover:after:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:after:bg-lightprimary group-hover/menu:text-primary">
                            <Icon icon="tabler:bell-ringing" height={20} />
                        </span>
                        <span className="rounded-full absolute -end-[6px] -top-[5px] text-[10px] h-2 w-2 bg-primary flex justify-center items-center"></span>
                    </div>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    className="w-screen sm:w-[300px] py-6 rounded-sm border border-border"
                >
                    {/* Header */}
                    <div className="flex items-center px-6 justify-between">
                        <h3 className="mb-0 text-lg font-semibold">Notification</h3>
                        <Badge color={'primary'}>5 new</Badge>
                    </div>
                    {/* Scrollable content */}
                    <SimpleBar className="max-h-80 mt-3">
                        {MessagesData.Notifications.map((item, index) => (
                            <DropdownMenuItem
                                className="px-6 py-3 flex justify-between items-center bg-hover group/link w-full"
                                key={index}
                            >
                                <Link href="#">
                                    <div className="flex items-center">
                                        <span className="flex-shrink-0 relative">
                                            <img
                                                src={item.avatar}
                                                width={45}
                                                height={45}
                                                alt="tailwindadmin"
                                                className="rounded-full"
                                            />
                                        </span>
                                        <div className="ps-4">
                                            <h5 className="mb-1 text-sm group-hover/link:text-primary">
                                                {item.title}
                                            </h5>
                                            <span className="text-xs block truncate text-muted-foreground">
                                                {item.subtitle}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </DropdownMenuItem>
                        ))}
                    </SimpleBar>
                    <div className="pt-5 px-6">
                        <Button variant={'outline'} className="w-full">
                            See All Notifications
                        </Button>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default Notifications;
