'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getRekonEditData, submitEditRekon } from '../_actions/edit-rekon-actions';

const editItemSchema = z
    .object({
        item_id: z.string().optional(),
        designator_id: z.number(),
        sap_out_item_id: z.string(),
        new_qty: z.number().min(1, 'Qty minimal 1'),
        old_qty: z.number(),
        max_qty: z.number(),
        material_name: z.string(),
        material_code: z.string(),
    })
    .refine((data) => data.new_qty <= data.max_qty, {
        message: 'Qty melebihi sisa yang tersedia',
        path: ['new_qty'],
    });

const editRekonSchema = z.object({
    items: z.array(editItemSchema).min(1, 'Minimal 1 material'),
});

type EditRekonFormValues = z.infer<typeof editRekonSchema>;

interface EditRekonModalProps {
    isOpen: boolean;
    onClose: () => void;
    rowData: any | null; // This is the row from the table
}

export default function EditRekonModal({ isOpen, onClose, rowData }: EditRekonModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableSapItems, setAvailableSapItems] = useState<any[]>([]);

    const form = useForm<EditRekonFormValues>({
        resolver: zodResolver(editRekonSchema),
        defaultValues: {
            items: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        name: 'items',
        control: form.control,
    });

    useEffect(() => {
        if (!isOpen || !rowData) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await getRekonEditData(
                    String(rowData.header_id),
                    String(rowData.sap_out_id)
                );
                if (res.success && res.existingItems && res.sapItems) {
                    setAvailableSapItems(res.sapItems);

                    // Populate existing items
                    const mappedItems = res.existingItems.map((item: any) => {
                        // Find this item in sapItems to know its sap_out_item_id and available limit
                        const sapItem = res.sapItems.find(
                            (s: any) => s.designator_id === item.designator_id
                        );
                        const qty_req = sapItem ? Number(sapItem.qty_req) : 0;
                        const qty_used = sapItem ? Number(sapItem.qty_used) : 0;
                        // The item.current_qty is already included in qty_used. So max editable is:
                        const max_qty = qty_req - qty_used + item.current_qty;

                        return {
                            item_id: String(item.item_id),
                            designator_id: item.designator_id,
                            sap_out_item_id: String(sapItem?.sap_out_item_id || ''),
                            new_qty: item.current_qty,
                            old_qty: item.current_qty,
                            max_qty: max_qty,
                            material_name: item.description,
                            material_code: item.code,
                        };
                    });

                    form.reset({ items: mappedItems });
                } else {
                    toast.error(res.error || 'Gagal memuat data');
                    onClose();
                }
            } catch (err) {
                toast.error('Terjadi kesalahan sistem');
                onClose();
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isOpen, rowData, form, onClose]);

    const onSubmit = async (values: EditRekonFormValues) => {
        if (!rowData) return;
        setIsSubmitting(true);
        try {
            const res = await submitEditRekon(
                String(rowData.header_id),
                String(rowData.sap_out_id),
                values.items
            );

            if (res.success) {
                toast.success('Berhasil menyimpan perubahan rekon');
                onClose();
                // Optionally reload the table or let parent handle refresh via revalidatePath
            } else {
                toast.error(res.error || 'Gagal menyimpan');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan sistem');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addMaterial = () => {
        // Filter out items already in the form
        const currentItems = form.getValues('items');
        const availableToAdd = availableSapItems.filter(
            (sap) => !currentItems.some((i) => i.designator_id === sap.designator_id)
        );

        if (availableToAdd.length === 0) {
            toast.warning('Semua material di SAP ini sudah masuk rekon.');
            return;
        }

        const firstAvailable = availableToAdd[0];
        const max_qty = Number(firstAvailable.qty_req) - Number(firstAvailable.qty_used);

        append({
            item_id: undefined,
            designator_id: firstAvailable.designator_id,
            sap_out_item_id: String(firstAvailable.sap_out_item_id),
            new_qty: 1,
            old_qty: 0,
            max_qty: max_qty,
            material_code: firstAvailable.code,
            material_name: firstAvailable.description,
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Edit Rekon: {rowData?.trx_id}</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            {fields.map((field, index) => {
                                const err = form.formState.errors.items?.[index]?.new_qty;
                                return (
                                    <div
                                        key={field.id}
                                        className="flex items-start gap-4 p-4 border rounded-lg bg-gray-50"
                                    >
                                        <div className="flex-1 space-y-2">
                                            <div className="font-medium text-sm">
                                                {field.material_code} - {field.material_name}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                Maksimal Qty: {field.max_qty}
                                            </div>
                                        </div>

                                        <div className="w-32 flex flex-col gap-1">
                                            <Input
                                                type="number"
                                                {...form.register(`items.${index}.new_qty`, {
                                                    valueAsNumber: true,
                                                })}
                                            />
                                            {err && (
                                                <span className="text-xs text-red-500">
                                                    {err.message}
                                                </span>
                                            )}
                                        </div>

                                        {!field.item_id && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1"
                                                onClick={() => remove(index)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={addMaterial}
                            className="w-full"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Tambah Material
                        </Button>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Menyimpan...
                                    </>
                                ) : (
                                    'Simpan Perubahan'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
