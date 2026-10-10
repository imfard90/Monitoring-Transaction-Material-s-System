'use client';

import { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type CurrencyInputProps = {
    value?: number;
    onChange?: (value: number) => void;
    currency?: string;
    locale?: string;
    min?: number;
    max?: number;
    disabled?: boolean;
    className?: string;
    label?: string;
    required?: boolean;
    error?: string;
    placeholder?: string;
};

export function CurrencyInput({
    value: controlledValue,
    onChange,
    currency = 'IDR',
    locale = 'id-ID',
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    disabled = false,
    className,
    label,
    required,
    error,
    placeholder = '0',
}: CurrencyInputProps) {
    const [internalValue, setInternalValue] = useState<number>(controlledValue ?? 0);
    const value = controlledValue ?? internalValue;

    const formatCurrency = useCallback(
        (val: number) => {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            }).format(val);
        },
        [currency, locale]
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value.replace(/[^\d.]/g, '');
            const parsed = parseFloat(raw);

            if (isNaN(parsed)) {
                if (controlledValue === undefined) setInternalValue(0);
                onChange?.(0);
                return;
            }

            const clamped = Math.max(min, Math.min(max, parsed));
            if (controlledValue === undefined) {
                setInternalValue(clamped);
            }
            onChange?.(clamped);
        },
        [min, max, controlledValue, onChange]
    );

    return (
        <div className={cn('space-y-2', className)}>
            {label && (
                <Label
                    className={cn(
                        required && 'after:ml-1 after:text-destructive after:content-["*"]'
                    )}
                >
                    {label}
                </Label>
            )}
            <div className="relative">
                <Input
                    type="text"
                    inputMode="decimal"
                    value={value === 0 ? '' : formatCurrency(value)}
                    onChange={handleChange}
                    disabled={disabled}
                    placeholder={placeholder}
                    className={cn(
                        'h-10',
                        error && 'border-destructive focus-visible:ring-destructive'
                    )}
                    aria-invalid={!!error}
                />
            </div>
            {error && (
                <p className="text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
