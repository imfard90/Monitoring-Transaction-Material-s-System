'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Control } from 'react-hook-form';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { cn } from '@/lib/utils';
import { createTag, getMaterialsWithStock, getWarehouses } from '../_actions/tag-actions';

interface CreateTagModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface MaterialStock {
    id: number;
    code: string | null;
    description: string | null;
    unit: string | null;
    qty_stock: number | string | null;
}

const createTagSchema = z
    .object({
        fromWhId: z
            .number({ message: 'Gudang asal wajib dipilih' })
            .positive('Gudang asal wajib dipilih'),
        toWhId: z
            .number({ message: 'Gudang tujuan wajib dipilih' })
            .positive('Gudang tujuan wajib dipilih'),
        requestId: z.string().trim(),
        vendorName: z.string().trim(),
        cost: z.number().min(0, 'Biaya tidak boleh negatif'),
        items: z
            .array(
                z.object({
                    designator_id: z
                        .number({ message: 'Pilih material' })
                        .positive('Pilih material'),
                    qty: z.number({ message: 'Jumlah harus > 0' }).positive('Jumlah harus > 0'),
                })
            )
            .min(1, 'Minimal satu material harus ditambahkan'),
    })
    .refine((data) => data.fromWhId !== data.toWhId, {
        message: 'Gudang Asal dan Gudang Tujuan tidak boleh sama',
        path: ['toWhId'],
    });

type CreateTagFormValues = z.infer<typeof createTagSchema>;

