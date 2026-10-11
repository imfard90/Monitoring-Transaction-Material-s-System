'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
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

interface WarehouseComboboxProps {
    value: string;
    onValueChange: (value: string) => void;
    warehouses: string[];
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    placeholder?: string;
    allLabel?: string;
    emptyText?: string;
    className?: string;
}

export function WarehouseCombobox({
    value,
    onValueChange,
    warehouses,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    placeholder = 'Search WH...',
    allLabel = 'All Warehouses',
    emptyText = 'No WH found.',
    className,
}: WarehouseComboboxProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen === undefined ? uncontrolledOpen : controlledOpen;
    const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('w-[200px] justify-between font-normal', className)}
                >
                    <span className="truncate">{value === 'all' || !value ? allLabel : value}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn('w-[200px] p-0', className)} align="start">
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandEmpty>{emptyText}</CommandEmpty>
                    <CommandList>
                        <CommandGroup>
                            <CommandItem
                                value="all"
                                onSelect={() => {
                                    onValueChange('all');
                                    onOpenChange(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        'mr-2 h-4 w-4',
                                        value === 'all' || !value ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                {allLabel}
                            </CommandItem>
                            {warehouses.map((wh) => (
                                <CommandItem
                                    key={wh}
                                    value={wh}
                                    onSelect={() => {
                                        onValueChange(wh);
                                        onOpenChange(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            value === wh ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    {wh}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
