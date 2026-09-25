'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getDashboardStockIntech } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
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
import CardBox from '../shared/CardBox';

export const StockIntechOverview = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [openCombo, setOpenCombo] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ['dashboardStockIntech'],
        queryFn: getDashboardStockIntech,
    });

    const stockData = data?.data || [];

    const uniqueWhs = useMemo(() => {
        const set = new Set(stockData.map((item: any) => item.wh_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [stockData]);

    const filteredData = useMemo(() => {
        return stockData.filter((item: any) => {
            const matchesWh = whFilter === 'all' || item.wh_name === whFilter;

            if (!searchQuery) return matchesWh;
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                item.nik?.toLowerCase().includes(q) || item.teknisi?.toLowerCase().includes(q);

            return matchesWh && matchesSearch;
        });
    }, [stockData, searchQuery, whFilter]);

    return (
        <CardBox className="flex flex-col flex-1 min-h-0 p-6">
            <div
                id="stock-intech"
                className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div>
                    <h5 className="card-title">Stock Intech Overview</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Sisa material yang masih di tangan teknisi (Status: Intech)
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            type="search"
                            placeholder="Cari NIK/Teknisi..."
                            className="pl-9 bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
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
                                                    whFilter === 'all' ? 'opacity-100' : 'opacity-0'
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
            <div className="rounded-md border overflow-auto flex-1 min-h-0 relative">
                <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-1.5 font-semibold">Branch</th>
                            <th className="px-3 py-1.5 font-semibold">Warehouse</th>
                            <th className="px-3 py-1.5 font-semibold">Teknisi</th>
                            <th className="px-3 py-1.5 font-semibold">Material Code</th>
                            <th className="px-3 py-1.5 font-semibold">Material Name</th>
                            <th className="px-3 py-1.5 font-semibold text-center">Qty Intech</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                                    Loading data...
                                </td>
                            </tr>
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                                    Tidak ada material Intech.
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((item: any, index: number) => (
                                <tr key={index} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-3 py-1.5 font-medium">{item.branch || '-'}</td>
                                    <td className="px-3 py-1.5 text-gray-500">
                                        {item.wh_name || '-'}
                                    </td>
                                    <td className="px-3 py-1.5 font-semibold">
                                        {item.teknisi || '-'}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-xs">
                                        {item.material_code}
                                    </td>
                                    <td className="px-3 py-1.5">{item.material_name}</td>
                                    <td className="px-3 py-1.5 font-bold text-blue-600 text-center">
                                        {item.qty_intech}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </CardBox>
    );
};
