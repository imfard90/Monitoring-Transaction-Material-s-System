'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
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
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function WarehouseCombobox({
    value,
    onValueChange,
    warehouses,
    open,
    onOpenChange,
}: WarehouseComboboxProps) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between font-normal"
                >
                    {value === 'all' ? 'All Warehouses' : value}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search WH..." />
                    <CommandEmpty>No WH found.</CommandEmpty>
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
                                        value === 'all' ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                All Warehouses
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
