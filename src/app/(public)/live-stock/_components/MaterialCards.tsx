'use client';

import { ChevronDownIcon, ClockIcon, PackageSearchIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
    calculateDaysUntilRunout,
    groupByMaterial,
    type StockItem,
    type StockStatus,
    warehouseLocation,
} from '../_lib/stock-status';

interface MaterialCardsProps {
    items: StockItem[];
}

const STATUS_RANK: Record<StockStatus, number> = {
    critical: 0,
    low: 1,
    normal: 2,
    overstock: 3,
};

/** Warna aksen per status; dipakai sebagai bar vertikal dan titik lokasi. */
const STATUS_COLOR: Record<StockStatus, string> = {
    critical: 'bg-destructive',
    low: 'bg-warning',
    normal: 'bg-success',
    overstock: 'bg-primary',
};

/** Ringkasan mobile per material: kartu ringkas, detail gudang dibuka saat kartu diketuk. */
export function MaterialCards({ items }: MaterialCardsProps) {
    const groups = useMemo(() => {
        return groupByMaterial(items).sort((a, b) => {
            const rankA = Math.min(...a.warehouses.map((w) => STATUS_RANK[w.stock_status]));
            const rankB = Math.min(...b.warehouses.map((w) => STATUS_RANK[w.stock_status]));
            return rankA - rankB || a.material_code.localeCompare(b.material_code);
        });
    }, [items]);

    return (
        <div>
            {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-12 text-center">
                    <PackageSearchIcon
                        className="size-8 text-muted-foreground/70"
                        aria-hidden="true"
                    />
                    <p className="text-sm font-medium text-foreground">Tidak ada material cocok</p>
                    <p className="text-xs text-muted-foreground">
                        Coba kata kunci lain atau hapus pencarian.
                    </p>
                </div>
            ) : (
                <Accordion type="single" collapsible className="space-y-3 last:border-b-0">
                    {groups.map((group) => {
                        const worstStatus = group.warehouses.reduce<StockStatus>(
                            (worst, w) =>
                                STATUS_RANK[w.stock_status] < STATUS_RANK[worst]
                                    ? w.stock_status
                                    : worst,
                            'overstock'
                        );
                        const days = calculateDaysUntilRunout(
                            group.total_qty,
                            group.average_demand_weekly,
                            group.has_out_material_history
                        );
                        const isUrgent = days !== null && days <= 7;

                        return (
                            <AccordionItem
                                key={group.material_code}
                                value={group.material_code}
                                className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow last:border-b hover:border-primary/40 data-[state=open]:border-primary/40 data-[state=open]:shadow-md"
                            >
                                <AccordionTrigger className="p-0 hover:no-underline [&>svg]:hidden">
                                    <div className="flex w-full items-stretch gap-3">
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                'my-3 ml-3 w-1 shrink-0 rounded-full',
                                                STATUS_COLOR[worstStatus]
                                            )}
                                        />
                                        <div className="min-w-0 flex-1 py-3.5 pr-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                                                        {group.material_code}
                                                    </p>
                                                    <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-semibold text-foreground">
                                                        {group.material_name}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-xl leading-none font-bold tabular-nums text-foreground">
                                                        {group.total_qty.toLocaleString('id-ID')}
                                                    </p>
                                                    <p className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">
                                                        {group.material_unit}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1.5 text-xs',
                                                        isUrgent
                                                            ? 'font-semibold text-destructive'
                                                            : 'text-muted-foreground'
                                                    )}
                                                >
                                                    <ClockIcon
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                    {days === null
                                                        ? 'Belum ada riwayat keluar'
                                                        : days === 0
                                                          ? 'Stok habis'
                                                          : `Habis dalam ${days} hari`}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                    {group.warehouse_count} gudang
                                                    <ChevronDownIcon
                                                        className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pb-0">
                                    <ul className="divide-y divide-border/60 border-t border-border/60 bg-muted/30">
                                        {group.warehouses.map((row) => (
                                            <li
                                                key={`${row.warehouse_id}-${row.material_id}`}
                                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span
                                                        aria-hidden="true"
                                                        className={cn(
                                                            'size-1.5 shrink-0 rounded-full',
                                                            STATUS_COLOR[row.stock_status]
                                                        )}
                                                    />
                                                    <span className="truncate text-sm text-foreground">
                                                        {warehouseLocation(row.warehouse_name)}
                                                    </span>
                                                </div>
                                                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                                                    {row.qty_stock.toLocaleString('id-ID')}
                                                    <span className="ml-1 text-[10px] tracking-wider text-muted-foreground uppercase">
                                                        {row.material_unit}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
}
