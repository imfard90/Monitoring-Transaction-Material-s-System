'use client';
import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import { useState } from 'react';
import type { BlogType } from '@/app/(DashboardLayout)/types/blog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BlogCommentProps {
    comment: BlogType;
}

const BlogComment = ({ comment }: BlogCommentProps) => {
    const [showReply, setShowReply] = useState(false);

    const name = comment.profile?.name || '?';
    const avatar = comment.profile?.avatar || '';
    const time = comment.time ? format(new Date(comment.time), 'E, MMM d') : '';

    return (
        <>
            <div className="mt-5 p-5 bg-muted rounded-md">
                <div className="flex gap-3 items-center">
                    <Avatar>
                        {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
                        <AvatarFallback>{name[0]}</AvatarFallback>
                    </Avatar>
                    <h6 className="text-base">{name}</h6>
                    <span className="h-2 w-2 rounded-full bg-dark opacity-40 dark:bg-white block"></span>
                    <p>{time}</p>
                </div>

                <div className="py-4">
                    <p className="text-ld">{comment.comment || ''}</p>
                </div>

                <div className="relative w-fit">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    className="flex items-center"
                                    onClick={() => setShowReply(!showReply)}
                                >
                                    <Icon
                                        icon="tabler:arrow-back-up"
                                        height="18"
                                        className="!text-white !shrink-0"
                                    />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reply</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Replies */}
            {comment.replies?.map((reply, index) => {
                const replyName = reply.profile?.name || '?';
                const replyAvatar = reply.profile?.avatar || '';
                const replyTime = reply.time ? format(new Date(reply.time), 'E, MMM d') : '';

                return (
                    <div className="ps-8" key={`${reply.id || reply.comment}-${index}`}>
                        <div className="mt-5 p-5 bg-muted rounded-md">
                            <div className="flex gap-3 items-center">
                                <Avatar>
                                    {replyAvatar ? (
                                        <AvatarImage src={replyAvatar} alt={replyName} />
                                    ) : null}
                                    <AvatarFallback>{replyName[0]}</AvatarFallback>
                                </Avatar>
                                <h6 className="text-base">{replyName}</h6>
                                <span className="h-2 w-2 rounded-full bg-dark dark:bg-white opacity-40 block"></span>
                                <p>{replyTime}</p>
                            </div>
                            <div className="py-4">
                                <p className="text-ld">{reply.comment || ''}</p>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Reply input */}
            {showReply && (
                <div className="py-5 px-5">
                    <div className="flex gap-3 items-center">
                        <div className="w-10">
                            <Avatar>
                                {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
                                <AvatarFallback>{name[0]}</AvatarFallback>
                            </Avatar>
                        </div>
                        <Input className="form-control md:w-full w-fit" placeholder="Reply" />
                        <Button>Reply</Button>
                    </div>
                </div>
            )}
        </>
    );
};

export default BlogComment;
