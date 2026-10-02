'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import React, { useState } from 'react';
import { getStockBalances } from '@/app/(DashboardLayout)/_actions/dashboard-actions';

interface StockBalanceData {
    warehouse_name: string | null;
    branch_name: string | null;
    material_name: string | null;
    material_code: string | null;
    qty_stock: number;
}

import CardBox from '@/app/components/shared/CardBox';
import { DataTable } from '@/app/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const columnHelper = createColumnHelper<StockBalanceData>();

export default function StockBalanceOverview() {
    const [searchQuery, setSearchQuery] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [openCombo, setOpenCombo] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['stockBalances'],
        queryFn: async () => {
            const res = await getStockBalances();
            if (!res.success) throw new Error('Failed to fetch stock balances');
            return res.data;
        },
        staleTime: 1000 * 60, // 1 minute
    });

    const balances = data || [];

    const uniqueWhs = React.useMemo(() => {
        const set = new Set(
            balances.map((b: StockBalanceData) => b.warehouse_name).filter(Boolean)
        );
        return Array.from(set).sort() as string[];
    }, [balances]);

    const filteredBalances = React.useMemo(() => {
        return balances.filter((b: StockBalanceData) => {
            const matchesWh = whFilter === 'all' || b.warehouse_name === whFilter;

            if (!searchQuery) return matchesWh;
            const lowerQuery = searchQuery.toLowerCase();
            const matchesSearch =
                b.material_name?.toLowerCase().includes(lowerQuery) ||
                b.material_code?.toLowerCase().includes(lowerQuery);

            return matchesWh && matchesSearch;
        });
    }, [balances, searchQuery, whFilter]);

    const columns = [
        columnHelper.accessor('warehouse_name', {
            header: 'Warehouse',
            cell: (info) => <span className="font-medium">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('branch_name', {
            header: 'Branch',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('material_code', {
            header: 'Material Code',
            cell: (info) => (
                <Badge variant="outline" className="font-mono text-xs">
                    {info.getValue() || '-'}
                </Badge>
            ),
        }),
        columnHelper.accessor('material_name', {
            header: 'Material Name',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('qty_stock', {
            header: () => <div className="text-right">Qty Stock</div>,
            cell: (info) => {
                const qty = Number(info.getValue());
                return (
                    <div className="text-right font-medium">
                        <span className={qty <= 0 ? 'text-red-500' : 'text-gray-900'}>
                            {qty.toLocaleString()}
                        </span>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: filteredBalances,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col flex-1 min-h-0"
        >
            <CardBox className="flex flex-col flex-1 min-h-0 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Real-time Stock Balance</h2>
                        <p className="text-sm text-gray-500">
                            Monitoring material stock per warehouse
                        </p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Input
                                placeholder="Search material code/name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={16}
                            />
                        </div>
                        <Popover open={openCombo} onOpenChange={setOpenCombo}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCombo}
                                    className="w-[200px] justify-between font-normal"
                                >
                                    {whFilter === 'all' ? 'All Warehouses' : whFilter}
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
                                                    setWhFilter('all');
                                                    setOpenCombo(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4',
                                                        whFilter === 'all'
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
                                                    )}
                                                />
                                                All Warehouses
                                            </CommandItem>
                                            {uniqueWhs.map((wh) => (
                                                <CommandItem
                                                    key={wh}
                                                    value={wh}
                                                    onSelect={(_currentValue) => {
                                                        setWhFilter(wh);
                                                        setOpenCombo(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 h-4 w-4',
                                                            whFilter === wh
                                                                ? 'opacity-100'
                                                                : 'opacity-0'
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
                    </div>
                </div>

                <DataTable
                    table={table}
                    isLoading={isLoading}
                    emptyMessage="No stock balance found."
                />
            </CardBox>
        </motion.div>
    );
}
