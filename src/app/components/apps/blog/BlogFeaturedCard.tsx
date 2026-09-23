'use client';

import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useContext, useEffect } from 'react';
import { GoDot } from 'react-icons/go';
import type { BlogPostType } from '@/app/(DashboardLayout)/types/blog';
import { BlogContext, type BlogContextProps } from '@/app/context/blog-context/index';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Btype {
    post: BlogPostType;
    index: number;
}

const BlogFeaturedCard = ({ post, index }: Btype) => {
    // Destructure with default values to avoid undefined
    const {
        coverImg = '',
        title = '',
        view = 0,
        comments = [],
        category = '',
        author,
        createdAt = new Date(),
    } = post;

    const linkTo = title
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\w-]+/g, '');

    const mainPost = index === 0;

    const { setLoading }: BlogContextProps = useContext(BlogContext);

    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 700);

        return () => clearTimeout(timer);
    }, [setLoading]);

    return (
        <>
            {post ? (
                <div className={`lg:col-span-${mainPost ? 8 : 4} md:col-span-12 col-span-12`}>
                    <Card className="w-full h-[400px] p-0 overflow-hidden flex-row shadow-none feature-card relative card-hover border-none">
                        {/* Background Image */}
                        <div className="absolute inset-0">
                            {coverImg ? (
                                <img
                                    src={coverImg}
                                    alt={title || 'blog image'}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gray-200" /> // fallback
                            )}
                            <div className="absolute inset-0 bg-black opacity-50 mix-blend-multiply"></div>
                        </div>

                        {/* Content */}
                        <div className="absolute inset-0 p-6 flex flex-col justify-between">
                            <div className="flex justify-between items-center">
                                <Avatar className="h-10 w-10">
                                    {author?.avatar ? (
                                        <AvatarImage src={author.avatar} alt={author.name || '?'} />
                                    ) : null}
                                    <AvatarFallback>
                                        {author?.name ? author.name[0] : '?'}
                                    </AvatarFallback>
                                </Avatar>

                                {category && (
                                    <Badge className="rounded-md bg-primary text-white">
                                        {category}
                                    </Badge>
                                )}
                            </div>

                            <div>
                                <h2 className="text-2xl text-white my-6">
                                    <Link href={`/apps/blog/detail/${linkTo}`}>{title}</Link>
                                </h2>
                                <div className="flex gap-3">
                                    <div className="flex gap-2 items-center text-white text-[15px]">
                                        <Icon icon="tabler:eye" height="18" /> {view}
                                    </div>
                                    <div className="flex gap-2 items-center text-white text-[15px]">
                                        <Icon icon="tabler:message-2" height="18" />{' '}
                                        {comments.length}
                                    </div>
                                    <div className="ms-auto flex gap-2 items-center text-white text-[15px]">
                                        <GoDot size="16" />
                                        <small>{format(new Date(createdAt), 'E, MMM d')}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            ) : null}
        </>
    );
};

export default BlogFeaturedCard;
