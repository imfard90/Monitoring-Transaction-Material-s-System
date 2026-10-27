'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import type { ReturnAvailableItem, ReturnItem, ReturnSapOutOption } from '@/lib/types/inventory';
import {
    createReturnMaterial,
    getAvailableSapOuts,
    getSapOutItemsForReturn,
} from '../_actions/return-actions';

export default function ReturnForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);

    const [sapOuts, setSapOuts] = useState<ReturnSapOutOption[]>([]);
    const [availableItems, setAvailableItems] = useState<ReturnAvailableItem[]>([]);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        sap_out_id: '',
        nik_teknisi: '',
        warehouse_id: '',
        notes: '',
    });

    const [items, setItems] = useState<ReturnItem[]>([]);

    useEffect(() => {
        const fetchSapOuts = async () => {
            const res = await getAvailableSapOuts();
            if (res.success) {
                setSapOuts(res.data);
            }
        };
        fetchSapOuts();
    }, []);

    const handleSapOutChange = async (val: string) => {
        const selected = sapOuts.find((s: ReturnSapOutOption) => s.id.toString() === val);
        if (!selected) return;

        setFormData({
            ...formData,
            sap_out_id: val,
            nik_teknisi: selected.nik_teknisi || '',
            warehouse_id: selected.warehouse_id?.toString() || '',
        });

        // Fetch items
        const res = await getSapOutItemsForReturn(val);
        if (res.success) {
            setAvailableItems(res.data);
            setItems([]); // reset selected items
        }
    };

    const handleAddItem = () => {
        setItems([...items, { sap_out_item_id: '', designator_id: '', qty: '', maxReturn: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index: number, field: string, value: number | string) => {
        const newItems = [...items];

        if (field === 'sap_out_item_id') {
            const selectedItem = availableItems.find((i) => i.sap_out_item_id.toString() === value);
            if (selectedItem) {
                newItems[index] = {
                    ...newItems[index],
                    sap_out_item_id: value,
                    designator_id: selectedItem.designator_id,
                    maxReturn: selectedItem.maxReturn,
                    qty: '',
                };
            }
        } else {
            newItems[index] = { ...newItems[index], [field]: value };

            if (field === 'qty' && value !== '') {
                const maxReturn = newItems[index].maxReturn || 0;
                if (Number(value) > maxReturn) {
                    newItems[index].qty = maxReturn;
                    toast.error(`Jumlah pengembalian maksimal adalah ${maxReturn}`);
                }
            }
        }

        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.sap_out_id) {
            toast.error('Silakan pilih transaksi yang akan dikembalikan');
            return;
        }

        if (items.length === 0) {
            toast.error('Silakan tambahkan minimal satu material untuk dikembalikan');
            return;
        }

        const invalidItems = items.filter((i) => !i.sap_out_item_id || Number(i.qty) <= 0);
        if (invalidItems.length > 0) {
            toast.error('Silakan periksa pilihan material dan jumlah pengembalian');
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setLoading(true);
        try {
            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            const payload = {
                ...formData,
                sap_out_id: Number(formData.sap_out_id),
                warehouse_id: Number(formData.warehouse_id),
                idemKey,
                items: items.map((i) => ({
                    designator_id: Number(i.designator_id),
                    sap_out_item_id: Number(i.sap_out_item_id),
                    qty: Number(i.qty),
                })),
            };

            const res = await createReturnMaterial(payload);
            if (res.success) {
                toast.success('Pengembalian material berhasil diajukan!');
                // Reset form
                setFormData({
                    sap_out_id: '',
                    nik_teknisi: '',
                    warehouse_id: '',
                    notes: '',
                });
                setItems([]);
                setAvailableItems([]);

                // Refresh available sap outs
                const sapRes = await getAvailableSapOuts();
                if (sapRes.success) setSapOuts(sapRes.data);

                await queryClient.invalidateQueries({ queryKey: ['dashboardStockIntech'] });
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal mengajukan pengembalian material');
            }
        } catch (_err: unknown) {
            toast.error('Terjadi kesalahan');
        } finally {
            setLoading(false);
            setIsConfirmModalOpen(false);
        }
    };

    const selectedTech = sapOuts.find(
        (s: ReturnSapOutOption) => s.id.toString() === formData.sap_out_id
    );

    const totalQty = useMemo(
        () => items.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0),
        [items]
    );

    return (
        <StaggerContainer>
            <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <StaggerItem>
                        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/70 pb-3">
                            Pengembalian Material (Return Transaction)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Cari Teknisi (Intech)</Label>
                                <SearchableSelect
                                    options={sapOuts.map((s: ReturnSapOutOption) => ({
                                        value: s.id.toString(),
                                        label: `${s.id_trx}${s.request_id ? ` - [REQ: ${s.request_id}]` : ''} - ${s.nik_teknisi} - ${s.nama_teknisi}`,
                                    }))}
                                    value={formData.sap_out_id}
                                    onValueChange={handleSapOutChange}
                                    placeholder="Cari transaksi / no request / teknisi..."
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Catatan / Alasan</Label>
                                <Input
                                    value={formData.notes}
                                    onChange={(e) =>
                                        setFormData({ ...formData, notes: e.target.value })
                                    }
                                    placeholder="Contoh: Sisa material instalasi"
                                />
                            </div>
                        </div>
                    </StaggerItem>

                    <StaggerItem>
                        <div className="flex justify-between items-center mb-4 border-b border-border/70 pb-3">
                            <h2 className="text-lg font-bold text-foreground">
                                Material yang Dikembalikan
                            </h2>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddItem}
                                disabled={!formData.sap_out_id}
                            >
                                <Plus className="h-4 w-4 mr-2" /> Tambah Material
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <AnimatePresence mode="popLayout">
                                {items.map((item, index) => (
                                    <motion.div
                                        key={item.id || index}
                                        initial={{ opacity: 0, height: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                        exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-muted/40 overflow-hidden"
                                    >
                                        <div className="flex-1 space-y-2">
                                            <Label>Material</Label>
                                            <Select
                                                value={item.sap_out_item_id.toString()}
                                                onValueChange={(val) =>
                                                    handleItemChange(index, 'sap_out_item_id', val)
                                                }
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
                                                            {ai.material_code} - {ai.material_name}{' '}
                                                            (Maks: {ai.maxReturn})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="w-full sm:w-32 space-y-2">
                                            <Label>Jumlah Kembali</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                max={item.maxReturn || 1}
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
                                                    handleItemChange(index, 'qty', val);
                                                }}
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
                                                    onClick={() => handleRemoveItem(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {items.length === 0 && (
                                <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
                                    Belum ada material yang ditambahkan. Klik "Tambah Material"
                                    untuk memilih material.
                                </div>
                            )}
                        </div>
                    </StaggerItem>

                    <StaggerItem className="flex justify-end pt-4 border-t border-border">
                        <motion.div
                            whileHover={{ scale: items.length === 0 ? 1 : 1.02 }}
                            whileTap={{ scale: items.length === 0 ? 1 : 0.98 }}
                        >
                            <Button
                                type="submit"
                                disabled={loading || items.length === 0}
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
                                    {formData.notes || '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-foreground">
                                    Material yang Dikembalikan
                                </h4>
                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/40">
                                    {items.length} item material
                                </span>
                            </div>

                            <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs">
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
                                            {items.map((item, idx) => {
                                                const mat = availableItems.find(
                                                    (ai) =>
                                                        ai.sap_out_item_id.toString() ===
                                                        item.sap_out_item_id
                                                );
                                                return (
                                                    <TableRow
                                                        key={item.sap_out_item_id as string}
                                                        className="hover:bg-muted/40 transition-colors"
                                                    >
                                                        <TableCell className="text-center text-xs font-mono text-muted-foreground">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell className="py-2.5">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="font-mono text-xs font-semibold text-primary">
                                                                    {mat?.material_code ?? '-'}
                                                                </span>
                                                                <span
                                                                    className="text-xs text-muted-foreground line-clamp-1"
                                                                    title={mat?.material_name ?? ''}
                                                                >
                                                                    {mat?.material_name ?? '-'}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-sm text-foreground">
                                                            <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                                {item.qty}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                        <TableFooter className="bg-muted/50 border-t border-border font-medium">
                                            <TableRow className="hover:bg-transparent">
                                                <TableCell
                                                    colSpan={2}
                                                    className="text-right text-xs font-semibold uppercase tracking-wider"
                                                >
                                                    Total Unit Dikembalikan:
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-sm text-primary">
                                                    {totalQty}
                                                </TableCell>
                                            </TableRow>
                                        </TableFooter>
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
