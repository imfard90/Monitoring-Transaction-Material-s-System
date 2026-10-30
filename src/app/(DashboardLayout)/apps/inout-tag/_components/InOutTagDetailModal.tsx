'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    AlertCircle,
    Ban,
    CheckCircle2,
    Clock,
    FileText,
    PackageCheck,
    RotateCcw,
    Truck,
    User,
} from 'lucide-react';
import type * as React from 'react';
import { ModalDialog } from '@/components/ui/modal-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import { cn } from '@/lib/utils';
import { getInOutTagItems, getReturnMaterialItemsByHeaderId } from '../_actions/tag-actions';

export interface TimelineStep {
    id: string;
    title: string;
    actionId: string | null;
    nik: string | null;
    name: string | null;
    timestamp: Date | string | null;
    status: 'completed' | 'active' | 'pending' | 'cancelled';
    statusLabel?: string;
    icon: React.ComponentType<{ className?: string }>;
}

export function formatStepDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '-';
        return format(d, 'dd MMM yyyy, HH:mm');
    } catch {
        return '-';
    }
}

export function getTimelineSteps(row: InOutTagRow | null): TimelineStep[] {
    if (!row) return [];

    const isReturn = row.type === 'return';
    const isCancelled = row.end_status === 'cancel';

    // Parse cancel actor if formatted as [BATAL - {NIK}]: {alasan}
    const cancelNikMatch = row.notes?.match(/\[BATAL\s*-\s*([^\]]+)\]/i);
    const cancelNik = cancelNikMatch ? cancelNikMatch[1].trim() : null;

    if (isReturn) {
        // Return Material flow: 2 steps
        // Step 1: Pengajuan Return (by Technician / Requester)
        // Step 2: Penerimaan Gudang (by Warehouse Staff)
        const step1: TimelineStep = {
            id: 'request',
            title: 'Pengajuan Return',
            actionId: row.id_trx,
            nik: row.created_by || null,
            name: row.created_by_name || null,
            timestamp: row.request_time || null,
            status: 'completed',
            statusLabel: 'Diajukan',
            icon: RotateCcw,
        };

        let step2Status: TimelineStep['status'] = 'pending';
        let step2Label = 'Menunggu Penerimaan';
        let step2Nik = row.nik_accept || null;
        const step2Name = row.accept_by_name || null;
        const step2Time = row.accept_time || null;

        if (isCancelled) {
            step2Status = 'cancelled';
            step2Label = 'Dibatalkan';
            if (cancelNik) {
                step2Nik = cancelNik;
            }
        } else if (row.end_status === 'closed' || row.accept_id) {
            step2Status = 'completed';
            step2Label = 'Diterima';
        } else {
            step2Status = 'active';
            step2Label = 'Menunggu Penerimaan';
        }

        const step2: TimelineStep = {
            id: 'accept',
            title: 'Penerimaan Gudang',
            actionId: row.accept_id || null,
            nik: step2Nik,
            name: step2Name,
            timestamp: step2Time,
            status: step2Status,
            statusLabel: step2Label,
            icon:
                step2Status === 'cancelled'
                    ? Ban
                    : step2Status === 'completed'
                      ? CheckCircle2
                      : PackageCheck,
        };

        return [step1, step2];
    }

    // InOut Tag flow: 3 steps
    // Step 1: Permintaan (Request)
    // Step 2: Pengiriman (Send)
    // Step 3: Penerimaan (Accept)

    // Step 1: Always completed (initiated when created)
    const step1: TimelineStep = {
        id: 'request',
        title: 'Permintaan',
        actionId: row.request_id || row.id_trx,
        nik: row.created_by || null,
        name: row.created_by_name || null,
        timestamp: row.request_time || null,
        status: 'completed',
        statusLabel: 'Dibuat',
        icon: FileText,
    };

    // Step 2: Send
    let step2Status: TimelineStep['status'] = 'pending';
    let step2Label = 'Menunggu Pengiriman';
    let step2Nik = row.nik_send || null;
    const step2Name = row.send_by_name || null;
    const step2Time = row.send_time || null;

    if (row.send_id) {
        step2Status = 'completed';
        step2Label = 'Dikirim';
    } else if (isCancelled) {
        step2Status = 'cancelled';
        step2Label = 'Dibatalkan';
        if (cancelNik) step2Nik = cancelNik;
    } else if (row.end_status === 'requested') {
        step2Status = 'active';
        step2Label = 'Menunggu Pengiriman';
    }

    const step2: TimelineStep = {
        id: 'send',
        title: 'Pengiriman',
        actionId: row.send_id || null,
        nik: step2Nik,
        name: step2Name,
        timestamp: step2Time,
        status: step2Status,
        statusLabel: step2Label,
        icon: step2Status === 'cancelled' ? Ban : Truck,
    };

    // Step 3: Accept
    let step3Status: TimelineStep['status'] = 'pending';
    let step3Label = 'Menunggu Penerimaan';
    let step3Nik = row.nik_accept || null;
    const step3Name = row.accept_by_name || null;
    const step3Time = row.accept_time || null;

    if (row.end_status === 'closed' || row.accept_id) {
        step3Status = 'completed';
        step3Label = 'Selesai / Diterima';
    } else if (isCancelled) {
        if (row.send_id) {
            // Sent, but cancelled before acceptance
            step3Status = 'cancelled';
            step3Label = 'Dibatalkan';
            if (cancelNik) step3Nik = cancelNik;
        } else {
            // Cancelled at send step, so accept is not processed
            step3Status = 'pending';
            step3Label = 'Tidak Diproses';
        }
    } else if (row.end_status === 'in_transit' || row.send_id) {
        step3Status = 'active';
        step3Label = 'Dalam Perjalanan';
    }

    const step3: TimelineStep = {
        id: 'accept',
        title: 'Penerimaan',
        actionId: row.accept_id || null,
        nik: step3Nik,
        name: step3Name,
        timestamp: step3Time,
        status: step3Status,
        statusLabel: step3Label,
        icon:
            step3Status === 'cancelled'
                ? Ban
                : step3Status === 'completed'
                  ? CheckCircle2
                  : PackageCheck,
    };

    return [step1, step2, step3];
}

