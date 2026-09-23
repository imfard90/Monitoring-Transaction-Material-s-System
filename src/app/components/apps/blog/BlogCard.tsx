'use client';
import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import { GoDot } from 'react-icons/go';
import type { BlogPostType } from '@/app/(DashboardLayout)/types/blog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CardBox from '../../shared/CardBox';

interface Btype {
    post: BlogPostType;
    index?: number;
}

const BlogCard = ({ post }: Btype) => {
    // Destructure with default values for optional fields
    const {
        coverImg = '',
        title = '',
        view = 0,
        comments = [],
        category = '',
        author,
        createdAt = new Date(),
    } = post;

    // Generate link slug safely
    const linkTo = title
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\w-]+/g, '');

    return (
        <div className="lg:col-span-4 md:col-span-6 col-span-12">
            <CardBox className="p-0 overflow-hidden group card-hover">
                <div className="relative">
                    <Link href={`/apps/blog/detail/${linkTo}`}>
                        <div className="overflow-hidden h-[240px]">
                            {coverImg ? (
                                <Image
                                    src={coverImg}
                                    alt={title || 'blog image'}
                                    height={240}
                                    width={500}
                                    className="w-full"
                                />
                            ) : (
                                <div className="w-full h-[240px] bg-gray-200" /> // fallback if no image
                            )}
                        </div>
                        <Badge className="absolute bottom-8 end-6 rounded-md bg-white text-black">
                            2 min Read
                        </Badge>
                    </Link>

                    <div className="flex justify-between items-center -mt-6 px-6">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="cursor-pointer w-10 h-10">
                                        {author?.avatar ? (
                                            <AvatarImage
                                                src={author.avatar}
                                                alt={author.name || '?'}
                                            />
                                        ) : null}
                                        <AvatarFallback>
                                            {author?.name ? author.name[0] : '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                <TooltipContent>{author?.name || 'Unknown author'}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                <div className="px-6 pb-6">
                    {category && (
                        <Badge variant="gray" className="mt-3 rounded-md">
                            {category}
                        </Badge>
                    )}

                    <h5 className="text-xl py-6 group-hover:text-primary">
                        <Link href={`/apps/blog/detail/${linkTo}`} className="line-clamp-2">
                            {title}
                        </Link>
                    </h5>

                    <div className="flex gap-3">
                        <div className="flex gap-2 items-center text-muted-foreground text-[15px]">
                            <Icon icon="tabler:eye" height="18" className="text-foreground" />{' '}
                            {view}
                        </div>
                        <div className="flex gap-2 items-center text-muted-foreground text-[15px]">
                            <Icon icon="tabler:message-2" height="18" className="text-foreground" />{' '}
                            {comments.length}
                        </div>
                        <div className="ms-auto flex gap-2 items-center text-muted-foreground text-[15px]">
                            <GoDot size="16" className="text-foreground" />
                            <small>{format(new Date(createdAt), 'E, MMM d')}</small>
                        </div>
                    </div>
                </div>
            </CardBox>
        </div>
    );
};

export default BlogCard;