export default function CreateTagModal({ isOpen, onClose }: CreateTagModalProps) {
    const queryClient = useQueryClient();

    const [openFrom, setOpenFrom] = useState(false);
    const [openTo, setOpenTo] = useState(false);

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<CreateTagFormValues>({
        resolver: zodResolver(createTagSchema),
        defaultValues: {
            fromWhId: undefined,
            toWhId: undefined,
            requestId: '',
            vendorName: '',
            cost: 0,
            items: [{ designator_id: undefined, qty: '' as unknown as number }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'items',
    });

    const fromWhId = watch('fromWhId');
    const toWhId = watch('toWhId');

    // Queries
    const { data: whRes } = useQuery({
        queryKey: ['warehouses'],
        queryFn: getWarehouses,
    });

    const { data: matRes } = useQuery({
        queryKey: ['materials', fromWhId],
        queryFn: () => getMaterialsWithStock(fromWhId ?? null),
        enabled: Boolean(fromWhId),
    });

    const warehouses = whRes?.data || [];
    const materials = matRes?.data || [];

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            reset({
                fromWhId: undefined,
                toWhId: undefined,
                requestId: '',
                vendorName: '',
                cost: 0,
                items: [{ designator_id: undefined, qty: '' as unknown as number }],
            });
        }
    }, [isOpen, reset]);

    const createMutation = useMutation({
        mutationFn: async (values: CreateTagFormValues) => {
            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            return createTag({
                fromWhId: values.fromWhId,
                toWhId: values.toWhId,
                requestId: values.requestId,
                vendorName: values.vendorName,
                cost: values.cost,
                items: values.items.map((i) => ({
                    designator_id: i.designator_id,
                    qty: Number(i.qty),
                })),
                idemKey,
            });
        },
        onSuccess: (res) => {
            if (res.success) {
                toast.success(`Tag created successfully: ${res.id_trx}`);
                queryClient.invalidateQueries({ queryKey: ['inoutTags'] });
                onClose();
            } else {
                toast.error(res.error || 'Failed to create tag');
            }
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const onSubmit = (values: CreateTagFormValues) => {
        createMutation.mutate(values);
    };

    return (
        <ModalDialog
            isOpen={isOpen}
            onClose={onClose}
            title="Create New Tag"
            className="sm:max-w-225"
            preventOutsideClose
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* LEFT COLUMN */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Gudang Asal</Label>
                            <Popover open={openFrom} onOpenChange={setOpenFrom}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                            'w-full justify-between font-normal h-9 px-3',
                                            errors.fromWhId && 'border-destructive'
                                        )}
                                    >
                                        <span className="truncate">
                                            {fromWhId
                                                ? warehouses.find((w) => w.id === fromWhId)?.name
                                                : 'Pilih Gudang Asal...'}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-75 p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Cari gudang asal..." />
                                        <CommandEmpty>Gudang tidak ditemukan.</CommandEmpty>
                                        <CommandList>
                                            <CommandGroup>
                                                {warehouses.map((wh) => (
                                                    <CommandItem
                                                        key={wh.id}
                                                        value={wh.name}
                                                        onSelect={() => {
                                                            setValue('fromWhId', wh.id, {
                                                                shouldValidate: true,
                                                            });
                                                            setOpenFrom(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4 shrink-0',
                                                                fromWhId === wh.id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        <span className="truncate">
                                                            {wh.name} ({wh.branch})
                                                        </span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {errors.fromWhId && (
                                <p className="text-xs text-destructive">
                                    {errors.fromWhId.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Gudang Tujuan</Label>
                            <Popover open={openTo} onOpenChange={setOpenTo}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                            'w-full justify-between font-normal h-9 px-3',
                                            errors.toWhId && 'border-destructive'
                                        )}
                                    >
                                        <span className="truncate">
                                            {toWhId
                                                ? warehouses.find((w) => w.id === toWhId)?.name
                                                : 'Pilih Gudang Tujuan...'}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-75 p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Cari gudang tujuan..." />
                                        <CommandEmpty>Gudang tidak ditemukan.</CommandEmpty>
                                        <CommandList>
                                            <CommandGroup>
                                                {warehouses.map((wh) => (
                                                    <CommandItem
                                                        key={wh.id}
                                                        value={wh.name}
                                                        onSelect={() => {
                                                            setValue('toWhId', wh.id, {
                                                                shouldValidate: true,
                                                            });
                                                            setOpenTo(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4 shrink-0',
                                                                toWhId === wh.id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        <span className="truncate">
                                                            {wh.name} ({wh.branch})
                                                        </span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {errors.toWhId && (
                                <p className="text-xs text-destructive">{errors.toWhId.message}</p>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Request ID</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle
                                                size={14}
                                                className="text-muted-foreground cursor-help"
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Kosongkan jika belum ada</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Controller
                                control={control}
                                name="requestId"
                                render={({ field }) => (
                                    <Input placeholder="Contoh: REQ-2026-001" {...field} />
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Vendor</Label>
                                <Controller
                                    control={control}
                                    name="vendorName"
                                    render={({ field }) => (
                                        <Input placeholder="Swakelola" {...field} />
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Biaya (Rp)</Label>
                                <Controller
                                    control={control}
                                    name="cost"
                                    render={({ field }) => (
                                        <Input
                                            type="number"
                                            min="0"
                                            value={field.value ?? 0}
                                            onChange={(e) =>
                                                field.onChange(
                                                    e.target.value === ''
                                                        ? 0
                                                        : Number(e.target.value)
                                                )
                                            }
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* MATERIALS SECTION */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <Label className="text-base font-semibold">Daftar Material</Label>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                append({
                                    designator_id: undefined as unknown as number,
                                    qty: '' as unknown as number,
                                })
                            }
                            className="gap-2"
                        >
                            <Plus size={14} /> Tambah Material
                        </Button>
                    </div>

                    {errors.items?.message && (
                        <p className="text-xs text-destructive">{errors.items.message}</p>
                    )}

                    <div className="border rounded-md">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-12 text-center">No</TableHead>
                                    <TableHead>Designator / Kode</TableHead>
                                    <TableHead>Deskripsi</TableHead>
                                    <TableHead className="w-24">Satuan</TableHead>
                                    <TableHead className="w-24">Stok</TableHead>
                                    <TableHead className="w-32">Jumlah</TableHead>
                                    <TableHead className="w-16 text-center">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-center text-muted-foreground py-6"
                                        >
                                            Belum ada material yang ditambahkan. Klik "Tambah
                                            Material" untuk memulai.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    fields.map((fieldItem, index) => {
                                        return (
                                            <MaterialRowItem
                                                key={fieldItem.id}
                                                index={index}
                                                control={control}
                                                materials={materials}
                                                onRemove={() => remove(index)}
                                            />
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={createMutation.isPending || isSubmitting}
                    >
                        Batal
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || isSubmitting}>
                        {createMutation.isPending || isSubmitting ? 'Menyimpan...' : 'Simpan Tag'}
                    </Button>
                </div>
            </form>
        </ModalDialog>
    );
}

// Extracted component to manage individual row popover state
function MaterialRowItem({
    index,
    control,
    materials,
    onRemove,
}: {
    index: number;
    control: Control<CreateTagFormValues>;
    materials: MaterialStock[];
    onRemove: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <TableRow>
            <TableCell className="text-center font-medium">{index + 1}</TableCell>
            <TableCell>
                <Controller
                    control={control}
                    name={`items.${index}.designator_id`}
                    render={({ field }) => {
                        const selectedMat = materials.find((m) => m.id === field.value);

                        return (
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={open}
                                        className="w-full justify-between font-normal h-8 px-2"
                                    >
                                        <span className="truncate max-w-37.5">
                                            {selectedMat ? selectedMat.code : 'Pilih Kode...'}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-75 p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Cari kode material..." />
                                        <CommandEmpty>Material tidak ditemukan.</CommandEmpty>
                                        <CommandList>
                                            <CommandGroup>
                                                {materials.map((m) => (
                                                    <CommandItem
                                                        key={m.id}
                                                        value={m.code || ''}
                                                        onSelect={() => {
                                                            field.onChange(m.id);
                                                            setOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4 shrink-0',
                                                                field.value === m.id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        <span className="truncate">
                                                            {m.code} - {m.description}
                                                        </span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        );
                    }}
                />
            </TableCell>
            <Controller
                control={control}
                name={`items.${index}.designator_id`}
                render={({ field }) => {
                    const selectedMat = materials.find((m) => m.id === field.value);
                    return (
                        <>
                            <TableCell
                                className="text-sm text-muted-foreground truncate max-w-50"
                                title={selectedMat?.description || '-'}
                            >
                                {selectedMat?.description || '-'}
                            </TableCell>
                            <TableCell className="text-sm">{selectedMat?.unit || '-'}</TableCell>
                            <TableCell className="text-sm font-semibold">
                                {selectedMat?.qty_stock || '-'}
                            </TableCell>
                        </>
                    );
                }}
            />
            <TableCell>
                <Controller
                    control={control}
                    name={`items.${index}.qty`}
                    render={({ field, fieldState }) => (
                        <div>
                            <Input
                                type="number"
                                min="1"
                                placeholder="0"
                                className={cn('h-8', fieldState.error && 'border-destructive')}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                    field.onChange(
                                        e.target.value === '' ? '' : Number(e.target.value)
                                    );
                                }}
                            />
                            {fieldState.error && (
                                <p className="text-xs text-destructive mt-0.5">
                                    {fieldState.error.message}
                                </p>
                            )}
                        </div>
                    )}
                />
            </TableCell>
            <TableCell className="text-center">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onRemove}
                >
                    <Trash2 size={14} />
                </Button>
            </TableCell>
        </TableRow>
    );
}
