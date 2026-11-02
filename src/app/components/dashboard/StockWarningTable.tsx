'use client';

import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export interface StockWarning {
    warehouse_name: string | null;
    material_code: string | null;
    material_name?: string | null;
    material_unit?: string | null;
    average_demand_weekly: string;
    lead_time_weeks: number;
    safety_stock_pct: string;
    min_qty: number;
    qty_stock: number;
    deficit: number;
}

type WarehouseOption = { id: number; name: string };
type StatusFilter = 'all' | 'deficit';

export const StockWarningTable = ({
    isStaff,
    warehouses,
}: {
    isStaff: boolean;
    warehouses: WarehouseOption[];
}) => {
    const shouldReduceMotion = useReducedMotion();
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const targetWh = isStaff ? 'all' : selectedWarehouse;

    const {
        data: warnings = [],
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: queryKeys.dashboard.stockWarning(targetWh),
        queryFn: async () => {
            const { getStockWarnings } = await import(
                '@/app/(DashboardLayout)/_actions/dashboard-actions'
            );
            const res = await getStockWarnings(targetWh);
            return res.success && res.data ? (res.data as StockWarning[]) : [];
        },
        staleTime: 60 * 1000,
    });

    // Material with active policies (min_qty > 0)
    const activeWarnings = useMemo(
        () => warnings.filter((item) => item.min_qty > 0),
        [warnings]
    );

    // Number of items in deficit / warning
    const deficitCount = useMemo(
        () => activeWarnings.filter((item) => item.qty_stock < item.min_qty).length,
        [activeWarnings]
    );

    // Filtered data based on status toggle and search query
    const filteredWarnings = useMemo(() => {
        let result = activeWarnings;

        if (statusFilter === 'deficit') {
            result = result.filter((item) => item.qty_stock < item.min_qty);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(
                (item) =>
                    item.material_code?.toLowerCase().includes(q) ||
                    item.material_name?.toLowerCase().includes(q) ||
                    item.warehouse_name?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [activeWarnings, statusFilter, searchQuery]);

    return (
        <Card className="border border-border/80 bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-sm p-3.5 sm:p-4 motion-reduce:transition-none relative flex flex-col w-full h-full min-h-0 flex-1 overflow-hidden">
            {/* Ambient background decoration */}
            <div
                className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-linear-to-bl from-amber-500/5 to-transparent"
                aria-hidden="true"
            />

            {/* Header Section */}
            <div className="relative z-10 mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                        <Icon icon="solar:shield-warning-bold-duotone" width={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Peringatan Stok Minimum
                            </h2>
                            {!isLoading && !isError && (
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'text-[11px] font-semibold tracking-tight transition-colors',
                                        deficitCount > 0
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    )}
                                >
                                    {deficitCount > 0 ? (
                                        <span className="flex items-center gap-1">
                                            <Icon icon="solar:danger-triangle-bold" width={12} />
                                            {deficitCount} Perlu Restock
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <Icon icon="solar:check-circle-bold" width={12} />
                                            Stok Aman
                                        </span>
                                    )}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            Daftar material yang memerlukan pengisian ulang stok gudang
                        </p>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Status Filter Toggle */}
                    <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                                statusFilter === 'all'
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Semua ({activeWarnings.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('deficit')}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                                statusFilter === 'deficit'
                                    ? 'bg-background text-rose-600 dark:text-rose-400 shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Defisit ({deficitCount})
                        </button>
                    </div>

                    {/* Warehouse Selector (for non-staff) */}
                    {!isStaff && (
                        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                            <SelectTrigger
                                aria-label="Filter gudang peringatan stok"
                                className="w-32.5 sm:w-36 h-8 text-xs bg-background/60 border-border/70 hover:border-primary/50 transition-colors shadow-xs"
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

                    {/* Search Field */}
                    <div className="relative">
                        <Icon
                            icon="solar:magnifer-linear"
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                            width={14}
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari material..."
                            className="h-8 w-28 sm:w-36 rounded-md border border-border/70 bg-background/60 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label="Hapus pencarian"
                            >
                                <Icon icon="solar:close-circle-bold" width={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table / Content Container */}
            <div className="relative z-10 flex-1 min-h-0 overflow-auto rounded-lg border border-border/60 bg-card">
                {isLoading ? (
                    /* Loading State Skeleton */
                    <div className="p-3 space-y-2.5" role="status" aria-label="Memuat data peringatan stok">
                        <div className="flex justify-between items-center pb-2 border-b border-border/40">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                        {Array.from({ length: 5 }).map((_, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton placeholders
                            <div key={i} className="flex items-center justify-between py-2 border-b border-border/30">
                                <div className="space-y-1 w-1/4">
                                    <Skeleton className="h-3.5 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                                <div className="space-y-1 w-1/3">
                                    <Skeleton className="h-3.5 w-28" />
                                    <Skeleton className="h-3 w-40" />
                                </div>
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-6 w-16 rounded-md" />
                            </div>
                        ))}
                    </div>
                ) : isError ? (
                    /* Error State */
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-3">
                            <Icon icon="solar:danger-triangle-bold-duotone" width={28} />
                        </div>
                        <p className="text-sm font-semibold text-foreground">Gagal Memuat Data</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                            Terjadi kendala saat mengambil data peringatan stok minimum. Silakan coba kembali.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            className="mt-4 gap-1.5 text-xs h-8"
                        >
                            <Icon icon="solar:refresh-linear" width={14} />
                            Muat Ulang
                        </Button>
                    </div>
                ) : filteredWarnings.length === 0 ? (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        {searchQuery || statusFilter === 'deficit' ? (
                            <>
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-3">
                                    <Icon icon="solar:box-minimalistic-bold-duotone" width={28} />
                                </div>
                                <p className="text-sm font-semibold text-foreground">
                                    Tidak Ada Material Ditemukan
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    {statusFilter === 'deficit'
                                        ? 'Tidak ada material yang berada dalam status defisit untuk filter ini.'
                                        : 'Tidak ada material yang cocok dengan kata kunci pencarian Anda.'}
                                </p>
                                {(searchQuery || statusFilter === 'deficit') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSearchQuery('');
                                            setStatusFilter('all');
                                        }}
                                        className="mt-3.5 text-xs h-7"
                                    >
                                        Reset Filter
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3 ring-1 ring-emerald-500/20">
                                    <Icon icon="solar:shield-check-bold-duotone" width={28} />
                                </div>
                                <p className="text-sm font-semibold text-foreground">
                                    Seluruh Stok Berada Dalam Batas Aman
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    Tidak ada material yang berada di bawah stok minimum operasional.
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    /* Data Table */
                    <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
                        <TableHeader className="sticky top-0 z-20">
                            <TableRow className="hover:bg-transparent border-0">
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Gudang
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Kode Material
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Demand / Parameter
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Stok Min
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Stok Saat Ini
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-right font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Defisit
                                </TableHead>
                                <TableHead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm text-center font-semibold text-foreground/90 shadow-[inset_0_-1px_0_0_hsl(var(--border))] text-xs py-2.5">
                                    Status
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filteredWarnings.map((w: StockWarning, index: number) => {
                                    const isWarning = w.qty_stock < w.min_qty;
                                    const ratio = w.min_qty > 0 ? Math.round((w.qty_stock / w.min_qty) * 100) : 100;

                                    return (
                                        <motion.tr
                                            key={`${w.warehouse_name}-${w.material_code}`}
                                            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                                            transition={{ duration: 0.15, delay: index * 0.02 }}
                                            className={cn(
                                                'border-b border-border/40 transition-colors hover:bg-muted/40',
                                                isWarning && 'bg-rose-500/3 dark:bg-rose-500/5'
                                            )}
                                        >
                                            {/* Warehouse Name */}
                                            <TableCell className="py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">
                                                {w.warehouse_name || '-'}
                                            </TableCell>

                                            {/* Material Code & Name */}
                                            <TableCell className="py-2.5">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="inline-flex w-fit rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-foreground shadow-xs">
                                                        {w.material_code || '-'}
                                                    </span>
                                                    {w.material_name && (
                                                        <span
                                                            className="text-[11px] text-muted-foreground truncate max-w-[180px] sm:max-w-[240px]"
                                                            title={w.material_name}
                                                        >
                                                            {w.material_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Demand & Policy Parameters */}
                                            <TableCell className="py-2.5 text-right whitespace-nowrap">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="text-xs font-medium text-foreground">
                                                        {Number(w.average_demand_weekly).toFixed(1)} / mgg
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        LT: {w.lead_time_weeks} mg • SS: {Number(w.safety_stock_pct).toFixed(0)}%
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* Minimum Stock */}
                                            <TableCell className="py-2.5 text-right whitespace-nowrap">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {w.min_qty.toLocaleString('id-ID')}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {w.material_unit || 'unit'}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* Current Stock & Visual Fill Ratio */}
                                            <TableCell className="py-2.5 text-right whitespace-nowrap">
                                                <div className="flex flex-col items-end gap-1">
                                                    <span
                                                        className={cn(
                                                            'text-xs font-bold',
                                                            isWarning
                                                                ? 'text-rose-600 dark:text-rose-400'
                                                                : 'text-emerald-600 dark:text-emerald-400'
                                                        )}
                                                    >
                                                        {w.qty_stock.toLocaleString('id-ID')}
                                                    </span>
                                                    <div
                                                        className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"
                                                        title={`Rasio stok terhadap batas minimum: ${ratio}%`}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'h-full rounded-full transition-all duration-300',
                                                                ratio < 50
                                                                    ? 'bg-rose-500'
                                                                    : ratio < 100
                                                                    ? 'bg-amber-500'
                                                                    : 'bg-emerald-500'
                                                            )}
                                                            style={{ width: `${Math.min(100, Math.max(5, ratio))}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Deficit Amount */}
                                            <TableCell className="py-2.5 text-right whitespace-nowrap">
                                                {isWarning ? (
                                                    <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                                                        -{w.deficit.toLocaleString('id-ID')}
                                                    </span>
                                                ) : (
                                                    <span className="font-mono text-xs text-muted-foreground/70">
                                                        0
                                                    </span>
                                                )}
                                            </TableCell>

                                            {/* Status Badge */}
                                            <TableCell className="py-2.5 text-center whitespace-nowrap">
                                                {isWarning ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[11px] font-semibold"
                                                    >
                                                        Defisit
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-semibold"
                                                    >
                                                        Aman
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </TableBody>
                    </table>
                )}
            </div>
        </Card>
    );
};
