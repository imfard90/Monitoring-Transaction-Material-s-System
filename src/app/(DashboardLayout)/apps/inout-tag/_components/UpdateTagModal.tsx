'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import { acceptReturnTag, cancelTag, updateTag } from '../_actions/tag-actions';

interface UpdateTagModalProps {
    isOpen: boolean;
    onClose: () => void;
    row: InOutTagRow | null;
    items: InOutTagItem[];
    isStaff: boolean;
    warehouseIds: number[];
}

interface MaterialItem {
    id: string; // frontend id
    designator_id: number;
    code: string;
    description: string;
    unit: string;
    qty: number | string;
}

export default function UpdateTagModal({
    isOpen,
    onClose,
    row,
    items,
    isStaff,
    warehouseIds,
}: UpdateTagModalProps) {
    const queryClient = useQueryClient();

    // Determine state
    const isUpdatingRequest = !row?.request_id;
    const isUpdatingSend = !!row?.request_id && !row?.send_id;
    const isUpdatingAccept = !!row?.send_id && !row?.accept_id;

    const isReturn = row?.type === 'return';

    const actionType = isReturn
        ? 'accept'
        : isUpdatingRequest
          ? 'request'
          : isUpdatingSend
            ? 'send'
            : isUpdatingAccept
              ? 'accept'
              : null;

    // Field labels
    const idLabel = isReturn
        ? 'Accept ID'
        : isUpdatingRequest
          ? 'Request ID'
          : isUpdatingSend
            ? 'Send ID'
            : 'Accept ID';

    // ── Access control for the current action ───────────────────────────────
    // - request : only non-Staff
    // - send    : non-Staff OR user is PIC of the sending warehouse (from_wh_id)
    // - accept  : non-Staff OR user is PIC of the receiving warehouse (to_wh_id)
    // For Staff we approximate "PIC of warehouse" by membership in warehouseIds
    // (the same set used to scope the tag list). Non-Staff may perform any action.
    const fromWhId = row?.from_wh_id ?? null;
    const toWhId = row?.to_wh_id ?? null;

    const canUpdate = (() => {
        if (!isStaff) return true; // Admin / non-Staff: bebas
        if (actionType === 'request') return false;
        if (actionType === 'send')
            return fromWhId !== null && warehouseIds.includes(Number(fromWhId));
        if (actionType === 'accept')
            return toWhId !== null && warehouseIds.includes(Number(toWhId));
        return false;
    })();

    const deniedReason = (() => {
        if (canUpdate) return null;
        if (actionType === 'request')
            return 'Anda tidak berhak mengisi Request ID (hanya non-Staff).';
        if (actionType === 'send')
            return 'Anda tidak berhak mengisi Send ID (hanya PIC gudang pengirim).';
        if (actionType === 'accept')
            return 'Anda tidak berhak mengisi Accept ID (hanya PIC gudang penerima).';
        return 'Anda tidak berhak melakukan aksi ini.';
    })();

    const [actionId, setActionId] = useState('');
    const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [cancelNotes, setCancelNotes] = useState('');

    useEffect(() => {
        if (isOpen && row && items.length > 0) {
            setActionId('');

            // For inout tags: when accepting, default quantities to the sent quantities if available;
            // when sending, default quantities to requested quantities.
            // For return: take all items.
            let relevantItems = items;
            if (!isReturn) {
                const sendItems = items.filter((i) => i.action === 'send');
                const reqItems = items.filter((i) => i.action === 'request');
                if (actionType === 'accept' && sendItems.length > 0) {
                    relevantItems = sendItems;
                } else if (reqItems.length > 0) {
                    relevantItems = reqItems;
                }
            }

            const baseItems = relevantItems.map((i) => ({
                id: crypto.randomUUID(),
                designator_id: Number(i.designator_id) || 0,
                code: i.material_code || '',
                description: i.material_description || '',
                unit: i.material_unit || '',
                qty: i.qty,
            }));

            setMaterialItems(baseItems);
        }
    }, [isOpen, row, items, isReturn, actionType]);

    const updateMutation = useMutation({
        mutationFn: async () => {
            if (!actionType) throw new Error('Status transaksi tidak valid');
            if (!actionId) throw new Error(`${idLabel} wajib diisi`);

            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            if (isReturn) {
                return acceptReturnTag(Number(row?.id), actionId, idemKey);
            }

            return updateTag({
                headerId: Number(row?.id),
                actionType,
                actionId,
                items: materialItems.map((i) => ({
                    designator_id: Number(i.designator_id),
                    qty: Number(i.qty),
                })),
                idemKey,
            });
        },
        onSuccess: (res) => {
            if (res.success) {
                toast.success('Transaksi tag berhasil diperbarui');
                queryClient.invalidateQueries({ queryKey: ['inoutTags'] });
                onClose();
            } else {
                toast.error(res.error || 'Gagal memperbarui transaksi tag');
            }
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const handleQtyChange = (id: string, value: number) => {
        setMaterialItems(materialItems.map((i) => (i.id === id ? { ...i, qty: value } : i)));
    };

    const cancelMutation = useMutation({
        mutationFn: async (notes: string) => {
            return cancelTag(Number(row?.id), notes, row?.type);
        },
        onSuccess: (res) => {
            if (res.success) {
                toast.success('Transaksi tag berhasil dibatalkan');
                queryClient.invalidateQueries({ queryKey: ['inoutTags'] });
                setIsCancelConfirmOpen(false);
                setCancelNotes('');
                onClose();
            } else {
                toast.error(res.error || 'Gagal membatalkan transaksi tag');
            }
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    if (!row || !actionType) return null;

    return (
        <>
            <ModalDialog
                isOpen={isOpen}
                onClose={onClose}
                title={`Perbarui Tag: ${row.id_trx}`}
                className="sm:max-w-[700px]"
                preventOutsideClose
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">ID Transaksi</p>
                            <p className="font-medium">{row.id_trx}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Gudang</p>
                            <p className="font-medium">
                                {row.from_wh_name} ➔ {row.to_wh_name}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Status Saat Ini</p>
                            <Badge variant="outline">{row.end_status}</Badge>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{idLabel}</Label>
                            {canUpdate ? (
                                <Input
                                    placeholder={`Masukkan ${idLabel}...`}
                                    value={actionId}
                                    onChange={(e) => setActionId(e.target.value)}
                                />
                            ) : (
                                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                                    {deniedReason}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Material list: editable for inout, read-only for return */}
                {materialItems.length > 0 && (
                    <div className="mt-4 space-y-4">
                        <Label className="text-base font-semibold">
                            {isReturn
                                ? 'Daftar Material Dikembalikan'
                                : `Material List (${actionType?.toUpperCase()})`}
                        </Label>

                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-12 text-center">No</TableHead>
                                        <TableHead>Kode Material</TableHead>
                                        <TableHead>Deskripsi</TableHead>
                                        <TableHead className="w-24">Satuan</TableHead>
                                        <TableHead className="w-32">Jumlah</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {materialItems.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-center font-medium">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {item.code}
                                            </TableCell>
                                            <TableCell
                                                className="text-sm text-muted-foreground truncate max-w-[200px]"
                                                title={item.description}
                                            >
                                                {item.description}
                                            </TableCell>
                                            <TableCell className="text-sm">{item.unit}</TableCell>
                                            <TableCell>
                                                {isReturn ? (
                                                    // Read-only for return material
                                                    <span className="font-semibold text-primary">
                                                        {item.qty}
                                                    </span>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        className="h-8"
                                                        placeholder="0"
                                                        value={
                                                            item.qty === 0 || item.qty === ''
                                                                ? ''
                                                                : item.qty
                                                        }
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value === ''
                                                                    ? ''
                                                                    : parseInt(e.target.value, 10);
                                                            handleQtyChange(item.id, val as number);
                                                        }}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mt-6 border-t pt-4">
                    <div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => setIsCancelConfirmOpen(true)}
                                        disabled={
                                            cancelMutation.isPending || updateMutation.isPending
                                        }
                                    >
                                        <Ban size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Batalkan Transaksi</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={updateMutation.isPending || cancelMutation.isPending}
                        >
                            Tutup
                        </Button>
                        <Button
                            onClick={() => updateMutation.mutate()}
                            disabled={
                                updateMutation.isPending ||
                                cancelMutation.isPending ||
                                !actionId ||
                                !canUpdate ||
                                (actionType === 'accept' &&
                                    materialItems.every((item) => item.qty === 0))
                            }
                        >
                            {updateMutation.isPending ? 'Menyimpan...' : 'Perbarui'}
                        </Button>
                    </div>
                </div>
            </ModalDialog>

            <ConfirmDialog
                isOpen={isCancelConfirmOpen}
                onOpenChange={(open) => {
                    setIsCancelConfirmOpen(open);
                    if (!open) setCancelNotes('');
                }}
                title="Batalkan Transaksi Tag"
                description="Apakah Anda yakin ingin membatalkan transaksi tag ini? Tindakan ini tidak dapat dibatalkan dan wajib menyertakan alasan untuk audit trail."
                confirmText="Batalkan Transaksi"
                cancelText="Kembali"
                variant="destructive"
                loading={cancelMutation.isPending}
                confirmDisabled={cancelNotes.trim().length < 5}
                icon={<Ban size={16} />}
                onConfirm={() => cancelMutation.mutate(cancelNotes.trim())}
            >
                <div className="space-y-4 text-sm">
                    <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            ID Transaksi:
                        </span>
                        <span className="font-mono text-xs font-bold text-destructive">
                            {row.id_trx}
                        </span>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cancel-notes" className="text-xs font-medium">
                            Alasan Pembatalan / Catatan Audit <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="cancel-notes"
                            placeholder="Tuliskan alasan pembatalan transaksi secara jelas (minimal 5 karakter)..."
                            value={cancelNotes}
                            onChange={(e) => setCancelNotes(e.target.value)}
                            rows={3}
                            className="text-sm"
                        />
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                            <span>
                                {cancelNotes.trim().length < 5 ? (
                                    <span className="text-amber-500 font-medium">
                                        Wajib minimal 5 karakter ({cancelNotes.trim().length}/5)
                                    </span>
                                ) : (
                                    <span className="text-emerald-500 font-medium">✓ Memenuhi syarat audit</span>
                                )}
                            </span>
                            <span>{cancelNotes.length} karakter</span>
                        </div>
                    </div>

                    <p className="text-muted-foreground text-xs leading-relaxed">
                        Status transaksi akan diubah menjadi <strong className="text-foreground">cancel</strong> dan catatan pembatalan akan disimpan permanen dalam database.
                    </p>
                </div>
            </ConfirmDialog>
        </>
    );
}
