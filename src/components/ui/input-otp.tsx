'use client';

import { OTPInput, OTPInputContext } from 'input-otp';
import { Dot } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const InputOTP = React.forwardRef<
    React.ElementRef<typeof OTPInput>,
    React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
    <OTPInput
        ref={ref}
        containerClassName={cn(
            'flex items-center gap-2 has-[:disabled]:opacity-50',
            containerClassName
        )}
        className={cn('disabled:cursor-not-allowed', className)}
        {...props}
    />
));
InputOTP.displayName = 'InputOTP';

const InputOTPGroup = React.forwardRef<
    React.ElementRef<'div'>,
    React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-1.5 sm:gap-2', className)} {...props} />
));
InputOTPGroup.displayName = 'InputOTPGroup';

const InputOTPSlot = React.forwardRef<
    React.ElementRef<'div'>,
    React.ComponentPropsWithoutRef<'div'> & { index: number }
>(({ index, className, ...props }, ref) => {
    const inputOTPContext = React.useContext(OTPInputContext);
    const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index];

    return (
        <div
            ref={ref}
            className={cn(
                'relative flex h-12 w-10 sm:h-13 sm:w-11 items-center justify-center rounded-xl border-2 border-slate-300/90 dark:border-slate-700/90 bg-card/70 dark:bg-card/40 backdrop-blur-xs text-foreground font-mono font-bold text-lg sm:text-xl transition-all duration-200 select-none shadow-xs',
                char &&
                    'border-primary/60 dark:border-primary/50 bg-primary/5 dark:bg-primary/10 text-foreground',
                isActive &&
                    'z-10 border-primary ring-4 ring-primary/20 dark:ring-primary/25 scale-105 shadow-md bg-background',
                className
            )}
            {...props}
        >
            {char}
            {hasFakeCaret && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-5 w-0.5 animate-pulse bg-primary duration-700 rounded-full" />
                </div>
            )}
        </div>
    );
});
InputOTPSlot.displayName = 'InputOTPSlot';

const InputOTPSeparator = React.forwardRef<
    React.ElementRef<'div'>,
    React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn('flex items-center justify-center px-1 text-muted-foreground/60', className)}
        {...props}
    >
        <div className="w-2.5 h-0.5 rounded-full bg-border/80" />
    </div>
));
InputOTPSeparator.displayName = 'InputOTPSeparator';

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
