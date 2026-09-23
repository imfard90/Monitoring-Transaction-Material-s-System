'use client';

import { useQuery } from '@tanstack/react-query';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
import React, { useState } from 'react';
import { getStockBalances } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import CardBox from '@/app/components/shared/CardBox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const columnHelper = createColumnHelper<any>();

export default function StockBalanceOverview() {
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredBalances = React.useMemo(() => {
        if (!searchQuery) return balances;
        const lowerQuery = searchQuery.toLowerCase();
        return balances.filter(
            (b: any) =>
                b.warehouse_name?.toLowerCase().includes(lowerQuery) ||
                b.material_name?.toLowerCase().includes(lowerQuery) ||
                b.material_code?.toLowerCase().includes(lowerQuery)
        );
    }, [balances, searchQuery]);

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
        <CardBox className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Real-time Stock Balance</h2>
                    <p className="text-sm text-gray-500">Monitoring material stock per warehouse</p>
                </div>
                <div className="relative w-full sm:w-80">
                    <Input
                        placeholder="Search warehouse, material..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        size={16}
                    />
                </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-6 py-3 font-semibold">
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-6 py-8 text-center text-gray-500"
                                >
                                    Loading data...
                                </td>
                            </tr>
                        ) : filteredBalances.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-6 py-8 text-center text-gray-500"
                                >
                                    No stock balance found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-6 py-4">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </CardBox>
    );
}
