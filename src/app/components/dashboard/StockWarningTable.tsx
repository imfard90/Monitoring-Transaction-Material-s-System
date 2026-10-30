'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

type WarehouseOption = { id: number; name: string };

export const StockWarningTable = ({
    isStaff,
    warehouses,
}: {
    isStaff: boolean;
    warehouses: WarehouseOption[];
}) => {
    const [warnings, setWarnings] = useState<StockWarning[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('all');
    const visibleWarnings = warnings.filter((warning) => warning.min_qty > 0);

    useEffect(() => {
        let isActive = true;
        const loadData = async () => {
            const { getStockWarnings } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getStockWarnings(isStaff ? 'all' : selectedWarehouse);
            if (!isActive) return;
            if (res.success && res.data) setWarnings(res.data);
        };
        void loadData();
        return () => {
            isActive = false;
        };
    }, [selectedWarehouse, isStaff]);

    return (
        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none relative flex flex-col w-full h-full min-h-0 flex-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-warning/5 to-transparent pointer-events-none" />

            <div className="relative z-10 mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Peringatan Stok Minimum
                    </h2>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        Daftar material yang memerlukan isi ulang stok
                    </p>
                </div>
                {!isStaff && (
                    <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                        <SelectTrigger
                            aria-label="Filter gudang peringatan stok"
                            className="w-[140px] sm:w-40 h-8 text-xs bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors"
                        >
                            <SelectValue placeholder="Pilih Gudang" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Gudang</SelectItem>
                            {warehouses.map((warehouse) => (
                                <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                                    {warehouse.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="relative z-10 flex-1 min-h-0 overflow-auto rounded-lg border border-border/60">
                <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
                    <TableHeader className="sticky top-0 z-20">
                        <TableRow className="hover:bg-transparent border-0">
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Gudang
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Kode Material
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm max-w-24 whitespace-normal px-2 text-right leading-tight font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Rata-rata Kebutuhan
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm max-w-16 whitespace-normal px-2 text-right leading-tight font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Lead Time (Mg)
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm max-w-16 whitespace-normal px-2 text-right leading-tight font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Safety Stock %
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Stok Min
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Stok Saat Ini
                            </TableHead>
                            <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-center font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                                Status
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <AnimatePresence>
                            {visibleWarnings.length === 0 ? (
                                <motion.tr
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                >
                                    <TableCell colSpan={8} className="text-center">
                                        {warnings.length === 0
                                            ? 'Tidak ada material yang dibawah stok minimum'
                                            : 'Tidak ada material dengan Stok Min di atas 0'}
                                    </TableCell>
                                </motion.tr>
                            ) : (
                                visibleWarnings.map((w: StockWarning, index: number) => {
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
                                                {w.qty_stock.toLocaleString('id-ID')}
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
                </table>
            </div>
        </Card>
    );
};
