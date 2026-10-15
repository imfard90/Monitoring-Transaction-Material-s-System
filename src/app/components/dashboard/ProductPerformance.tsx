'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';

interface WarehousePerformance {
    key: number;
    name: string;
    trxOut: number;
    trxClose: number;
}

export const ProductPerformance = () => {
    const [warehouseData, setWarehouseData] = useState<WarehousePerformance[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const { getWarehousePerformance } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getWarehousePerformance();
            if (result.success && Array.isArray(result.data)) {
                setWarehouseData(
                    result.data.map(
                        (d: { key: number; name: string; trxOut: number; trxClose: number }) => ({
                            key: d.key,
                            name: d.name,
                            trxOut: Number(d.trxOut),
                            trxClose: Number(d.trxClose),
                        })
                    )
                );
            }
        };
        loadData();
    }, []);

    // Calculate percentage and sort by percentage descending
    const performaceData = warehouseData
        .map((item) => {
            const percentage =
                item.trxOut === 0 ? 0 : Math.round((item.trxClose / item.trxOut) * 100);
            const clampedPercentage = Math.min(100, Math.max(0, percentage));
            let badgeColor = 'bg-success text-white';
            if (percentage < 50) badgeColor = 'bg-error text-white';
            else if (percentage < 80) badgeColor = 'bg-warning text-white';

            return {
                ...item,
                percentage: clampedPercentage,
                badgeColor,
            };
        })
        .sort((a, b) => b.percentage - a.percentage);

    return (
        <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none w-full relative overflow-hidden">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-gradient-to-bl from-success/5 to-transparent" />

            <div id="product" className="relative z-10 mb-2">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Performa Pengeluaran Gudang
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Ringkasan persentase penyelesaian transaksi out material per gudang
                    </p>
                </div>
            </div>
            <div className="relative z-10 min-w-0 overflow-x-auto">
                <Table className="table-fixed min-w-[420px] text-sm">
                    <colgroup>
                        <col className="w-6" />
                        <col className="w-[28%]" />
                        <col className="w-10" />
                        <col className="w-10" />
                        <col className="w-12" />
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="px-1 py-0.5 text-sm font-semibold">No</TableHead>
                            <TableHead className="px-1 py-0.5 text-sm font-semibold">
                                Nama Gudang
                            </TableHead>
                            <TableHead className="px-1 py-0.5 text-center text-sm font-semibold">
                                Total Out
                            </TableHead>
                            <TableHead className="px-1 py-0.5 text-center text-sm font-semibold">
                                Selesai
                            </TableHead>
                            <TableHead className="px-1 py-0.5 text-center text-sm font-semibold">
                                Persentase
                            </TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        <AnimatePresence>
                            {performaceData.map((item, index) => (
                                <motion.tr
                                    key={item.key}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: index * 0.03 }}
                                    className="border-b border-border transition-colors hover:bg-muted/50"
                                >
                                    <TableCell className="px-1 py-1 text-sm">
                                        <p className="text-muted-foreground font-medium">
                                            {index + 1}
                                        </p>
                                    </TableCell>
                                    <TableCell className="max-w-0 px-1 py-1 text-sm">
                                        <h3
                                            className="truncate text-sm font-semibold"
                                            title={item.name}
                                        >
                                            {item.name}
                                        </h3>
                                    </TableCell>
                                    <TableCell className="px-1 py-1 text-center text-sm">
                                        <p className="font-medium text-muted-foreground">
                                            {item.trxOut}
                                        </p>
                                    </TableCell>
                                    <TableCell className="px-1 py-1 text-center text-sm">
                                        <p className="font-medium text-muted-foreground">
                                            {item.trxClose}
                                        </p>
                                    </TableCell>
                                    <TableCell className="px-1 py-1 text-center">
                                        <Badge
                                            className={`text-sm px-2 rounded-full justify-center py-0.5 ${item.badgeColor}`}
                                        >
                                            {item.percentage}%
                                        </Badge>
                                    </TableCell>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
};
