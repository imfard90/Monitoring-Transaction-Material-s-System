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
        <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none relative flex min-h-0 flex-1 w-full flex-col overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-warning/5 to-transparent pointer-events-none" />

            <div className="relative z-10 mb-3 shrink-0">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                        Peringatan Stok Minimum
                    </h2>
                    <p className="text-sm text-muted-foreground font-medium mt-1">
                        Daftar material yang memerlukan isi ulang stok
                    </p>
                </div>
            </div>

            <div className="relative z-10 min-h-0 flex-1 overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Gudang</TableHead>
                            <TableHead>Kode Material</TableHead>
                            <TableHead className="max-w-24 whitespace-normal px-1 text-right leading-tight">
                                Rata-rata Kebutuhan
                            </TableHead>
                            <TableHead className="max-w-16 whitespace-normal px-1 text-right leading-tight">
                                Lead Time (Mg)
                            </TableHead>
                            <TableHead className="max-w-16 whitespace-normal px-1 text-right leading-tight">
                                Safety Stock %
                            </TableHead>
                            <TableHead className="text-right">Stok Min</TableHead>
                            <TableHead className="text-right">Stok Saat Ini</TableHead>
                            <TableHead className="text-center">Status</TableHead>
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
                                                {Number(w.average_demand_weekly).toFixed(2)} / mgg
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
                                                className={`text-right font-bold ${isWarning ? 'text-warning' : 'text-success'}`}
                                            >
                                                {w.qty_stock}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {isWarning ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-warning/10 text-warning border-warning/20"
                                                    >
                                                        Peringatan
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-success/10 text-success border-success/20"
                                                    >
                                                        Aman
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
        </Card>
    );
};