interface InOutTagDetailModalProps {
    row: InOutTagRow | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function InOutTagDetailModal({ row, isOpen, onClose }: InOutTagDetailModalProps) {
    const headerId = row?.id || null;
    const status = row?.end_status || '';

    const isReturn = row?.type === 'return';
    const { data, isLoading } = useQuery({
        queryKey: ['inoutTagItems', row?.type, headerId],
        queryFn: async () => {
            if (headerId === null) return { success: false, data: [] };
            const res = isReturn
                ? await getReturnMaterialItemsByHeaderId(Number(headerId))
                : await getInOutTagItems(Number(headerId));
            if (!res.success) throw new Error('Failed to fetch items');
            return res;
        },
        enabled: headerId !== null,
    });

    let items: InOutTagItem[] = data?.data || [];

    // Return items do not have request/send/accept actions; show all of them.
    if (!isReturn && status === 'requested') {
        items = items.filter((item: InOutTagItem) => item.action === 'request');
    } else if (!isReturn && status === 'in_transit') {
        items = items.filter((item: InOutTagItem) => item.action === 'send');
    } else if (!isReturn && status === 'closed') {
        items = items.filter((item: InOutTagItem) => item.action === 'accept');
    }

    const steps = getTimelineSteps(row);

    return (
        <ModalDialog
            isOpen={isOpen}
            onClose={onClose}
            title={`Detail Item Tag (ID Trx: ${row?.id_trx})`}
            className="sm:max-w-[760px]"
        >
            <div className="py-2">
                {/* Visual Timeline / Stepper */}
                <div className="mb-5 p-3.5 sm:p-4 rounded-xl border border-border bg-muted/20 shadow-xs">
                    <div className="flex items-start justify-between w-full relative">
                        {steps.map((step, idx) => {
                            const StepIcon = step.icon;
                            const isLast = idx === steps.length - 1;
                            const nextStep = !isLast ? steps[idx + 1] : null;

                            return (
                                <div
                                    key={step.id}
                                    className="relative flex-1 flex flex-col items-center min-w-0"
                                >
                                    {/* Line connecting to next step */}
                                    {!isLast && nextStep && (
                                        <div
                                            className={cn(
                                                'absolute top-4 sm:top-5 left-1/2 w-full h-[2px] transition-colors',
                                                step.status === 'completed' &&
                                                    nextStep.status === 'completed'
                                                    ? 'bg-primary'
                                                    : nextStep.status === 'cancelled'
                                                      ? 'bg-linear-to-r from-primary to-destructive/70'
                                                      : step.status === 'completed' &&
                                                          nextStep.status === 'active'
                                                        ? 'bg-linear-to-r from-primary to-primary/30'
                                                        : 'bg-border'
                                            )}
                                        />
                                    )}

                                    {/* Circle Icon Badge */}
                                    <div className="relative z-10 flex items-center justify-center mb-2">
                                        <div
                                            className={cn(
                                                'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all',
                                                step.status === 'completed' &&
                                                    'bg-primary text-primary-foreground shadow-xs ring-4 ring-primary/20',
                                                step.status === 'active' &&
                                                    'bg-card border-2 border-primary text-primary shadow-xs ring-4 ring-primary/10 animate-pulse',
                                                step.status === 'cancelled' &&
                                                    'bg-destructive text-destructive-foreground shadow-xs ring-4 ring-destructive/20',
                                                step.status === 'pending' &&
                                                    'bg-muted border border-border text-muted-foreground/60'
                                            )}
                                        >
                                            <StepIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </div>
                                    </div>

                                    {/* Step Title & Status */}
                                    <div className="flex flex-col items-center gap-1 w-full px-1 text-center">
                                        <span
                                            className={cn(
                                                'text-xs sm:text-sm font-semibold truncate max-w-full leading-tight',
                                                step.status === 'completed' && 'text-foreground',
                                                step.status === 'active' && 'text-primary',
                                                step.status === 'cancelled' && 'text-destructive',
                                                step.status === 'pending' &&
                                                    'text-muted-foreground/70'
                                            )}
                                        >
                                            {step.title}
                                        </span>

                                        {step.statusLabel && (
                                            <span
                                                className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block border whitespace-nowrap',
                                                    step.status === 'completed' &&
                                                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                                                    step.status === 'active' &&
                                                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                                                    step.status === 'cancelled' &&
                                                        'bg-destructive/10 text-destructive border-destructive/20',
                                                    step.status === 'pending' &&
                                                        'bg-muted/40 text-muted-foreground/60 border-transparent'
                                                )}
                                            >
                                                {step.statusLabel}
                                            </span>
                                        )}

                                        {step.actionId && (
                                            <span
                                                className="font-mono text-[10px] sm:text-[11px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50 max-w-full truncate"
                                                title={step.actionId}
                                            >
                                                {step.actionId}
                                            </span>
                                        )}
                                    </div>

                                    {/* Actor (NIK - Nama) */}
                                    <div className="mt-1.5 text-center w-full px-1 flex flex-col justify-center min-h-[28px]">
                                        {step.status === 'pending' ? (
                                            <span className="text-[11px] text-muted-foreground/40">
                                                -
                                            </span>
                                        ) : step.nik || step.name ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="inline-flex items-center justify-center gap-1 text-[11px] sm:text-xs font-medium text-foreground max-w-full cursor-default">
                                                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                                                        <span className="truncate">
                                                            {step.nik ? step.nik : ''}
                                                            {step.nik && step.name ? ' - ' : ''}
                                                            {step.name ? step.name : ''}
                                                        </span>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="bottom" className="text-xs">
                                                    <p className="font-semibold">
                                                        {step.name || 'Nama tidak tersedia'}
                                                    </p>
                                                    {step.nik && (
                                                        <p className="text-muted-foreground font-mono">
                                                            NIK: {step.nik}
                                                        </p>
                                                    )}
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : step.status === 'active' ? (
                                            <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80 italic">
                                                Menunggu proses
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground">
                                                -
                                            </span>
                                        )}
                                    </div>

                                    {/* Timestamp */}
                                    <div className="mt-0.5 text-center w-full px-1">
                                        {step.timestamp ? (
                                            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-mono block">
                                                {formatStepDate(step.timestamp)}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground/30 font-mono">
                                                -
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Notes / Reason Alert */}
                {row?.notes && (
                    <div
                        className={cn(
                            'mb-4 p-3.5 rounded-lg border text-xs leading-relaxed',
                            row.end_status === 'cancel'
                                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                                : 'bg-muted/50 border-border text-foreground'
                        )}
                    >
                        <div className="font-semibold flex items-center gap-1.5 mb-1.5 text-xs sm:text-sm">
                            {row.end_status === 'cancel' ? (
                                <>
                                    <Ban size={15} className="shrink-0" />
                                    <span>Alasan Pembatalan Transaksi</span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle
                                        size={15}
                                        className="shrink-0 text-muted-foreground"
                                    />
                                    <span>Catatan Transaksi</span>
                                </>
                            )}
                        </div>
                        <p className="whitespace-pre-wrap font-sans text-xs sm:text-[13px] opacity-90 pl-5">
                            {row.notes}
                        </p>
                    </div>
                )}
                {isLoading ? (
                    <p className="text-center text-muted-foreground py-4" role="status">
                        Memuat data, mohon tunggu...
                    </p>
                ) : items.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4" role="status">
                        Tidak ada item untuk status tag ini.
                    </p>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm text-left text-muted-foreground">
                            <thead className="text-sm text-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-4 py-3">No</th>
                                    <th className="px-4 py-3">Designator / Kode</th>
                                    <th className="px-4 py-3">Deskripsi</th>
                                    <th className="px-4 py-3 text-right">Jumlah</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item: InOutTagItem, idx: number) => (
                                    <tr
                                        key={item.id}
                                        className="bg-background border-b hover:bg-muted/50"
                                    >
                                        <td className="px-4 py-3">{idx + 1}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {item.designator_code || item.material_code || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.material_description || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {item.qty}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </ModalDialog>
    );
}
