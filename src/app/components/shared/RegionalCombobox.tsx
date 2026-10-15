'use client';

import { Check, ChevronsUpDown, MapPinned } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const ALL_VALUE = 'all';

interface RegionalComboboxProps {
    /** Currently selected regional. Use `'all'` or `''` to mean "no filter". */
    value: string;
    onValueChange: (value: string) => void;
    /** List of unique regional strings to display. */
    regionals: string[];
    placeholder?: string;
    allLabel?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Reusable combobox for filtering by regional (Popover + Command pattern).
 *
 * Follows the same conventions as `WarehouseCombobox`:
 * - `value === 'all'` or `''` → "no filter" / "semua"
 * - Keyboard-searchable via `CommandInput`
 * - Check mark on selected item
 */
export function RegionalCombobox({
    value,
    onValueChange,
    regionals,
    placeholder = 'Cari regional...',
    allLabel = 'Semua Regional',
    emptyText = 'Regional tidak ditemukan.',
    disabled = false,
    className,
}: RegionalComboboxProps) {
    const [open, setOpen] = useState(false);

    const isAll = value === ALL_VALUE || value === '';
    const displayLabel = isAll ? allLabel : value;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={`Filter regional: ${displayLabel}`}
                    disabled={disabled}
                    className={cn(
                        'h-8 justify-between gap-1.5 px-2.5 font-normal text-xs',
                        !isAll && 'border-primary/60 bg-primary/5 text-primary',
                        className
                    )}
                >
                    <MapPinned
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <span className="truncate max-w-[120px]">{displayLabel}</span>
                    <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {/* "Semua" option */}
                            <CommandItem
                                value={ALL_VALUE}
                                onSelect={() => {
                                    onValueChange(ALL_VALUE);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        'mr-2 h-4 w-4 shrink-0',
                                        isAll ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                {allLabel}
                            </CommandItem>
                            {regionals.map((regional) => (
                                <CommandItem
                                    key={regional}
                                    value={regional}
                                    onSelect={() => {
                                        onValueChange(regional === value ? ALL_VALUE : regional);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            value === regional ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    {regional}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
