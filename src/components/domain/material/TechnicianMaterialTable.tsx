'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

export interface TechnicianMaterialRow {
    sap_out_item_id: number | string;
    id_trx?: string | number | null;
    request_time?: string | Date | null;
    sap_number?: string | null;
    material_code?: string | null;
    description?: string | null;
    qty_req: number;
    qty_used?: number | null;
}

export interface TechnicianMaterialTableProps {
    materials: TechnicianMaterialRow[];
    loading?: boolean;
    emptyMessage?: string;
    mode: 'input' | 'allocation';
    /** Map of sap_out_item_id -> quantity (string input or number allocated) */
    quantities: Record<string | number, string | number>;
    onQuantityChange?: (itemId: number | string, val: string) => void;
    showTransactionId?: boolean;
    className?: string;
    hideNoColumn?: boolean;
    hideDescriptionColumn?: boolean;
    wrapAllocationHeader?: boolean;
}

export function TechnicianMaterialTable({
    materials,
    loading = false,
    emptyMessage = 'Tidak ada material di tangan teknisi.',
    mode,
    quantities,
    onQuantityChange,
    showTransactionId = false,
    className = '',
    hideNoColumn = false,
    hideDescriptionColumn = false,
    wrapAllocationHeader = false,
}: TechnicianMaterialTableProps) {
    if (loading) {
        return (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground bg-muted/40">
                Memuat daftar material teknisi...
            </div>
        );
    }

    if (materials.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/30">
                {emptyMessage}
            </div>
        );
    }

    const totalAvailable = materials.reduce(
        (sum, m) => sum + (m.qty_req - (m.qty_used || 0)),
        0
    );

    const totalQty = Object.values(quantities).reduce<number>((sum, val) => {
        const num = Number(val);
        return sum + (Number.isNaN(num) ? 0 : num);
    }, 0);

    const colSpanBeforeTotal =
        (hideNoColumn ? 0 : 1) +
        1 +
        (showTransactionId ? 1 : 0) +
        1 +
        1 +
        (hideDescriptionColumn ? 0 : 1);

    return (
        <div className={`rounded-md border overflow-x-auto ${className}`}>
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs shadow-2xs">
                    <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/80">
                        {!hideNoColumn && (
                            <TableHead className="w-[45px] text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                No
                            </TableHead>
                        )}
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[120px]">
                            Tanggal
                        </TableHead>
                        {showTransactionId && (
                            <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                ID Trx
                            </TableHead>
                        )}
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Nomor SAP
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[110px]">
                            Kode Material
                        </TableHead>
                        {!hideDescriptionColumn && (
                            <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">
                                Deskripsi Material
                            </TableHead>
                        )}
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[80px]">
                            Sisa Stok
                        </TableHead>
                        <TableHead
                            className={`text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${
                                wrapAllocationHeader ? 'w-[85px] px-1' : 'w-[120px]'
                            }`}
                        >
                            {mode === 'input' ? (
                                'Qty Pakai'
                            ) : wrapAllocationHeader ? (
                                <span className="block text-center leading-snug">
                                    Alokasi
                                    <br />
                                    Terpakai
                                </span>
                            ) : (
                                'Alokasi Terpakai'
                            )}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <AnimatePresence>
                        {materials.map((m, index) => {
                            const availableQty = m.qty_req - (m.qty_used || 0);
                            const rawVal = quantities[m.sap_out_item_id];
                            const currentQty = rawVal !== undefined ? rawVal : '';
                            const isAllocated = Number(currentQty) > 0;

                            return (
                                <motion.tr
                                    key={m.sap_out_item_id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15, delay: index * 0.02 }}
                                    className={`border-b transition-colors hover:bg-muted/50 ${
                                        isAllocated && mode === 'allocation'
                                            ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
                                            : ''
                                    }`}
                                >
                                    {!hideNoColumn && (
                                        <TableCell className="text-center font-medium py-2 px-2 text-xs text-muted-foreground">
                                            {index + 1}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-xs py-2 px-2.5 font-mono whitespace-nowrap text-muted-foreground">
                                        {m.request_time
                                            ? new Date(m.request_time).toLocaleDateString('id-ID', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  year: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                              })
                                            : '-'}
                                    </TableCell>
                                    {showTransactionId && (
                                        <TableCell className="text-xs py-2 px-2 font-mono">
                                            {m.id_trx || '-'}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-xs py-2 px-2.5 font-mono font-medium text-foreground">
                                        {m.sap_number || '-'}
                                    </TableCell>
                                    <TableCell className="font-bold py-2 px-2.5 text-xs font-mono text-primary">
                                        {m.material_code}
                                    </TableCell>
                                    {!hideDescriptionColumn && (
                                        <TableCell className="text-xs py-2 px-2">
                                            <span
                                                className="line-clamp-2"
                                                title={m.description || ''}
                                            >
                                                {m.description || '-'}
                                            </span>
                                        </TableCell>
                                    )}
                                    <TableCell className="text-center font-bold py-2 px-2 text-xs font-mono tabular-nums text-foreground">
                                        {availableQty}
                                    </TableCell>
                                    <TableCell className="py-1 px-2 text-center">
                                        {mode === 'input' ? (
                                            <Input
                                                type="number"
                                                min="0"
                                                max={availableQty}
                                                value={currentQty}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    if (raw === '') {
                                                        onQuantityChange?.(m.sap_out_item_id, '');
                                                        return;
                                                    }
                                                    let num = Number(raw);
                                                    if (num > availableQty) {
                                                        num = availableQty;
                                                        toast.error(
                                                            `Jumlah maksimal untuk ${m.material_code} adalah ${availableQty}`
                                                        );
                                                    }
                                                    onQuantityChange?.(
                                                        m.sap_out_item_id,
                                                        String(num)
                                                    );
                                                }}
                                                className="h-8 text-center text-xs font-mono font-medium"
                                                placeholder="0"
                                            />
                                        ) : (
                                            <span
                                                className={`text-xs font-mono font-bold tabular-nums ${
                                                    isAllocated
                                                        ? 'text-emerald-600 dark:text-emerald-400 font-extrabold'
                                                        : 'text-muted-foreground/50'
                                                }`}
                                            >
                                                {currentQty || '0'}
                                            </span>
                                        )}
                                    </TableCell>
                                </motion.tr>
                            );
                        })}
                    </AnimatePresence>
                </TableBody>
                <TableFooter className="bg-muted/40 font-semibold text-xs border-t sticky bottom-0 z-10 backdrop-blur-xs">
                    <TableRow>
                        <TableCell
                            colSpan={colSpanBeforeTotal}
                            className="text-right py-2 px-2.5 text-muted-foreground"
                        >
                            Total:
                        </TableCell>
                        <TableCell className="text-center py-2 px-2 text-foreground font-mono font-bold tabular-nums">
                            {totalAvailable}
                        </TableCell>
                        <TableCell className="text-center py-2 px-2 text-primary font-mono font-bold tabular-nums">
                            {totalQty}
                        </TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );
}
