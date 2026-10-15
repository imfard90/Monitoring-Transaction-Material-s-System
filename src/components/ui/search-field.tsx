'use client';

import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SearchFieldProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type'
> & {
    value: string;
    onValueChange: (value: string) => void;
    type?: 'text' | 'search';
    wrapperClassName?: string;
    clearLabel?: string;
};

export function SearchField({
    value,
    onValueChange,
    placeholder,
    className,
    wrapperClassName,
    clearLabel = 'Hapus pencarian',
    type = 'text',
    ...inputProps
}: SearchFieldProps) {
    return (
        <div className={cn('relative', wrapperClassName)}>
            <Input
                {...inputProps}
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                className={cn(
                    '[&::-webkit-search-cancel-button]:hidden [&::-ms-clear]:hidden',
                    'pl-9',
                    value && 'pr-9',
                    className
                )}
            />
            <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            {value && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={clearLabel}
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                    onClick={() => onValueChange('')}
                >
                    <X aria-hidden="true" />
                </Button>
            )}
        </div>
    );
}
