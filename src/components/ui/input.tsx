import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const inputVariants = cva(
    'flex h-10 w-full border rounded-xl px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:rounded-sm file:text-sm file:font-medium file:text-primary file:mr-5 focus-visible:outline-none',
    {
        variants: {
            variant: {
                default:
                    'border-input bg-transparent text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10',
                gray: 'border-border bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary focus-visible:ring',
                info: 'border-info bg-info/10 text-info placeholder-info/50 focus:border-info focus:ring-info focus-visible:ring',
                failure:
                    'border-error bg-error/10 text-error placeholder-error/50 focus:border-error focus:ring-error focus-visible:ring',
                warning:
                    'border-warning bg-warning/10 text-warning placeholder-warning/50 focus:border-warning focus:ring-warning focus-visible:ring',
                success:
                    'border-success bg-success/10 text-success placeholder-success/50 focus:border-success focus:ring-success focus-visible:ring',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement>,
        VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type = 'text', variant, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(inputVariants({ variant }), className)}
                ref={ref}
                {...props}
            />
        );
    }
);

Input.displayName = 'Input';

export { Input };
