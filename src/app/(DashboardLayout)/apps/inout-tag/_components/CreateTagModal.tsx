'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ModalDialog } from '@/app/components/shared/ModalDialog';
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

interface MaterialItem {
    id: string; // unique frontend id for React keys
    designator_id: number | null;
    qty: number | string;
}

interface MaterialStock {
    id: number;
    code: string | null;
    description: string | null;
    unit: string | null;
    qty_stock: number | string | null;
}

export default function CreateTagModal({ isOpen, onClose }: CreateTagModalProps) {
    const queryClient = useQueryClient();

    // Form State
    const [fromWhId, setFromWhId] = useState<number | null>(null);
    const [toWhId, setToWhId] = useState<number | null>(null);
    const [requestId, setRequestId] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [cost, setCost] = useState<number>(0);
    const [items, setItems] = useState<MaterialItem[]>([]);

    // Combo open states
    const [openFrom, setOpenFrom] = useState(false);
    const [openTo, setOpenTo] = useState(false);

    // Queries
    const { data: whRes } = useQuery({
        queryKey: ['warehouses'],
        queryFn: getWarehouses,
    });

    const { data: matRes } = useQuery({
        queryKey: ['materials', fromWhId],
        queryFn: () => getMaterialsWithStock(fromWhId),
    });

    const warehouses = whRes?.data || [];
    const materials = matRes?.data || [];

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFromWhId(null);
            setToWhId(null);
            setRequestId('');
            setVendorName('');
            setCost(0);
            setItems([{ id: crypto.randomUUID(), designator_id: null, qty: '' }]);
        }
    }, [isOpen]);

    // Mutation
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!fromWhId || !toWhId) throw new Error('Gudang Asal dan Gudang Tujuan wajib diisi');
            if (fromWhId === toWhId)
                throw new Error('Gudang Asal dan Gudang Tujuan tidak boleh sama');
            if (items.length === 0) throw new Error('Minimal satu material harus ditambahkan');
            if (items.some((i) => !i.designator_id || Number(i.qty) <= 0))
                throw new Error('Semua material harus dipilih dan memiliki jumlah > 0');

            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            return createTag({
                fromWhId,
                toWhId,
                requestId,
                vendorName,
                cost,
                items: items.map((i) => ({
                    designator_id: i.designator_id ?? 0,
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

    const handleAddItem = () => {
        setItems([...items, { id: crypto.randomUUID(), designator_id: null, qty: '' }]);
    };

    const handleRemoveItem = (id: string) => {
        setItems(items.filter((i) => i.id !== id));
    };

    const handleItemChange = (id: string, field: keyof MaterialItem, value: number | string) => {
        setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    };

    return (
        <ModalDialog
            isOpen={isOpen}
            onClose={onClose}
            title="Create New Tag"
            className="sm:max-w-[900px]"
            preventOutsideClose
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
                {/* LEFT COLUMN */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Gudang Asal</Label>
                        <Popover open={openFrom} onOpenChange={setOpenFrom}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between font-normal h-9 px-3"
                                >
                                    <span className="truncate">
                                        {fromWhId
                                            ? warehouses.find((w) => w.id === fromWhId)?.name
                                            : 'Pilih Gudang Asal...'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0" align="start">
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
                                                        setFromWhId(wh.id);
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
                    </div>

                    <div className="space-y-2">
                        <Label>Gudang Tujuan</Label>
                        <Popover open={openTo} onOpenChange={setOpenTo}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between font-normal h-9 px-3"
                                >
                                    <span className="truncate">
                                        {toWhId
                                            ? warehouses.find((w) => w.id === toWhId)?.name
                                            : 'Pilih Gudang Tujuan...'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0" align="start">
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
                                                        setToWhId(wh.id);
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
                        <Input
                            placeholder="Contoh: REQ-2026-001"
                            value={requestId}
                            onChange={(e) => setRequestId(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Vendor</Label>
                            <Input
                                placeholder="Swakelola"
                                value={vendorName}
                                onChange={(e) => setVendorName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Biaya (Rp)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={cost}
                                onChange={(e) => setCost(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* MATERIALS SECTION */}
            <div className="mt-6 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Daftar Material</Label>
                    <Button size="sm" variant="outline" onClick={handleAddItem} className="gap-2">
                        <Plus size={14} /> Tambah Material
                    </Button>
                </div>

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
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-center text-muted-foreground py-6"
                                    >
                                        Belum ada material yang ditambahkan. Klik "Tambah Material"
                                        untuk memulai.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.map((item, index) => (
                                    <MaterialRow
                                        key={item.id}
                                        item={item}
                                        index={index}
                                        materials={materials}
                                        onItemChange={handleItemChange}
                                        onRemoveItem={handleRemoveItem}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
                    Batal
                </Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Menyimpan...' : 'Simpan Tag'}
                </Button>
            </div>
        </ModalDialog>
    );
}

// Extracted component to manage individual row popover state
function MaterialRow({
    item,
    index,
    materials,
    onItemChange,
    onRemoveItem,
}: {
    item: MaterialItem;
    index: number;
    materials: MaterialStock[];
    onItemChange: (id: string, field: keyof MaterialItem, value: number | string) => void;
    onRemoveItem: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const selectedMat = materials.find((m) => m.id === item.designator_id);

    return (
        <TableRow>
            <TableCell className="text-center font-medium">{index + 1}</TableCell>
            <TableCell>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between font-normal h-8 px-2"
                        >
                            <span className="truncate max-w-[150px]">
                                {selectedMat ? selectedMat.code : 'Pilih Kode...'}
                            </span>
                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
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
                                                onItemChange(item.id, 'designator_id', m.id);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 shrink-0',
                                                    item.designator_id === m.id
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
            </TableCell>
            <TableCell
                className="text-sm text-muted-foreground truncate max-w-[200px]"
                title={selectedMat?.description || '-'}
            >
                {selectedMat?.description || '-'}
            </TableCell>
            <TableCell className="text-sm">{selectedMat?.unit || '-'}</TableCell>
            <TableCell className="text-sm font-semibold">{selectedMat?.qty_stock || '-'}</TableCell>
            <TableCell>
                <Input
                    type="number"
                    min="1"
                    placeholder="0"
                    className="h-8"
                    value={item.qty === 0 || item.qty === '' ? '' : item.qty}
                    onChange={(e) => {
                        let val: string | number =
                            e.target.value === '' ? '' : parseInt(e.target.value, 10);
                        if (
                            typeof val === 'number' &&
                            selectedMat &&
                            typeof selectedMat.qty_stock === 'number' &&
                            val > selectedMat.qty_stock
                        ) {
                            val = selectedMat.qty_stock;
                            toast.error(`Jumlah maksimal adalah ${selectedMat.qty_stock}`);
                        }
                        onItemChange(item.id, 'qty', val);
                    }}
                />
            </TableCell>
            <TableCell className="text-center">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRemoveItem(item.id)}
                >
                    <Trash2 size={14} />
                </Button>
            </TableCell>
        </TableRow>
    );
}
