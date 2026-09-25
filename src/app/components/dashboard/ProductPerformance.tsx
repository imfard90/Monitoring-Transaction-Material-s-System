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

export const ProductPerformance = () => {
    const [warehouseData, setWarehouseData] = useState<any[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const { getWarehousePerformance } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const result = await getWarehousePerformance();
            if (result.success && result.data) {
                setWarehouseData(
                    result.data.map((d: any) => ({
                        key: String(d.key),
                        name: d.name,
                        trxOut: Number(d.trxOut),
                        trxClose: Number(d.trxClose),
                    }))
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
            let badgeColor = 'bg-success text-white';
            if (percentage < 50) badgeColor = 'bg-error text-white';
            else if (percentage < 80) badgeColor = 'bg-warning text-white';

            return {
                ...item,
                percentage,
                badgeColor,
            };
        })
        .sort((a, b) => b.percentage - a.percentage);

    return (
        <CardBox className="w-full">
            <div id="product" className="mb-2">
                <div>
                    <h5 className="card-title">Warehouse Performance</h5>
                    <p className="text-sm text-muted-foreground font-normal">
                        Overview of warehouse out material completion
                    </p>
                </div>
            </div>
            <div className="flex flex-col">
                <div className="-m-1.5 overflow-x-auto">
                    <div className="p-1.5 min-w-full inline-block align-middle">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-sm font-semibold py-2">
                                            No
                                        </TableHead>
                                        <TableHead className="text-sm font-semibold py-2">
                                            Nama WH
                                        </TableHead>
                                        <TableHead className="text-sm font-semibold text-center py-2">
                                            Total Trx Out
                                        </TableHead>
                                        <TableHead className="text-sm font-semibold text-center py-2">
                                            Trx Out Close
                                        </TableHead>
                                        <TableHead className="text-sm font-semibold text-center py-2">
                                            Prosentase
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {performaceData.map((item, index) => (
                                        <TableRow key={item.key} className="border-b border-border">
                                            <TableCell className="py-2">
                                                <p className="text-muted-foreground font-medium text-sm">
                                                    {index + 1}
                                                </p>
                                            </TableCell>

                                            <TableCell className="ps-0 min-w-[200px] py-2">
                                                <h6 className="text-sm font-semibold">
                                                    {item.name}
                                                </h6>
                                            </TableCell>

                                            <TableCell className="text-center py-2">
                                                <p className="font-medium text-muted-foreground text-sm">
                                                    {item.trxOut}
                                                </p>
                                            </TableCell>

                                            <TableCell className="text-center py-2">
                                                <p className="font-medium text-muted-foreground text-sm">
                                                    {item.trxClose}
                                                </p>
                                            </TableCell>

                                            <TableCell className="text-center py-2">
                                                <Badge
                                                    className={`text-[13px] px-3 rounded-full justify-center py-0.5 ${item.badgeColor}`}
                                                >
                                                    {item.percentage}%
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </CardBox>
    );
};
