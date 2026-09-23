'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { getDashboardStockIntech } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import CardBox from '../shared/CardBox';

export const StockIntechOverview = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const { data, isLoading } = useQuery({
        queryKey: ['dashboardStockIntech'],
        queryFn: getDashboardStockIntech,
    });

    const stockData = data?.data || [];

    const filteredData = useMemo(() => {
        if (!searchQuery) return stockData;
        const q = searchQuery.toLowerCase();
        return stockData.filter(
            (item: any) =>
                item.teknisi?.toLowerCase().includes(q) ||
                item.material_code?.toLowerCase().includes(q) ||
                item.material_name?.toLowerCase().includes(q)
        );
    }, [stockData, searchQuery]);

    return (
        <CardBox>
            <div
                id="stock-intech"
                className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div>
                    <h5 className="card-title">Stock Intech Overview</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Sisa material yang masih di tangan teknisi (Status: Intech)
                    </p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                        type="search"
                        placeholder="Cari Teknisi..."
                        className="pl-9 bg-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex flex-col">
                <div className="-m-1.5 overflow-x-auto">
                    <div className="p-1.5 min-w-full inline-block align-middle">
                        <div className="overflow-x-auto max-h-[400px]">
                            {isLoading ? (
                                <div className="flex justify-center items-center py-10 text-muted-foreground">
                                    Loading data...
                                </div>
                            ) : filteredData.length === 0 ? (
                                <div className="flex justify-center items-center py-10 text-muted-foreground">
                                    Tidak ada material Intech.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-sm font-semibold">
                                                Branch
                                            </TableHead>
                                            <TableHead className="text-sm font-semibold">
                                                Warehouse
                                            </TableHead>
                                            <TableHead className="text-sm font-semibold">
                                                Teknisi
                                            </TableHead>
                                            <TableHead className="text-sm font-semibold">
                                                Material Code
                                            </TableHead>
                                            <TableHead className="text-sm font-semibold">
                                                Material Name
                                            </TableHead>
                                            <TableHead className="text-sm font-semibold text-center">
                                                Qty Intech
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredData.map((item: any, index: number) => (
                                            <TableRow
                                                key={index}
                                                className="border-b border-border hover:bg-muted/50"
                                            >
                                                <TableCell className="text-xs font-medium">
                                                    {item.branch || '-'}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {item.wh_name || '-'}
                                                </TableCell>
                                                <TableCell className="text-xs font-semibold">
                                                    {item.teknisi || '-'}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {item.material_code}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {item.material_name}
                                                </TableCell>
                                                <TableCell className="text-sm font-bold text-blue-600 text-center">
                                                    {item.qty_intech}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </CardBox>
    );
};
