'use client';
import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import { uniqueId } from 'lodash';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import React, { useContext, useEffect, useState } from 'react';
import { FaQuoteLeft } from 'react-icons/fa';
import { GoDot } from 'react-icons/go';
import type { BlogType } from '@/app/(DashboardLayout)/types/blog';
import CardBox from '@/app/components/shared/CardBox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BlogContext, type BlogContextProps } from '../../../../context/blog-context/index';
import BlogComment from './BlogCommnets';

const BlogDetailData = () => {
    const { posts, setLoading, addComment }: BlogContextProps = useContext(BlogContext);
    const pathName = usePathname();
    const getTitle = pathName?.split('/').pop() ?? '';
    const post = posts.find(
        (p) =>
            p.title
                ?.toLowerCase()
                .replace(/ /g, '-')
                .replace(/[^\w-]+/g, '') === getTitle
    );

    const [replyTxt, setReplyTxt] = useState('');

    const onSubmit = () => {
        if (!post?.id) return;
        const newComment: BlogType & { postId: string } = {
            id: uniqueId('#comm_'),
            profile: {
                id: uniqueId('#USER_'),
                avatar: post.author?.avatar || '',
                name: post.author?.name || '',
                time: new Date().toISOString(),
            },
            comment: replyTxt,
            replies: [],
            postId: post.id,
        };
        addComment(post.id, newComment);
        setReplyTxt('');
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 700);
        return () => clearTimeout(timer);
    }, [setLoading]);

    return (
        <>
            {post ? (
                <>
                    <CardBox className="p-0 overflow-hidden">
                        <div className="relative">
                            <div className="overflow-hidden max-h-[440px]">
                                {post.coverImg && (
                                    <Image
                                        src={post.coverImg}
                                        alt={post.title || 'Blog cover'}
                                        height={440}
                                        width={1500}
                                        className="w-full object-cover object-center"
                                    />
                                )}
                            </div>
                            <Badge variant={'gray'} className="absolute bottom-8 end-6">
                                2 min Read
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center -mt-11 px-6 w-fit">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage
                                                src={post.author?.avatar || ''}
                                                alt={post.author?.name || '?'}
                                            />
                                            <AvatarFallback>
                                                {post.author?.name?.[0] || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>{post.author?.name}</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        <div className="px-6 pb-6">
                            <Badge variant="gray" className="mt-3">
                                {post.category}
                            </Badge>
                            <h2 className="md:text-4xl text-2xl my-6">{post.title}</h2>
                            <div className="flex gap-3">
                                <div className="flex gap-2 items-center text-muted-foreground text-[15px]">
                                    <Icon
                                        icon="tabler:eye"
                                        height="18"
                                        className="text-foreground"
                                    />
                                    {post.view || 0}
                                </div>
                                <div className="flex gap-2 items-center text-muted-foreground text-[15px]">
                                    <Icon
                                        icon="tabler:message-2"
                                        height="18"
                                        className="text-foreground"
                                    />{' '}
                                    {post.comments?.length || 0}
                                </div>
                                <div className="ms-auto flex gap-2 items-center text-muted-foreground text-[15px]">
                                    <GoDot size="16" className="text-foreground" />
                                    <small>
                                        {post.createdAt
                                            ? format(new Date(post.createdAt), 'E, MMM d')
                                            : ''}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </CardBox>

                    <CardBox className="mt-6">
                        <h5 className="text-xl mb-2">Post Comments</h5>
                        <Textarea
                            rows={4}
                            value={replyTxt}
                            onChange={(e) => setReplyTxt(e.target.value)}
                            placeholder="Write your comment..."
                        />
                        <Button
                            variant="default"
                            className="w-fit mt-3 rounded-md"
                            onClick={onSubmit}
                        >
                            Post Comment
                        </Button>

                        <div className="mt-6">
                            <div className="flex gap-3 items-center">
                                <h5 className="text-xl">Comments</h5>
                                <div className="h-8 w-8 rounded-full bg-lightprimary dark:bg-lightprimary flex items-center justify-center text-primary font-bold">
                                    {post.comments?.length || 0}
                                </div>
                            </div>
                            <div>
                                {post.comments?.map((comment) => (
                                    <BlogComment
                                        key={comment.id || comment.comment}
                                        comment={comment}
                                    />
                                ))}
                            </div>
                        </div>
                    </CardBox>
                </>
            ) : (
                <p className="text-xl text-center py-6 font-bold">No Post Found</p>
            )}
        </>
    );
};
export default BlogDetailData;
