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
import CardBox from '../shared/CardBox';

interface StockWarning {
    warehouse_name: string | null;
    material_code: string | null;
    average_demand_weekly: string;
    lead_time_weeks: number;
    safety_stock_pct: string;
    min_qty: number;
    qty_stock: number;
    deficit: number;
}

export const StockWarningTable = () => {
    const [warnings, setWarnings] = useState<StockWarning[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const { getStockWarnings } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getStockWarnings();
            if (res.success && res.data) {
                setWarnings(res.data);
            }
        };
        loadData();
    }, []);

    return (
        <CardBox>
            <div className="mb-2">
                <div>
                    <h5 className="card-title">Stock Minimum Warning</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Daftar material yang memerlukan isi ulang stok
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>WH</TableHead>
                            <TableHead>Material</TableHead>
                            <TableHead className="text-right">Avg Demand</TableHead>
                            <TableHead className="text-right">Lead Time</TableHead>
                            <TableHead className="text-right">Safety %</TableHead>
                            <TableHead className="text-right">Min Qty</TableHead>
                            <TableHead className="text-right">Stock HI</TableHead>
                            <TableHead className="text-center">Warning</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <AnimatePresence>
                            {warnings.length === 0 ? (
                                <motion.tr
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                >
                                    <TableCell colSpan={8} className="text-center">
                                        Tidak ada material yang dibawah stok minimum
                                    </TableCell>
                                </motion.tr>
                            ) : (
                                warnings.map((w: StockWarning, index: number) => {
                                    const isWarning = w.qty_stock < w.min_qty;
                                    return (
                                        <motion.tr
                                            key={`${w.warehouse_name}-${w.material_code}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: index * 0.03 }}
                                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                        >
                                            <TableCell>{w.warehouse_name}</TableCell>
                                            <TableCell className="font-medium">
                                                {w.material_code}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {Number(w.average_demand_weekly).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {w.lead_time_weeks}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {Number(w.safety_stock_pct).toFixed(0)}%
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {w.min_qty}
                                            </TableCell>
                                            <TableCell
                                                className={`text-right font-bold ${isWarning ? 'text-yellow-500' : 'text-green-600'}`}
                                            >
                                                {w.qty_stock}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {isWarning ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                                                    >
                                                        Warning
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-green-500/10 text-green-600 border-green-500/20"
                                                    >
                                                        Safe
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </AnimatePresence>
                    </TableBody>
                </Table>
            </div>
        </CardBox>
    );
};
