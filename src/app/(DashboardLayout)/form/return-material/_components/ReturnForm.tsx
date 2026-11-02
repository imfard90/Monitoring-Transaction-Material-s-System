'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import type { ReturnAvailableItem, ReturnSapOutOption } from '@/lib/types/inventory';
import {
    createReturnMaterial,
    getAvailableSapOuts,
    getSapOutItemsForReturn,
} from '../_actions/return-actions';

const returnItemSchema = z.object({
    sap_out_item_id: z.string().min(1, 'Material wajib dipilih'),
    designator_id: z.string().min(1, 'Designator ID tidak valid'),
    qty: z.number().min(1, 'Jumlah pengembalian minimal 1'),
    maxReturn: z.number().min(1),
});

const returnFormSchema = z.object({
    sap_out_id: z.string().min(1, 'Silakan pilih transaksi yang akan dikembalikan'),
    nik_teknisi: z.string(),
    warehouse_id: z.string(),
    notes: z.string().optional(),
    items: z
        .array(returnItemSchema)
        .min(1, 'Silakan tambahkan minimal satu material untuk dikembalikan'),
});

type ReturnFormValues = z.infer<typeof returnFormSchema>;

export default function ReturnForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<ReturnFormValues>({
        resolver: zodResolver(returnFormSchema),
        defaultValues: {
            sap_out_id: '',
            nik_teknisi: '',
            warehouse_id: '',
            notes: '',
            items: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'items',
    });

    const selectedSapOutId = watch('sap_out_id');
    const watchedItems = watch('items') || [];
    const notesValue = watch('notes') || '';

    // Query available SAP Out transactions
    const { data: sapOuts = [], refetch: refetchSapOuts } = useQuery({
        queryKey: queryKeys.returnMaterial.availableSapOuts(),
        queryFn: async () => {
            const res = await getAvailableSapOuts();
            return res.success ? (res.data as ReturnSapOutOption[]) : [];
        },
    });

    // Query available returnable items for the selected SAP Out
    const { data: availableItems = [] } = useQuery({
        queryKey: queryKeys.returnMaterial.sapOutItems(selectedSapOutId),
        queryFn: async () => {
            if (!selectedSapOutId) return [];
            const res = await getSapOutItemsForReturn(selectedSapOutId);
            return res.success ? (res.data as ReturnAvailableItem[]) : [];
        },
        enabled: !!selectedSapOutId,
    });

    const handleSapOutChange = (val: string) => {
        const selected = sapOuts.find((s: ReturnSapOutOption) => s.id.toString() === val);
        if (!selected) return;

        setValue('sap_out_id', val, { shouldValidate: true });
        setValue('nik_teknisi', selected.nik_teknisi || '');
        setValue('warehouse_id', selected.warehouse_id?.toString() || '');
        setValue('items', []); // Reset items on transaction change
    };

    const handleAddItem = () => {
        append({
            sap_out_item_id: '',
            designator_id: '',
            qty: 1,
            maxReturn: 1,
        });
    };

    const onSubmitForm = () => {
        if (!selectedSapOutId) {
            toast.error('Silakan pilih transaksi yang akan dikembalikan');
            return;
        }

        if (watchedItems.length === 0) {
            toast.error('Silakan tambahkan minimal satu material untuk dikembalikan');
            return;
        }

        const invalidItems = watchedItems.filter(
            (i) => !i.sap_out_item_id || Number(i.qty) <= 0 || Number(i.qty) > Number(i.maxReturn)
        );

        if (invalidItems.length > 0) {
            toast.error(
                'Terdapat material dengan jumlah kembali tidak valid atau melebihi batas maksimal'
            );
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setLoading(true);
        try {
            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            const values = watch();
            const payload = {
                sap_out_id: Number(values.sap_out_id),
                nik_teknisi: values.nik_teknisi,
                warehouse_id: Number(values.warehouse_id),
                notes: values.notes || null,
                idemKey,
                items: values.items.map((i) => ({
                    designator_id: Number(i.designator_id),
                    sap_out_item_id: Number(i.sap_out_item_id),
                    qty: Number(i.qty),
                })),
            };

            const res = await createReturnMaterial(payload);
            if (res.success) {
                toast.success('Pengembalian material berhasil diajukan!');
                reset({
                    sap_out_id: '',
                    nik_teknisi: '',
                    warehouse_id: '',
                    notes: '',
                    items: [],
                });

                await Promise.all([
                    refetchSapOuts(),
                    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stockIntech() }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.technicians.all }),
                ]);
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal mengajukan pengembalian material');
            }
        } catch (_err: unknown) {
            toast.error('Terjadi kesalahan jaringan');
        } finally {
            setLoading(false);
            setIsConfirmModalOpen(false);
        }
    };

    const selectedTech = useMemo(
        () => sapOuts.find((s: ReturnSapOutOption) => s.id.toString() === selectedSapOutId),
        [sapOuts, selectedSapOutId]
    );

    return (
        <StaggerContainer>
            <Card className="border border-border bg-card text-card-foreground shadow-xs rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6">
                <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-8">
                    <StaggerItem>
                        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/70 pb-3">
                            Pengembalian Material (Return Transaction)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Cari Transaksi / Teknisi</Label>
                                <SearchableSelect
                                    options={sapOuts.map((s: ReturnSapOutOption) => ({
                                        value: s.id.toString(),
                                        label: `${s.id_trx}${s.request_id ? ` - [REQ: ${s.request_id}]` : ''} - ${s.nik_teknisi} - ${s.nama_teknisi}`,
                                    }))}
                                    value={selectedSapOutId}
                                    onValueChange={handleSapOutChange}
                                    placeholder="Cari transaksi / no request / teknisi..."
                                />
                                {errors.sap_out_id && (
                                    <p className="text-xs text-destructive">
                                        {errors.sap_out_id.message}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Catatan / Alasan</Label>
                                <Controller
                                    name="notes"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            {...field}
                                            value={field.value ?? ''}
                                            placeholder="Contoh: Sisa material instalasi"
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </StaggerItem>

                    <StaggerItem>
                        <div className="flex justify-between items-center mb-4 border-b border-border/70 pb-3">
                            <div>
                                <h2 className="text-lg font-bold text-foreground">
                                    Material yang Dikembalikan
                                </h2>
                                {errors.items?.message && (
                                    <p className="text-xs text-destructive mt-1">
                                        {errors.items.message}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddItem}
                                disabled={!selectedSapOutId}
                            >
                                <Plus className="h-4 w-4 mr-2" /> Tambah Material
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <AnimatePresence mode="popLayout">
                                {fields.map((fieldItem, index) => {
                                    const currentItem = watchedItems[index];
                                    const maxReturn = currentItem?.maxReturn || 1;

                                    return (
                                        <motion.div
                                            key={fieldItem.id}
                                            initial={{ opacity: 0, height: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                            exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-muted/40 overflow-hidden"
                                        >
                                            <div className="flex-1 space-y-2">
                                                <Label>Material</Label>
                                                <Controller
                                                    name={`items.${index}.sap_out_item_id`}
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select
                                                            value={field.value}
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                const matched = availableItems.find(
                                                                    (ai) =>
                                                                        ai.sap_out_item_id.toString() ===
                                                                        val
                                                                );
                                                                if (matched) {
                                                                    setValue(
                                                                        `items.${index}.designator_id`,
                                                                        String(
                                                                            matched.designator_id
                                                                        )
                                                                    );
                                                                    setValue(
                                                                        `items.${index}.maxReturn`,
                                                                        matched.maxReturn ?? 1
                                                                    );
                                                                    setValue(
                                                                        `items.${index}.qty`,
                                                                        1
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="bg-background">
                                                                <SelectValue placeholder="Pilih Material" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {availableItems.map((ai) => (
                                                                    <SelectItem
                                                                        key={ai.sap_out_item_id}
                                                                        value={ai.sap_out_item_id.toString()}
                                                                    >
                                                                        {ai.material_code} -{' '}
                                                                        {ai.material_name} (Maks:{' '}
                                                                        {ai.maxReturn})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>

                                            <div className="w-full sm:w-36 space-y-2">
                                                <Label>Jumlah Kembali</Label>
                                                <Controller
                                                    name={`items.${index}.qty`}
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={maxReturn}
                                                            value={
                                                                field.value === 0 ||
                                                                Number.isNaN(field.value)
                                                                    ? ''
                                                                    : field.value
                                                            }
                                                            onChange={(e) => {
                                                                const val =
                                                                    e.target.value === ''
                                                                        ? 0
                                                                        : parseInt(
                                                                              e.target.value,
                                                                              10
                                                                          );
                                                                if (val > maxReturn) {
                                                                    toast.error(
                                                                        `Jumlah pengembalian maksimal adalah ${maxReturn}`
                                                                    );
                                                                    field.onChange(maxReturn);
                                                                } else {
                                                                    field.onChange(val);
                                                                }
                                                            }}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <div className="pt-8">
                                                <motion.div
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                >
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                        aria-label="Hapus baris material"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </motion.div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>

                            {fields.length === 0 && (
                                <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
                                    Belum ada material yang ditambahkan. Klik "Tambah Material"
                                    untuk memilih material.
                                </div>
                            )}
                        </div>
                    </StaggerItem>

                    <StaggerItem className="flex justify-end pt-4 border-t border-border">
                        <motion.div
                            whileHover={{ scale: watchedItems.length === 0 ? 1 : 1.02 }}
                            whileTap={{ scale: watchedItems.length === 0 ? 1 : 0.98 }}
                        >
                            <Button
                                type="submit"
                                disabled={loading || watchedItems.length === 0}
                                className="w-full sm:w-auto"
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Tinjau & Ajukan Pengembalian
                            </Button>
                        </motion.div>
                    </StaggerItem>
                </form>

                <ConfirmDialog
                    isOpen={isConfirmModalOpen}
                    onOpenChange={setIsConfirmModalOpen}
                    title="Konfirmasi Return Material"
                    description="Pastikan data pengembalian material sudah benar. Status akan menjadi pending dan menunggu persetujuan (accept) dari gudang."
                    onConfirm={handleConfirmSubmit}
                    loading={loading}
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm bg-muted/40 p-4 rounded-xl border border-border/70">
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Transaksi SAP Out:
                                </span>
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                    {selectedTech?.id_trx || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Teknisi:
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-foreground">
                                        {selectedTech?.nama_teknisi || '-'}
                                    </span>
                                    {selectedTech?.nik_teknisi && (
                                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-background border border-border/60 text-muted-foreground">
                                            {selectedTech.nik_teknisi}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="col-span-1 sm:col-span-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Catatan:
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {notesValue || '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-foreground">
                                    Material yang Dikembalikan
                                </h4>
                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/40">
                                    {watchedItems.length} item material
                                </span>
                            </div>

                            <div className="border border-border/70 rounded-xl overflow-hidden shadow-2xs">
                                <div className="max-h-[260px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/80 backdrop-blur-xs sticky top-0 z-10 border-b border-border">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="w-12 text-center text-[11px] font-semibold uppercase tracking-wider">
                                                    No
                                                </TableHead>
                                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">
                                                    Material
                                                </TableHead>
                                                <TableHead className="w-28 text-center text-[11px] font-semibold uppercase tracking-wider">
                                                    Jumlah Kembali
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {watchedItems.map((item, idx) => {
                                                const mat = availableItems.find(
                                                    (a) =>
                                                        a.sap_out_item_id.toString() ===
                                                        item.sap_out_item_id
                                                );
                                                return (
                                                    <TableRow key={item.sap_out_item_id || idx}>
                                                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium text-foreground text-xs">
                                                                {mat?.material_name || '-'}
                                                            </div>
                                                            <div className="font-mono text-[10px] text-muted-foreground">
                                                                {mat?.material_code || '-'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-bold text-foreground tabular-nums">
                                                            {item.qty}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </div>
                </ConfirmDialog>
            </Card>
        </StaggerContainer>
    );
}
