'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type FormFieldProps = {
    label: string;
    error?: string;
    required?: boolean;
    hint?: string;
    children: ReactNode;
    className?: string;
    htmlFor?: string;
};

export function FormField({
    label,
    error,
    required,
    hint,
    children,
    className,
    htmlFor,
}: FormFieldProps) {
    const inputId = htmlFor || `field-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
        <div className={cn('space-y-2', className)}>
            <Label
                htmlFor={inputId}
                className={cn(required && 'after:ml-1 after:text-destructive after:content-["*"]')}
            >
                {label}
            </Label>
            {children}
            {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
            {error && (
                <p className="text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

// Reusable input wrapper with consistent styling
export type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
    error?: string;
};

export function InputField({ className, error, ...props }: InputFieldProps) {
    return (
        <input
            className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                error && 'border-destructive focus-visible:ring-destructive',
                className
            )}
            {...props}
        />
    );
}

// Combined FormField + InputField
export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    required?: boolean;
    hint?: string;
};

export function TextField({
    label,
    error,
    required,
    hint,
    className,
    id,
    ...props
}: TextFieldProps) {
    const inputId = id || `text-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
        <FormField
            label={label}
            error={error}
            required={required}
            hint={hint}
            htmlFor={inputId}
            className={className}
        >
            <InputField id={inputId} error={error} {...props} />
        </FormField>
    );
}
