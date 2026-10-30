'use client';

import type { DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const Command = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
    <CommandPrimitive
        ref={ref}
        className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-md bg-background dark:bg-dark text-ld',
            className
        )}
        {...props}
    />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
    return (
        <Dialog {...props}>
            <DialogContent className="overflow-hidden p-0 shadow-lg">
                <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-8 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
                    {children}
                </Command>
            </DialogContent>
        </Dialog>
    );
};

const CommandInput = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Input>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
    <div className="p-2" cmdk-input-wrapper="">
        <div className="flex h-8 w-full items-center rounded-md border border-input bg-transparent px-2.5 text-xs md:text-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
                ref={ref}
                className={cn(
                    'flex h-full w-full bg-transparent py-1 text-xs md:text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 shadow-none focus:shadow-none focus-visible:shadow-none',
                    className
                )}
                {...props}
            />
        </div>
    </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.List
        ref={ref}
        className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
        {...props}
    />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Empty>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
    <CommandPrimitive.Empty
        ref={ref}
        className="py-4 text-center text-xs md:text-sm text-muted-foreground"
        {...props}
    />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Group>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Group
        ref={ref}
        className={cn(
            'overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ld',
            className
        )}
        {...props}
    />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 h-px bg-border dark:bg-border', className)}
        {...props}
    />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-1.5 text-xs md:text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-lightprimary data-[selected=true]:text-primary data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-lightprimary dark:hover:bg-lightprimary/20",
            className
        )}
        {...props}
    />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
    return <span className={cn('ml-auto text-xs tracking-widest text-ld', className)} {...props} />;
};
CommandShortcut.displayName = 'CommandShortcut';

export {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
};
