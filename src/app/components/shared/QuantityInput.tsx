'use client';

import { Icon } from '@iconify/react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type QuantityInputProps = {
    value?: number;
    onChange?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    className?: string;
    error?: string;
    label?: string;
    required?: boolean;
    id?: string;
};

export function QuantityInput({
    value: controlledValue,
    onChange,
    min = 0,
    max = 999999,
    step = 1,
    disabled = false,
    className,
    error,
    label,
    required,
    id = 'quantity-input',
}: QuantityInputProps) {
    const [internalValue, setInternalValue] = useState<number>(controlledValue ?? min);
    const value = controlledValue ?? internalValue;

    const handleChange = useCallback(
        (newValue: number) => {
            const clamped = Math.max(min, Math.min(max, newValue));
            if (controlledValue === undefined) {
                setInternalValue(clamped);
            }
            onChange?.(clamped);
        },
        [min, max, controlledValue, onChange]
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) {
                handleChange(parsed);
            }
        },
        [handleChange]
    );

    const increment = useCallback(() => {
        handleChange(value + step);
    }, [value, step, handleChange]);

    const decrement = useCallback(() => {
        handleChange(value - step);
    }, [value, step, handleChange]);

    return (
        <div className={cn('space-y-2', className)}>
            {label && (
                <label
                    htmlFor={id}
                    className={cn(
                        'text-sm font-medium',
                        required && 'after:ml-1 after:text-destructive after:content-["*"]'
                    )}
                >
                    {label}
                </label>
            )}
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={decrement}
                    disabled={disabled || value <= min}
                    aria-label="Decrease quantity"
                >
                    <Icon icon="mdi:minus" className="h-4 w-4" />
                </Button>
                <Input
                    id={id}
                    type="number"
                    value={value}
                    onChange={handleInputChange}
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    className={cn(
                        'h-10 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                        error && 'border-destructive'
                    )}
                    aria-invalid={!!error}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={increment}
                    disabled={disabled || value >= max}
                    aria-label="Increase quantity"
                >
                    <Icon icon="mdi:plus" className="h-4 w-4" />
                </Button>
            </div>
            {error && (
                <p className="text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

// Compact version for inline use
export function QuantityStepper({
    value,
    onChange,
    min = 1,
    max = 999,
    disabled = false,
    className,
}: Omit<QuantityInputProps, 'label' | 'required' | 'id'>) {
    return (
        <QuantityInput
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={1}
            disabled={disabled}
            className={className}
        />
    );
}
