'use client';

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

export const StockWarningTable = () => {
    const [warnings, setWarnings] = useState<any[]>([]);

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
                        {warnings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center">
                                    Tidak ada material yang dibawah stok minimum
                                </TableCell>
                            </TableRow>
                        ) : (
                            warnings.map((w, index) => (
                                <TableRow key={index}>
                                    <TableCell>{w.warehouse_name}</TableCell>
                                    <TableCell className="font-medium">{w.material_code}</TableCell>
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
                                    <TableCell className="text-right font-bold text-red-600">
                                        {w.qty_stock}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="destructive">Refill</Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardBox>
    );
};
