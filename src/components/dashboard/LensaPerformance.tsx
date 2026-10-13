'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type WarehouseMetric = {
    key: number;
    name: string;
    total: number;
    completed: number;
    percentage: number;
};

type LensaMetrics = {
    outLensa: WarehouseMetric[];
    rekonLensa: WarehouseMetric[];
};

function calculatePercentage(completed: number, total: number): number {
    return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function getCompletionBadgeClass(percentage: number): string {
    if (percentage < 50) return 'bg-error text-white';
    if (percentage < 80) return 'bg-warning text-white';
    return 'bg-success text-white';
}

function sortByCompletion(rows: WarehouseMetric[]): WarehouseMetric[] {
    return [...rows].sort(
        (left, right) =>
            calculatePercentage(right.completed, right.total) -
                calculatePercentage(left.completed, left.total) ||
            left.name.localeCompare(right.name)
    );
}

function MetricTable({
    title,
    description,
    rows,
    isLoading,
    hasError,
}: {
    title: string;
    description: string;
    rows: WarehouseMetric[];
    isLoading: boolean;
    hasError: boolean;
}) {
    return (
        <Card className="min-w-0 p-4">
            <CardHeader className="space-y-0.5 p-0">
                <CardTitle className="text-lg font-semibold">{title}</CardTitle>
                <CardDescription className="text-sm">{description}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="space-y-2" role="status" aria-label={`Memuat ${title}`}>
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                    </div>
                ) : hasError ? (
                    <p className="py-2 text-center text-sm text-destructive">
                        Data performa tidak dapat dimuat saat ini.
                    </p>
                ) : rows.length === 0 ? (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                        Belum ada data.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed min-w-[420px] text-sm">
                            <colgroup>
                                <col className="w-7" />
                                <col className="w-[30%]" />
                                <col className="w-12" />
                                <col className="w-12" />
                                <col className="w-14" />
                            </colgroup>
                            <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                    <th
                                        scope="col"
                                        className="w-7 px-1 py-1 text-left font-semibold"
                                    >
                                        No
                                    </th>
                                    <th scope="col" className="px-1 py-1 text-left font-semibold">
                                        Gudang
                                    </th>
                                    <th scope="col" className="px-1 py-1 text-center font-semibold">
                                        Total
                                    </th>
                                    <th scope="col" className="px-1 py-1 text-center font-semibold">
                                        Selesai
                                    </th>
                                    <th scope="col" className="px-1 py-1 text-center font-semibold">
                                        Persentase
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortByCompletion(rows).map((row, index) => (
                                    <tr key={row.key} className="border-b last:border-0">
                                        <td className="px-1 py-1 text-left text-sm font-medium text-muted-foreground">
                                            {index + 1}
                                        </td>
                                        <th
                                            scope="row"
                                            className="max-w-0 truncate px-1 py-1 text-left text-sm font-semibold"
                                            title={row.name}
                                        >
                                            {row.name}
                                        </th>
                                        <td className="px-1 py-1 text-center font-medium text-muted-foreground">
                                            {Number(row.total)}
                                        </td>
                                        <td className="px-1 py-1 text-center font-medium text-muted-foreground">
                                            {Number(row.completed)}
                                        </td>
                                        <td className="px-1 py-1 text-center">
                                            <Badge
                                                className={getCompletionBadgeClass(row.percentage)}
                                            >
                                                {row.percentage}%
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function LensaPerformance() {
    const [metrics, setMetrics] = useState<LensaMetrics>({ outLensa: [], rekonLensa: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isActive = true;
        const loadMetrics = async () => {
            try {
                const { getLensaWarehousePerformance } = await import(
                    '@/app/(DashboardLayout)/_actions/dashboard-actions'
                );
                const result = await getLensaWarehousePerformance();
                if (isActive && result.success && result.data) {
                    setMetrics({
                        outLensa: result.data.outLensa.map((row) => ({
                            ...row,
                            total: Number(row.total),
                            completed: Number(row.completed),
                            percentage: calculatePercentage(
                                Number(row.completed),
                                Number(row.total)
                            ),
                        })),
                        rekonLensa: result.data.rekonLensa.map((row) => ({
                            ...row,
                            total: Number(row.total),
                            completed: Number(row.completed),
                            percentage: calculatePercentage(
                                Number(row.completed),
                                Number(row.total)
                            ),
                        })),
                    });
                } else if (isActive) {
                    setHasError(true);
                }
            } catch {
                if (isActive) setHasError(true);
            } finally {
                if (isActive) setIsLoading(false);
            }
        };
        void loadMetrics();
        return () => {
            isActive = false;
        };
    }, []);

    return (
        <section aria-label="Performa Lensa" className="contents">
            <MetricTable
                title="Performa Out Lensa HI"
                description="Ringkasan pengeluaran dan transaksi yang telah diproses SAP per gudang."
                rows={metrics.outLensa}
                isLoading={isLoading}
                hasError={hasError}
            />
            <MetricTable
                title="Performa Rekon Lensa"
                description="Ringkasan WO Lensa dan WO yang sudah masuk ke Rekon Lensa per gudang."
                rows={metrics.rekonLensa}
                isLoading={isLoading}
                hasError={hasError}
            />
        </section>
    );
}
