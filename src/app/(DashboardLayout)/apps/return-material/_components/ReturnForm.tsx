'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import CardBox from '@/app/components/shared/CardBox';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
    createReturnMaterial,
    getAvailableSapOuts,
    getSapOutItemsForReturn,
} from '../_actions/return-actions';

export default function ReturnForm() {
    const _router = useRouter();
    const [loading, setLoading] = useState(false);

    const [sapOuts, setSapOuts] = useState<any[]>([]);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        sap_out_id: '',
        nik_teknisi: '',
        warehouse_id: '',
        notes: '',
    });

    const [items, setItems] = useState<any[]>([]);

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
        const selected = sapOuts.find((s) => s.id.toString() === val);
        if (!selected) return;

        setFormData({
            ...formData,
            sap_out_id: val,
            nik_teknisi: selected.nik_teknisi,
            warehouse_id: selected.warehouse_id,
        });

        // Fetch items
        const res = await getSapOutItemsForReturn(val);
        if (res.success) {
            setAvailableItems(res.data);
            setItems([]); // reset selected items
        }
    };

    const handleAddItem = () => {
        setItems([...items, { sap_out_item_id: '', designator_id: '', qty: 1, maxReturn: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...items];

        if (field === 'sap_out_item_id') {
            const selectedItem = availableItems.find((i) => i.sap_out_item_id.toString() === value);
            if (selectedItem) {
                newItems[index] = {
                    ...newItems[index],
                    sap_out_item_id: value,
                    designator_id: selectedItem.designator_id,
                    maxReturn: selectedItem.maxReturn,
                    qty: 1,
                };
            }
        } else {
            newItems[index][field] = value;

            // Validation for max
            if (field === 'qty' && value > newItems[index].maxReturn) {
                newItems[index][field] = newItems[index].maxReturn;
                toast.error(`Maximum return quantity is ${newItems[index].maxReturn}`);
            }
        }

        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.sap_out_id) {
            toast.error('Please select a transaction to return');
            return;
        }

        if (items.length === 0) {
            toast.error('Please add at least one item to return');
            return;
        }

        const invalidItems = items.filter((i) => !i.sap_out_item_id || i.qty <= 0);
        if (invalidItems.length > 0) {
            toast.error('Please check your item selections and quantities');
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                ...formData,
                items,
            };

            const res = await createReturnMaterial(payload);
            if (res.success) {
                toast.success('Return material submitted successfully!');
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
            } else {
                toast.error(res.error || 'Failed to submit return');
            }
        } catch (_err: any) {
            toast.error('An error occurred');
        } finally {
            setLoading(false);
            setIsConfirmModalOpen(false);
        }
    };

    const selectedTech = sapOuts.find((s) => s.id.toString() === formData.sap_out_id);

    return (
        <CardBox className="p-6">
            <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">
                        Return Transaction (Pengembalian Material)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Search Teknisi (Intech)</Label>
                            <SearchableSelect
                                options={sapOuts.map((s) => ({
                                    value: s.id.toString(),
                                    label: `${s.id_trx} - ${s.nik_teknisi} - ${s.nama_teknisi}`,
                                }))}
                                value={formData.sap_out_id}
                                onValueChange={handleSapOutChange}
                                placeholder="Search Teknisi yang terdapat intech"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Notes / Reason</Label>
                            <Input
                                value={formData.notes}
                                onChange={(e) =>
                                    setFormData({ ...formData, notes: e.target.value })
                                }
                                placeholder="e.g. Unused from installation"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h2 className="text-lg font-bold text-gray-900">Return Items</h2>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddItem}
                            disabled={!formData.sap_out_id}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Add Item
                        </Button>
                    </div>

                    <div className="space-y-4">
                        {items.map((item, index) => (
                            <div
                                key={index}
                                className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-gray-50/50"
                            >
                                <div className="flex-1 space-y-2">
                                    <Label>Material</Label>
                                    <Select
                                        value={item.sap_out_item_id}
                                        onValueChange={(val) =>
                                            handleItemChange(index, 'sap_out_item_id', val)
                                        }
                                    >
                                        <SelectTrigger className="bg-white">
                                            <SelectValue placeholder="Select Material" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableItems.map((ai) => (
                                                <SelectItem
                                                    key={ai.sap_out_item_id}
                                                    value={ai.sap_out_item_id.toString()}
                                                >
                                                    {ai.material_code} - {ai.material_name} (Max:{' '}
                                                    {ai.maxReturn})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="w-full sm:w-32 space-y-2">
                                    <Label>Return Qty</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max={item.maxReturn || 1}
                                        placeholder="0"
                                        value={item.qty === 0 || item.qty === '' ? '' : item.qty}
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
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => handleRemoveItem(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {items.length === 0 && (
                            <div className="text-center p-8 border border-dashed rounded-lg text-gray-500">
                                No items added yet. Click "Add Item" to select materials to return.
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button
                        type="submit"
                        disabled={loading || items.length === 0}
                        className="w-full sm:w-auto"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Review & Submit Return
                    </Button>
                </div>
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
                    <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md border">
                        <div>
                            <span className="text-gray-500 block mb-1">Transaksi SAP Out:</span>
                            <span className="font-medium">{selectedTech?.id_trx}</span>
                        </div>
                        <div>
                            <span className="text-gray-500 block mb-1">Teknisi:</span>
                            <span className="font-medium">
                                {selectedTech?.nama_teknisi} ({selectedTech?.nik_teknisi})
                            </span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-gray-500 block mb-1">Notes:</span>
                            <span>{formData.notes || '-'}</span>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold mb-2">Material yang Dikembalikan:</h4>
                        <div className="border rounded-md max-h-[300px] overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-[40px] text-center">No</TableHead>
                                        <TableHead>Material</TableHead>
                                        <TableHead className="text-center">Return Qty</TableHead>
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
                                            <TableRow key={idx}>
                                                <TableCell className="text-center">
                                                    {idx + 1}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {mat?.material_code} - {mat?.material_name}
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-blue-600">
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
            </ConfirmDialog>
        </CardBox>
    );
}
