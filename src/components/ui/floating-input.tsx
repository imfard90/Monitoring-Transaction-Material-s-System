'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string;
    startIcon?: React.ReactNode;
    endIcon?: React.ReactNode;
    containerClassName?: string;
    labelBg?: string;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
    (
        {
            className,
            containerClassName,
            type = 'text',
            label,
            error,
            startIcon,
            endIcon,
            labelBg = 'bg-card',
            id: explicitId,
            value,
            defaultValue,
            disabled,
            readOnly,
            onFocus,
            onBlur,
            onChange,
            ...props
        },
        ref
    ) => {
        const generatedId = React.useId();
        const inputId = explicitId || `floating-input-${generatedId}`;
        const errorId = `${inputId}-error`;

        const [isFocused, setIsFocused] = React.useState(false);
        const [hasValue, setHasValue] = React.useState(() => {
            if (value !== undefined) return String(value).length > 0;
            if (defaultValue !== undefined) return String(defaultValue).length > 0;
            return false;
        });

        React.useEffect(() => {
            if (value !== undefined) {
                setHasValue(String(value).length > 0);
            }
        }, [value]);

        const isFloating = isFocused || hasValue;

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(true);
            onFocus?.(e);
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(false);
            setHasValue(e.target.value.length > 0);
            onBlur?.(e);
        };

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setHasValue(e.target.value.length > 0);
            onChange?.(e);
        };

        return (
            <div className={cn('relative w-full', containerClassName)}>
                {/* Single outer continuous border container: wraps both icon and field text */}
                <div
                    className={cn(
                        'group relative flex items-center w-full h-12 rounded-xl border bg-background/60 dark:bg-card/40 transition-all duration-200',
                        'hover:border-primary/50 hover:bg-background',
                        'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background',
                        error
                            ? 'border-destructive focus-within:border-destructive focus-within:ring-destructive/20'
                            : 'border-input/80',
                        (disabled || readOnly) &&
                            'opacity-80 bg-muted/50 hover:border-input/80 cursor-not-allowed'
                    )}
                >
                    {startIcon ? (
                        <div
                            className={cn(
                                'pl-3.5 pr-1 flex items-center justify-center transition-colors pointer-events-none select-none shrink-0',
                                isFocused ? 'text-primary' : 'text-muted-foreground'
                            )}
                            aria-hidden="true"
                        >
                            {startIcon}
                        </div>
                    ) : null}

                    <input
                        {...props}
                        ref={ref}
                        id={inputId}
                        type={type}
                        value={value}
                        defaultValue={defaultValue}
                        disabled={disabled}
                        readOnly={readOnly}
                        data-floating-input="true"
                        placeholder=" "
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onChange={handleChange}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                        className={cn(
                            'peer block w-full h-full bg-transparent text-sm sm:text-base text-foreground font-medium',
                            'border-none outline-none ring-0 shadow-none',
                            'focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none',
                            'disabled:cursor-not-allowed read-only:cursor-default',
                            startIcon ? 'pl-2' : 'pl-3.5',
                            endIcon ? 'pr-2' : 'pr-3.5',
                            className
                        )}
                    />

                    {/* Floating Label: bergerak memotong garis border atas saat fokus/terisi */}
                    <label
                        htmlFor={inputId}
                        className={cn(
                            'absolute pointer-events-none select-none transition-all duration-200 ease-out origin-left z-10',
                            'motion-reduce:transition-none',
                            isFloating
                                ? cn(
                                      'top-0 -translate-y-1/2 left-3 text-xs font-semibold px-1.5 rounded-xs',
                                      labelBg,
                                      error
                                          ? 'text-destructive'
                                          : isFocused
                                            ? 'text-primary'
                                            : 'text-muted-foreground'
                                  )
                                : cn(
                                      'top-1/2 -translate-y-1/2 text-sm font-normal text-muted-foreground',
                                      startIcon ? 'left-10' : 'left-3.5'
                                  ),
                            // CSS peer fallbacks for instant browser autofill
                            'peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:left-3 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-primary peer-focus:px-1.5 peer-focus:bg-card',
                            'peer-not-placeholder-shown:top-0 peer-not-placeholder-shown:-translate-y-1/2 peer-not-placeholder-shown:left-3 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:px-1.5 peer-not-placeholder-shown:bg-card',
                            labelBg !== 'bg-card' && isFloating && labelBg
                        )}
                    >
                        {label}
                    </label>

                    {endIcon ? (
                        <div className="pr-3 pl-1 flex items-center justify-center shrink-0">
                            {endIcon}
                        </div>
                    ) : null}
                </div>

                {error ? (
                    <p
                        id={errorId}
                        role="alert"
                        className="mt-1.5 ml-1 text-xs font-medium text-destructive transition-all animate-in fade-in-50"
                    >
                        {error}
                    </p>
                ) : null}
            </div>
        );
    }
);

FloatingInput.displayName = 'FloatingInput';

export { FloatingInput };
